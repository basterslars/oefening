"use client";

import { Box, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, CATEGORY_LABELS, CUSTOM_MODEL_ITEM, type CatalogCategory, type CatalogItem } from "@/lib/catalog";
import { useEditor } from "@/lib/editor/store";
import { polygonCentroid } from "@/lib/geometry";
import { ACCEPT, ingestFiles, UploadError } from "@/lib/media";
import { renderPreview } from "@/lib/three/previews";
import { cx, Input, Notice } from "../ui";

export const DND_CATALOG = "application/x-red-catalog";
export const DND_MODEL = "application/x-red-model";

/** Bepaalt een logische plek om een nieuw object neer te zetten */
export function defaultDropPoint() {
  const s = useEditor.getState();
  const p = s.project!;
  if (s.selection?.kind === "room") {
    const r = p.plan.rooms.find((x) => x.id === s.selection!.id);
    if (r) return polygonCentroid(r.polygon);
  }
  if (p.plan.rooms.length) return polygonCentroid(p.plan.rooms[0].polygon);
  return { x: 2, y: 2 };
}

function Preview({ item }: { item: CatalogItem }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    // Gespreid renderen zodat de UI niet hapert bij het openen van de bibliotheek
    const t = setTimeout(() => setSrc(renderPreview(item)), 0);
    return () => clearTimeout(t);
  }, [item]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-full w-full object-contain" draggable={false} />
  ) : (
    <div className="h-full w-full animate-pulse rounded bg-stone-100" />
  );
}

export function FurnitureLibrary() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CatalogCategory | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const project = useEditor((s) => s.project)!;
  const fileRef = useRef<HTMLInputElement>(null);
  const models = project.media.filter((m) => m.kind === "model");

  const list = useMemo(
    () =>
      CATALOG.filter((c) => (cat === "all" || c.category === cat) && (!q.trim() || `${c.name} ${CATEGORY_LABELS[c.category]} ${c.tags.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()))),
    [q, cat],
  );

  const add = (id: string) => useEditor.getState().addItem(id, defaultDropPoint());

  async function uploadModel(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    try {
      const assets = await ingestFiles(project.id, Array.from(files), "model");
      useEditor.getState().update((d) => d.media.push(...assets), { history: false });
    } catch (e) {
      setError(e instanceof UploadError ? e.message : String(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input placeholder="Zoek meubels…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-8 text-[13px]" aria-label="Zoek meubels" onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["all", ...Object.keys(CATEGORY_LABELS).filter((k) => k !== "eigen")] as (CatalogCategory | "all")[]).map((k) => (
            <button key={k} onClick={() => setCat(k)} className={cx("rounded-full px-2.5 py-1 text-[11px] font-medium", cat === k ? "bg-accent text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200")}>
              {k === "all" ? "Alles" : CATEGORY_LABELS[k as CatalogCategory]}
            </button>
          ))}
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
        <div className="grid grid-cols-2 gap-2">
          {list.map((c) => (
            <button
              key={c.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_CATALOG, c.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => add(c.id)}
              title={`${c.name} — klik om toe te voegen of sleep naar de plattegrond`}
              className="group flex flex-col rounded-xl border border-line bg-white p-2 text-left transition hover:border-stone-300 hover:shadow-soft"
              data-testid={`catalog-${c.id}`}
            >
              <div className="aspect-square w-full rounded-lg bg-gradient-to-b from-stone-50 to-stone-100 p-1">
                <Preview item={c} />
              </div>
              <span className="mt-1.5 truncate text-[12px] font-medium">{c.name}</span>
              <span className="text-[10.5px] tabular-nums text-muted">
                {Math.round(c.size.w * 100)} × {Math.round(c.size.d * 100)} × {Math.round(c.size.h * 100)} cm
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">Eigen 3D-modellen</span>
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
              <Upload size={12} /> GLB/GLTF
            </button>
            <input ref={fileRef} type="file" accept={ACCEPT.model} hidden onChange={(e) => (uploadModel(e.target.files), (e.target.value = ""))} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {models.length === 0 ? (
            <p className="text-[12px] text-muted">Upload een .glb-bestand (bijv. een meubel van een fabrikant). Het model wordt geschaald naar de afmetingen die u instelt. Een .gltf met losse texturen wordt niet ondersteund — gebruik .glb.</p>
          ) : (
            <div className="grid gap-1">
              {models.map((m) => (
                <button
                  key={m.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(DND_MODEL, m.id)}
                  onClick={() => useEditor.getState().addItem(CUSTOM_MODEL_ITEM.id, defaultDropPoint(), { modelAssetId: m.id, size: { w: 1, d: 1, h: 1 } })}
                  className="flex items-center gap-2 rounded-lg border border-line bg-white px-2 py-1.5 text-left text-[12px] hover:bg-stone-50"
                >
                  <Box size={14} className="text-muted" />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
