"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown, Download, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ACCEPT_ATTR, detectFileType, LEGACY_HINT, MAX_UPLOAD_BYTES } from "@/lib/docs/file-types";
import type { DocumentRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, Spinner } from "@/components/ui/misc";
import { cn, formatDate } from "@/lib/utils";

interface UploadState {
  name: string;
  status: "uploading" | "processing" | "done" | "error";
  message?: string;
}

const STATUS: Record<DocumentRow["status"], { label: string; tone: "neutral" | "primary" | "success" | "danger" }> = {
  uploaded: { label: "Geüpload", tone: "neutral" },
  processing: { label: "Verwerken…", tone: "primary" },
  ready: { label: "Klaar", tone: "success" },
  error: { label: "Fout", tone: "danger" },
};

async function processDocument(id: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`/api/documents/${id}/process`, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, message: json.error ?? `Fout ${res.status}` };
  const parts = [`${json.chunks} fragmenten`, json.pages ? `${json.pages} pagina's/slides` : null, json.analyzedBy === "ai" ? "AI-analyse" : "lokale analyse"].filter(Boolean);
  return { ok: true, message: parts.join(" · ") + (json.warnings?.length ? ` — let op: ${json.warnings.join(" ")}` : "") };
}

export function DocumentManager({ courseId, userId, documents }: { courseId: string; userId: string; documents: DocumentRow[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, s: Partial<UploadState>) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, ...s } : x)));

  async function handleFiles(files: FileList | File[]) {
    const list = [...files];
    const base = uploads.length;
    setUploads((u) => [...u, ...list.map((f) => ({ name: f.name, status: "uploading" as const }))]);
    const supabase = supabaseBrowser();
    // Sequentieel: voorkomt dat veel grote bestanden tegelijk de server belasten
    for (const [k, file] of list.entries()) {
      const i = base + k;
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      const type = detectFileType(file.name);
      if (!type) {
        update(i, { status: "error", message: LEGACY_HINT[ext] ?? "Bestandstype niet ondersteund (PDF, DOCX, PPTX, XLSX, TXT, MD, CSV)." });
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        update(i, { status: "error", message: "Bestand is groter dan 50 MB." });
        continue;
      }
      const id = crypto.randomUUID();
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${userId}/${courseId}/${id}-${safe}`;
      const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (up.error) {
        update(i, { status: "error", message: `Upload mislukt: ${up.error.message}` });
        continue;
      }
      const ins = await supabase.from("documents").insert({ id, course_id: courseId, name: file.name, storage_path: path, mime_type: file.type || null, size_bytes: file.size, file_type: type });
      if (ins.error) {
        await supabase.storage.from("documents").remove([path]);
        update(i, { status: "error", message: ins.error.message });
        continue;
      }
      update(i, { status: "processing" });
      router.refresh();
      const r = await processDocument(id);
      update(i, { status: r.ok ? "done" : "error", message: r.message });
      router.refresh();
    }
  }

  async function reprocess(d: DocumentRow) {
    setBusyId(d.id);
    setError(null);
    const r = await processDocument(d.id);
    if (!r.ok) setError(`${d.name}: ${r.message}`);
    setBusyId(null);
    router.refresh();
  }

  async function remove(d: DocumentRow) {
    if (!confirm(`"${d.name}" verwijderen? Bijbehorende fragmenten verdwijnen ook uit de kennisbank.`)) return;
    setBusyId(d.id);
    const supabase = supabaseBrowser();
    const del = await supabase.from("documents").delete().eq("id", d.id);
    if (del.error) setError(del.error.message);
    else await supabase.storage.from("documents").remove([d.storage_path]);
    setBusyId(null);
    router.refresh();
  }

  async function download(d: DocumentRow) {
    const { data, error } = await supabaseBrowser().storage.from("documents").createSignedUrl(d.storage_path, 60, { download: d.name });
    if (error) setError(error.message);
    else window.location.assign(data.signedUrl);
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={cn("flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors", dragging ? "border-primary bg-accent/50" : "border-border")}
      >
        <Upload className="size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Sleep bestanden hierheen</p>
        <p className="mt-0.5 text-xs text-muted-foreground">PDF, PowerPoint, Word, Excel, tekst, Markdown of CSV · max. 50 MB</p>
        <Button className="mt-3" size="sm" onClick={() => input.current?.click()}>
          Bestanden kiezen
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-1.5">
          {uploads.map((u, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              {u.status === "uploading" || u.status === "processing" ? <Spinner className="mt-0.5 text-primary" /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.name}</p>
                <p className={cn("text-xs", u.status === "error" ? "text-danger" : "text-muted-foreground")}>
                  {u.status === "uploading" ? "Uploaden…" : u.status === "processing" ? "Tekst uitlezen, indexeren en analyseren…" : u.message}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      {documents.length === 0 ? (
        <EmptyState icon={<FileText />} title="Nog geen documenten">
          Upload collegeslides, hoofdstukken, artikelen of aantekeningen. De AI-docent gebruikt alleen wat hier staat.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {documents.map((d) => (
            <li key={d.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <button className="flex max-w-full items-center gap-1 text-left text-sm font-medium hover:underline" onClick={() => setOpen(open === d.id ? null : d.id)}>
                    <span className="truncate">{d.name}</span>
                    <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open === d.id && "rotate-180")} />
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                    <Badge>{d.file_type.toUpperCase()}</Badge>
                    <Badge>{d.category}</Badge>
                    {d.page_count ? <span>{d.page_count} {d.file_type === "pptx" ? "slides" : d.file_type === "xlsx" ? "bladen" : "p."}</span> : null}
                    {d.word_count ? <span>· {d.word_count.toLocaleString("nl-NL")} woorden</span> : null}
                    <span>· {formatDate(d.created_at)}</span>
                    {d.analyzed_by === "ai" && <span>· AI-analyse</span>}
                  </div>
                  {d.error && <p className={cn("mt-1 text-xs", d.status === "error" ? "text-danger" : "text-muted-foreground")}>{d.error}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {busyId === d.id ? (
                    <Spinner className="m-2" />
                  ) : (
                    <>
                      <button title="Downloaden" aria-label="Downloaden" onClick={() => download(d)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                        <Download className="size-4" />
                      </button>
                      <button title="Opnieuw verwerken" aria-label="Opnieuw verwerken" onClick={() => reprocess(d)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                        <RefreshCw className="size-4" />
                      </button>
                      <button title="Verwijderen" aria-label="Verwijderen" onClick={() => remove(d)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {open === d.id && (
                <div className="mt-3 space-y-3 pl-7 text-sm">
                  {d.summary && <p className="text-muted-foreground">{d.summary}</p>}
                  {d.topics.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium">Onderwerpen</p>
                      <div className="flex flex-wrap gap-1">
                        {d.topics.map((t) => (
                          <Badge key={t} tone="primary">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.key_terms.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium">Kernbegrippen</p>
                      <dl className="grid gap-1.5 sm:grid-cols-2">
                        {d.key_terms.map((k) => (
                          <div key={k.term} className="rounded-md bg-muted/60 px-2 py-1">
                            <dt className="text-xs font-medium">{k.term}</dt>
                            {k.definition && <dd className="text-xs text-muted-foreground">{k.definition}</dd>}
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                  {!d.summary && d.topics.length === 0 && d.key_terms.length === 0 && <p className="text-xs text-muted-foreground">Geen analyse beschikbaar.</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
