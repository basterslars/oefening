"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { CameraMode } from "@/lib/editor/store";
import { renderPlanImage } from "@/lib/export/planImage";
import { formatArea, polygonArea, polygonBounds } from "@/lib/geometry";
import { activeVariant } from "@/lib/project";
import { PROPERTY_TYPE_LABELS, type Project } from "@/lib/types";
import { BeforeAfter } from "./staging/BeforeAfter";
import { Badge, Segmented, Select, cx } from "./ui";

const Scene3D = dynamic(() => import("@/components/editor3d/Scene3D").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">3D-weergave laden…</div>,
});

/**
 * Alleen-lezen presentatie van een project: voor klantgesprekken
 * (presentatiemodus) en voor ontvangers van een beveiligde deellink.
 */
export function PresentationViewer({ project, urls }: { project: Project; urls: Record<string, string> }) {
  const [variantId, setVariantId] = useState(project.activeVariantId);
  const [camera, setCamera] = useState<CameraMode>("orbit");
  const [furnished, setFurnished] = useState(true);
  const variant = project.variants.find((v) => v.id === variantId) ?? activeVariant(project);
  const [plan, setPlan] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canvas-render na mount
    setPlan(renderPlanImage(project.plan, variant, { furniture: furnished, width: 1800, height: 1100 }));
  }, [project.plan, variant, furnished]);
  const modelUrls = useMemo(() => Object.fromEntries(project.media.filter((m) => m.kind === "model" && urls[m.id]).map((m) => [m.id, urls[m.id]])), [project.media, urls]);
  const staging = project.visualizations.filter((v) => v.kind === "staging" && urls[v.assetId] && v.beforeAssetId && urls[v.beforeAssetId]);
  const renders = project.visualizations.filter((v) => v.kind !== "staging" && urls[v.assetId]);
  const photos = project.media.filter((m) => m.kind === "photo" && urls[m.id]);
  const total = project.plan.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
  const has3d = project.plan.walls.length > 0 || project.plan.rooms.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
      <header>
        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-bronze">Woningpresentatie</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{project.name}</h1>
        <p className="mt-2 text-muted">
          {[project.address, PROPERTY_TYPE_LABELS[project.propertyType], project.totalArea ? formatArea(project.totalArea.value) : null, project.roomCount ? `${project.roomCount} kamers` : null].filter(Boolean).join(" · ")}
        </p>
      </header>

      {has3d && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-lg font-semibold">Interactief 3D-model</h2>
            {project.variants.length > 1 && (
              <Select value={variant.id} onChange={(e) => setVariantId(e.target.value)} className="h-9 w-auto py-0 text-[13px]" aria-label="Ontwerpvariant">
                {project.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.style}
                  </option>
                ))}
              </Select>
            )}
            <Segmented size="sm" value={camera} onChange={setCamera} options={[{ value: "orbit", label: "Rondom" }, { value: "top", label: "Boven" }, { value: "walk", label: "Ooghoogte" }]} />
            <Segmented size="sm" value={furnished ? "on" : "off"} onChange={(v) => setFurnished(v === "on")} options={[{ value: "on", label: "Ingericht" }, { value: "off", label: "Leeg" }]} />
          </div>
          <div className="relative h-[55vh] min-h-80 overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
            <Scene3D plan={project.plan} variant={variant} ceilingHeight={project.ceilingHeight.value} showFurniture={furnished} wallMode={camera === "walk" ? "full" : "cutaway"} cameraMode={camera} modelUrls={modelUrls} className="h-full w-full" />
            {camera === "walk" && <span className="pointer-events-none absolute bottom-3 left-3"><Badge>WASD / pijltjes om te lopen · slepen om rond te kijken</Badge></span>}
          </div>
          <p className="text-xs text-muted">De inrichting is virtueel en illustratief; meubels en decoratie zijn niet aanwezig in de woning.</p>
        </section>
      )}

      {plan && (
        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="mb-3 text-lg font-semibold">Plattegrond</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={plan} alt="Plattegrond" className="w-full rounded-2xl border border-line bg-white" />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold">Ruimtes</h2>
            <div className="rounded-2xl border border-line bg-white p-4">
              <table className="w-full text-sm">
                <tbody>
                  {project.plan.rooms.map((r) => {
                    const b = polygonBounds(r.polygon);
                    return (
                      <tr key={r.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2">
                          {r.name} {r.source === "ai_estimate" && <Badge tone="ai">AI-schatting</Badge>}
                        </td>
                        <td className="py-2 text-right text-xs tabular-nums text-muted">
                          {b.width.toFixed(1).replace(".", ",")} × {b.height.toFixed(1).replace(".", ",")} m
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatArea(polygonArea(r.polygon))}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="pt-3 font-medium">Totaal</td>
                    <td />
                    <td className="pt-3 text-right font-medium tabular-nums">{formatArea(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {staging.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Virtueel ingericht</h2>
          <p className="mb-4 text-sm text-muted">Schuif om de originele foto te vergelijken met de virtuele staging.</p>
          <div className="grid gap-6 md:grid-cols-2">
            {staging.map((v) => (
              <figure key={v.id}>
                <BeforeAfter before={urls[v.beforeAssetId!]} after={urls[v.assetId]} />
                <figcaption className="mt-2 flex items-center gap-2 text-[13px] text-muted">
                  {v.style} <Badge tone={v.origin === "ai_image" ? "ai" : "neutral"}>{v.origin === "ai_image" ? "AI-visualisatie" : "Visualisatie"}</Badge>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {renders.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Visualisaties</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {renders.map((v) => (
              <figure key={v.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[v.assetId]} alt={v.title} className="w-full" />
                <figcaption className="px-4 py-2 text-[13px] text-muted">{v.title}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Foto&apos;s</h2>
          <div className={cx("grid gap-3", photos.length > 2 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2")}>
            {photos.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={urls[m.id]} alt={m.name} className="aspect-[4/3] w-full rounded-xl object-cover" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
