"use client";

import { Download, Heart, ImagePlus, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AIClientError, getCapabilities, stageImage } from "@/lib/ai/client";
import type { AICapabilities } from "@/lib/ai/schemas";
import { useEditor } from "@/lib/editor/store";
import { composeSideBySide, watermark } from "@/lib/export/visuals";
import { ACCEPT, ingestFiles, UploadError } from "@/lib/media";
import { nowIso, uid } from "@/lib/project";
import { getRepository, storeAsset } from "@/lib/storage";
import type { Visualization } from "@/lib/types";
import { MediaThumb, useAssetUrl } from "../project/MediaThumb";
import { STYLES } from "../project/VariantBar";
import { Badge, Button, Card, Notice, Spinner, Textarea, Toggle, cx, download, slugify } from "../ui";
import { BeforeAfter } from "./BeforeAfter";

const LABEL = "Virtueel ingericht";

function stagingPrompt(style: string, extra: string, furnishing: string) {
  return `Virtual staging for a real estate listing. Furnish this ${furnishing === "leeg" ? "empty" : "partially furnished"} room in a ${style} interior style with realistic, appropriately scaled furniture and decor.
Keep the architecture exactly as in the photo: same walls, windows, doors, floor, ceiling, camera angle, perspective and lighting. Do not add or remove windows or doors and do not change the room's dimensions. Photorealistic. ${extra}`;
}

export function StagingTab() {
  const project = useEditor((s) => s.project)!;
  const [caps, setCaps] = useState<AICapabilities | null>(null);
  const photos = project.media.filter((m) => m.kind === "photo");
  const [photoId, setPhotoId] = useState<string | null>(photos[0]?.id ?? null);
  const [styles, setStyles] = useState<string[]>(["Scandinavisch"]);
  const [extra, setExtra] = useState("");
  const [mark, setMark] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const stagedRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCapabilities().then(setCaps);
  }, []);

  const photo = photos.find((p) => p.id === photoId) ?? null;
  const results = project.visualizations.filter((v) => v.kind === "staging" && v.beforeAssetId === photoId);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    try {
      const assets = await ingestFiles(project.id, Array.from(files), "photo");
      useEditor.getState().update((d) => void d.media.push(...assets), { history: false });
      setPhotoId(assets[0].id);
    } catch (e) {
      setError(e instanceof UploadError ? e.message : String(e));
    }
  }

  async function saveResult(blob: Blob, style: string, origin: Visualization["origin"]) {
    let out = blob;
    if (mark) out = await watermark(URL.createObjectURL(blob), LABEL);
    const asset = await storeAsset(project.id, out, "visualization", `${LABEL} – ${style}.jpg`);
    useEditor.getState().update(
      (d) => {
        d.media.push(asset);
        d.visualizations.push({ id: uid("vis"), kind: "staging", title: `${LABEL} · ${style}`, assetId: asset.id, beforeAssetId: photoId!, style, origin, createdAt: nowIso() });
      },
      { history: false },
    );
  }

  async function generate() {
    if (!photo) return;
    setError(null);
    const blob = await getRepository().getBlob(project.id, photo.id);
    if (!blob) return setError("Foto niet gevonden");
    for (const style of styles) {
      setBusy(style);
      try {
        const res = await stageImage(blob, stagingPrompt(style, extra, project.furnishing));
        await saveResult(res.blob, style, "ai_image");
      } catch (e) {
        setError(e instanceof AIClientError ? e.message : String(e));
        break;
      }
    }
    setBusy(null);
  }

  async function uploadStaged(files: FileList | null) {
    const f = files?.[0];
    if (!f || !photo) return;
    if (!["image/jpeg", "image/png"].includes(f.type)) return setError("Upload een JPG of PNG.");
    setBusy("upload");
    try {
      await saveResult(f, styles[0] ?? "Extern gestaged", "uploaded");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-xl font-semibold">Virtual staging</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Upload een foto van een lege of gedeeltelijk ingerichte kamer en maak ingerichte versies in verschillende stijlen. De originele foto blijft altijd bewaard. Resultaten zijn <strong>AI-visualisaties</strong> (2D-beelden), geen aangepast 3D-model, en worden gemarkeerd als &ldquo;{LABEL}&rdquo;.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="space-y-5 p-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium">1. Kies een foto</span>
                <button className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline" onClick={() => uploadRef.current?.click()}>
                  <ImagePlus size={13} /> Uploaden
                </button>
                <input ref={uploadRef} type="file" accept={ACCEPT.photo} multiple hidden onChange={(e) => (addPhotos(e.target.files), (e.target.value = ""))} />
              </div>
              {photos.length === 0 ? (
                <p className="text-xs text-muted">Nog geen foto&apos;s in dit project.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p) => (
                    <button key={p.id} onClick={() => setPhotoId(p.id)} className={cx("overflow-hidden rounded-lg border-2", p.id === photoId ? "border-accent" : "border-transparent")}>
                      <MediaThumb projectId={project.id} asset={p} className="aspect-square w-full" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <span className="mb-2 block text-[13px] font-medium">2. Stijlen ({styles.length})</span>
              <div className="flex flex-wrap gap-1.5">
                {STYLES.filter((s) => s !== "Eigen ontwerp").map((s) => (
                  <button key={s} onClick={() => setStyles(styles.includes(s) ? styles.filter((x) => x !== s) : [...styles, s].slice(-4))} className={cx("rounded-full px-2.5 py-1 text-[12px]", styles.includes(s) ? "bg-accent text-white" : "bg-stone-100 hover:bg-stone-200")}>
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">Maximaal 4 stijlen per keer.</p>
            </div>
            <div>
              <span className="mb-2 block text-[13px] font-medium">3. Extra wensen (optioneel)</span>
              <Textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="bv. lichte kleuren, veel planten, werkplek bij het raam" rows={2} />
            </div>
            <Toggle checked={mark} onChange={setMark} label={`Markering “${LABEL}” op beeld`} />
            {caps?.staging.available ? (
              <Button variant="ai" className="w-full" disabled={!photo || !styles.length || !!busy} onClick={generate}>
                {busy && busy !== "upload" ? <Spinner /> : <Sparkles size={16} />} {busy && busy !== "upload" ? `Bezig: ${busy}…` : `Genereer ${styles.length} versie(s)`}
              </Button>
            ) : (
              <Notice tone="info">
                <strong>AI-beeldgeneratie niet geconfigureerd.</strong> Stel <code>IMAGE_PROVIDER</code> en <code>IMAGE_API_KEY</code> in (zie README). U kunt wel een extern gestagede versie uploaden en die hier vergelijken en bewaren.
              </Notice>
            )}
            <Button className="w-full" icon={<Upload size={14} />} disabled={!photo || !!busy} onClick={() => stagedRef.current?.click()}>
              Gestagede versie uploaden
            </Button>
            <input ref={stagedRef} type="file" accept={ACCEPT.photo} hidden onChange={(e) => (uploadStaged(e.target.files), (e.target.value = ""))} />
            {error && <Notice tone="error">{error}</Notice>}
          </Card>

          <div className="space-y-4">
            {!photo ? (
              <Card className="p-10 text-center text-sm text-muted">Kies of upload een foto om te beginnen.</Card>
            ) : results.length === 0 ? (
              <Card className="overflow-hidden">
                <MediaThumb projectId={project.id} asset={photo} className="aspect-[4/3] w-full" contain />
                <p className="p-4 text-sm text-muted">Nog geen gestagede versies voor deze foto.</p>
              </Card>
            ) : (
              <>
                <FavoriteCompare photoAssetId={photo.id} results={results} />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Card className="overflow-hidden">
                    <MediaThumb projectId={project.id} asset={photo} className="aspect-[4/3] w-full" />
                    <div className="flex items-center justify-between px-3 py-2 text-[13px]">
                      <span className="font-medium">Origineel</span>
                      <Badge>Ongewijzigd</Badge>
                    </div>
                  </Card>
                  {results.map((v) => (
                    <StagedCard key={v.id} v={v} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FavoriteCompare({ photoAssetId, results }: { photoAssetId: string; results: Visualization[] }) {
  const project = useEditor((s) => s.project)!;
  const fav = results.find((r) => r.favorite) ?? results[results.length - 1];
  const before = useAssetUrl(project.id, photoAssetId);
  const after = useAssetUrl(project.id, fav.assetId);
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[13px] font-medium">Voor en na · {fav.style}</span>
        <Button
          size="sm"
          icon={<Download size={14} />}
          disabled={!before || !after}
          onClick={async () => download(await composeSideBySide(before!, after!, ["Origineel", `${LABEL} · ${fav.style}`], "Virtuele staging: meubels en decoratie zijn digitaal toegevoegd en niet aanwezig in de woning."), `${slugify(project.name)}-voor-en-na-${slugify(fav.style ?? "")}.jpg`)}
        >
          Download voor-en-na
        </Button>
      </div>
      {before && after && <BeforeAfter before={before} after={after} />}
    </Card>
  );
}

function StagedCard({ v }: { v: Visualization }) {
  const project = useEditor((s) => s.project)!;
  const asset = project.media.find((m) => m.id === v.assetId);
  const url = useAssetUrl(project.id, v.assetId);
  if (!asset) return null;
  return (
    <Card className={cx("overflow-hidden", v.favorite && "ring-2 ring-accent")}>
      <MediaThumb projectId={project.id} asset={asset} className="aspect-[4/3] w-full" />
      <div className="space-y-2 px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="truncate font-medium">{v.style}</span>
          <Badge tone={v.origin === "ai_image" ? "ai" : "neutral"}>{v.origin === "ai_image" ? "AI-visualisatie" : "Geüpload"}</Badge>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={v.favorite ? "primary" : "secondary"}
            icon={<Heart size={13} />}
            onClick={() =>
              useEditor.getState().update(
                (d) => {
                  for (const x of d.visualizations) if (x.kind === "staging" && x.beforeAssetId === v.beforeAssetId) x.favorite = x.id === v.id;
                },
                { history: false },
              )
            }
          >
            {v.favorite ? "Gekozen" : "Kies deze"}
          </Button>
          {url && (
            <Button size="sm" variant="ghost" aria-label="Downloaden" onClick={async () => download(await (await fetch(url)).blob(), `${slugify(v.title)}.jpg`)}>
              <Download size={13} />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label="Verwijderen"
            onClick={async () => {
              if (!confirm("Deze versie verwijderen?")) return;
              await getRepository().deleteBlob(project.id, v.assetId);
              useEditor.getState().update((d) => {
                d.visualizations = d.visualizations.filter((x) => x.id !== v.id);
                d.media = d.media.filter((m) => m.id !== v.assetId);
              }, { history: false });
            }}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
