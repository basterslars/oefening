"use client";

import { Copy, Download, ExternalLink, FileText, Link2, Lock, Plus, Presentation, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEditor } from "@/lib/editor/store";
import { generatePresentationPdf } from "@/lib/export/pdf";
import { assetUrl, cloudRepository, getRepository } from "@/lib/storage";
import type { ShareSettings } from "@/lib/storage/types";
import { Badge, Button, Card, Field, Input, Notice, Select, Spinner, Toggle, cx, download, slugify } from "../ui";
import { useModelUrls } from "./DesignWorkspace";
import { MediaThumb } from "./MediaThumb";

const Scene3D = dynamic(() => import("@/components/editor3d/Scene3D").then((m) => m.Scene3D), { ssr: false });

export function PresentationTab() {
  const project = useEditor((s) => s.project)!;
  const [selected, setSelected] = useState<string[]>(() => project.visualizations.map((v) => v.id));
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Presentatie & delen</h1>
            <p className="mt-1 text-sm text-muted">Bundel visualisaties, vergelijk varianten, exporteer een PDF en deel het project veilig.</p>
          </div>
          <Link href={`/projects/${project.id}/present`} target="_blank">
            <Button icon={<Presentation size={16} />}>Presentatiemodus</Button>
          </Link>
        </div>

        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Visualisaties</h2>
          <p className="mb-4 text-[13px] text-muted">Maak screenshots en voor-en-na-beelden in de 3D-weergave of via Virtual staging. Vink aan wat in de PDF komt.</p>
          {project.visualizations.length === 0 ? (
            <p className="text-sm text-muted">Nog geen visualisaties.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {project.visualizations.map((v) => {
                const asset = project.media.find((m) => m.id === v.assetId);
                if (!asset) return null;
                const on = selected.includes(v.id);
                return (
                  <div key={v.id} className={cx("overflow-hidden rounded-xl border bg-white", on ? "border-accent" : "border-line")}>
                    <MediaThumb projectId={project.id} asset={asset} className="aspect-[4/3] w-full" />
                    <div className="space-y-1.5 px-2.5 py-2">
                      <div className="truncate text-[12px] font-medium" title={v.title}>
                        {v.title}
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge tone={v.origin === "ai_image" ? "ai" : v.origin === "uploaded" ? "neutral" : "accent"}>{v.origin === "ai_image" ? "AI-visualisatie" : v.origin === "uploaded" ? "Geüpload" : "3D-render"}</Badge>
                        <span className="flex items-center gap-1">
                          <input type="checkbox" checked={on} onChange={() => setSelected(on ? selected.filter((x) => x !== v.id) : [...selected, v.id])} aria-label="Opnemen in PDF" className="accent-[#1f3a34]" />
                          <button
                            className="rounded p-1 text-muted hover:text-ink"
                            title="Downloaden"
                            onClick={async () => {
                              const b = await getRepository().getBlob(project.id, v.assetId);
                              if (b) download(b, `${slugify(v.title)}.${b.type.includes("png") ? "png" : "jpg"}`);
                            }}
                          >
                            <Download size={13} />
                          </button>
                          <button
                            className="rounded p-1 text-muted hover:text-red-700"
                            title="Verwijderen"
                            onClick={async () => {
                              if (!confirm("Visualisatie verwijderen?")) return;
                              await getRepository().deleteBlob(project.id, v.assetId);
                              useEditor.getState().update((d) => {
                                d.visualizations = d.visualizations.filter((x) => x.id !== v.id);
                                d.media = d.media.filter((m) => m.id !== v.assetId);
                              }, { history: false });
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <CompareVariants />

        <div className="grid gap-6 lg:grid-cols-2">
          <PdfCard selected={selected} />
          <ShareCard />
        </div>
      </div>
    </div>
  );
}

function CompareVariants() {
  const project = useEditor((s) => s.project)!;
  const [a, setA] = useState(project.variants[0]?.id);
  const [b, setB] = useState(project.variants[1]?.id ?? project.variants[0]?.id);
  const [show, setShow] = useState(false);
  const modelUrls = useModelUrls();
  const va = project.variants.find((v) => v.id === a) ?? null;
  const vb = project.variants.find((v) => v.id === b) ?? null;
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Interieurstijlen vergelijken</h2>
          <p className="text-[13px] text-muted">Twee ontwerpvarianten naast elkaar in 3D. Elke weergave kan apart gedraaid en gezoomd worden.</p>
        </div>
        {!show && (
          <Button size="sm" onClick={() => setShow(true)} disabled={project.plan.walls.length === 0 && project.plan.rooms.length === 0}>
            Vergelijking tonen
          </Button>
        )}
      </div>
      {show && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { v: va, set: setA, id: a },
            { v: vb, set: setB, id: b },
          ].map((side, i) => (
            <div key={i} className="space-y-2">
              <Select value={side.id} onChange={(e) => side.set(e.target.value)} aria-label={`Variant ${i + 1}`}>
                {project.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.style}
                  </option>
                ))}
              </Select>
              <div className="h-80 overflow-hidden rounded-xl border border-line">
                <Scene3D plan={project.plan} variant={side.v} ceilingHeight={project.ceilingHeight.value} showFurniture wallMode="cutaway" cameraMode="orbit" modelUrls={modelUrls} className="h-full w-full" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PdfCard({ selected }: { selected: string[] }) {
  const project = useEditor((s) => s.project)!;
  const [opts, setOpts] = useState({ includePlan: true, includeRooms: true, includeVariants: true, includeOriginalPhotos: false, agentName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const pdf = await generatePresentationPdf(project, { ...opts, visualizationIds: selected }, (id) => assetUrl(project.id, id));
      download(pdf, `${slugify(project.name)}-presentatie.pdf`);
      cloudRepository()?.logExport(project.id, "pdf", { visualizations: selected.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <FileText size={18} />
        <h2 className="font-semibold">PDF-presentatie</h2>
      </div>
      <div className="space-y-2.5">
        <Toggle checked={opts.includePlan} onChange={(v) => setOpts({ ...opts, includePlan: v })} label="Plattegrond met inrichting" />
        <Toggle checked={opts.includeRooms} onChange={(v) => setOpts({ ...opts, includeRooms: v })} label="Overzicht ruimtes en afmetingen" />
        <Toggle checked={opts.includeVariants} onChange={(v) => setOpts({ ...opts, includeVariants: v })} label="Ontwerpvarianten" />
        <Toggle checked={opts.includeOriginalPhotos} onChange={(v) => setOpts({ ...opts, includeOriginalPhotos: v })} label="Originele foto's" />
      </div>
      <Field label="Opgesteld door (optioneel)">
        <Input value={opts.agentName} onChange={(e) => setOpts({ ...opts, agentName: e.target.value })} placeholder="Naam makelaar of kantoor" />
      </Field>
      <p className="text-xs text-muted">{selected.length} visualisatie(s) geselecteerd.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <Button variant="primary" onClick={run} disabled={busy} icon={busy ? <Spinner /> : <Download size={16} />}>
        PDF genereren
      </Button>
    </Card>
  );
}

function ShareCard() {
  const project = useEditor((s) => s.project)!;
  const { mode } = useAuth();
  const repo = cloudRepository();
  const [shares, setShares] = useState<ShareSettings[] | null>(null);
  const [expires, setExpires] = useState("30");
  const [passcode, setPasscode] = useState("");
  const [photos, setPhotos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!repo) return;
    try {
      setShares(await repo.listShares(project.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [repo, project.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deellinks laden
    refresh();
  }, [refresh]);

  if (mode === "local" || !repo)
    return (
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Link2 size={18} />
          <h2 className="font-semibold">Delen via beveiligde link</h2>
        </div>
        <Notice tone="info">
          Deellinks vereisen cloudopslag (Supabase), zodat het project op een server staat waar anderen het kunnen bekijken. In lokale modus staat alles alleen in deze browser. Configureer Supabase (zie README) of gebruik de PDF-export of het projectbestand.
        </Notice>
      </Card>
    );

  const linkFor = (s: ShareSettings) => `${window.location.origin}/share/${s.token}`;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Link2 size={18} />
        <h2 className="font-semibold">Delen via beveiligde link</h2>
      </div>
      <p className="text-[13px] text-muted">Links zijn standaard niet openbaar: alleen wie de link (en eventueel de toegangscode) heeft, kan een alleen-lezen weergave openen. U kunt links op elk moment uitschakelen of verwijderen.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Geldig">
          <Select value={expires} onChange={(e) => setExpires(e.target.value)}>
            <option value="7">7 dagen</option>
            <option value="30">30 dagen</option>
            <option value="90">90 dagen</option>
            <option value="">Onbeperkt</option>
          </Select>
        </Field>
        <Field label="Toegangscode (optioneel)">
          <Input value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="bv. 4821" />
        </Field>
      </div>
      <Toggle checked={photos} onChange={setPhotos} label="Originele foto's en video's tonen" />
      <Button
        variant="primary"
        icon={<Plus size={16} />}
        onClick={async () => {
          setError(null);
          try {
            await repo.save(useEditor.getState().project!);
            await repo.createShare(project.id, { expiresAt: expires ? new Date(Date.now() + parseInt(expires) * 864e5).toISOString() : null, passcode, allowOriginalPhotos: photos });
            setPasscode("");
            refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        Deellink aanmaken
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
      {shares && shares.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {shares.map((s) => {
            const expired = s.expiresAt && Date.parse(s.expiresAt) < now;
            return (
              <li key={s.id} className="space-y-2 p-3 text-[13px]">
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-stone-50 px-2 py-1 text-[11.5px]">{linkFor(s)}</code>
                  <button
                    className="rounded p-1.5 text-muted hover:bg-stone-100 hover:text-ink"
                    title="Kopiëren"
                    onClick={() => {
                      navigator.clipboard.writeText(linkFor(s));
                      setCopied(s.id);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === s.id ? "✓" : <Copy size={14} />}
                  </button>
                  <a href={linkFor(s)} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted hover:bg-stone-100 hover:text-ink" title="Openen">
                    <ExternalLink size={14} />
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {expired ? <Badge tone="warn">Verlopen</Badge> : s.enabled ? <Badge tone="ok">Actief</Badge> : <Badge>Uitgeschakeld</Badge>}
                  {s.hasPasscode && (
                    <Badge>
                      <Lock size={10} /> Toegangscode
                    </Badge>
                  )}
                  <span>{s.expiresAt ? `tot ${new Date(s.expiresAt).toLocaleDateString("nl-NL")}` : "onbeperkt geldig"}</span>
                  {!s.allowOriginalPhotos && <span>· zonder originele foto&apos;s</span>}
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={async () => (await repo.updateShare(s.id, { enabled: !s.enabled }), refresh())}>
                    {s.enabled ? "Uitschakelen" : "Inschakelen"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={async () => confirm("Deellink definitief verwijderen?") && (await repo.deleteShare(s.id), refresh())}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
