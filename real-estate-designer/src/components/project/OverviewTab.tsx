"use client";

import { Download, FileDown, Layers, PencilRuler, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useEditor } from "@/lib/editor/store";
import { roomsCsv } from "@/lib/export/csv";
import { formatArea, polygonArea, polygonBounds } from "@/lib/geometry";
import { ACCEPT, ingestFiles, UploadError } from "@/lib/media";
import { exportBundle, getRepository } from "@/lib/storage";
import { FURNISHING_LABELS, PROPERTY_TYPE_LABELS, type FurnishingState, type MediaAsset, type PropertyType } from "@/lib/types";
import { Button, Card, Field, Input, MeterInput, Notice, ProvenanceBadge, Select, download, slugify } from "../ui";
import { MediaThumb } from "./MediaThumb";

export function OverviewTab({ onOpenEditor }: { onOpenEditor(): void }) {
  const project = useEditor((s) => s.project)!;
  const st = useEditor.getState;
  const total = project.plan.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Ruimtes en afmetingen</h2>
              <div className="flex gap-2">
                <Button size="sm" icon={<FileDown size={14} />} onClick={() => download(new Blob([roomsCsv(project)], { type: "text/csv;charset=utf-8" }), `${slugify(project.name)}-ruimtes.csv`)}>
                  Exporteer CSV
                </Button>
                <Button size="sm" variant="primary" icon={<PencilRuler size={14} />} onClick={onOpenEditor}>
                  Plattegrond bewerken
                </Button>
              </div>
            </div>
            {project.plan.rooms.length === 0 ? (
              <p className="text-sm text-muted">Nog geen ruimtes getekend.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[12px] text-muted">
                      <th className="py-2 font-medium">Ruimte</th>
                      <th className="py-2 text-right font-medium">Breedte</th>
                      <th className="py-2 text-right font-medium">Diepte</th>
                      <th className="py-2 text-right font-medium">Oppervlakte</th>
                      <th className="py-2 pl-4 font-medium">Herkomst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.plan.rooms.map((r) => {
                      const b = polygonBounds(r.polygon);
                      return (
                        <tr key={r.id} className="border-b border-line/60 last:border-0">
                          <td className="py-2">{r.name}</td>
                          <td className="py-2 text-right tabular-nums">{b.width.toFixed(2).replace(".", ",")} m</td>
                          <td className="py-2 text-right tabular-nums">{b.height.toFixed(2).replace(".", ",")} m</td>
                          <td className="py-2 text-right tabular-nums">{formatArea(polygonArea(r.polygon))}</td>
                          <td className="py-2 pl-4">
                            <ProvenanceBadge source={r.source} />
                          </td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="pt-3 font-medium">Totaal getekend</td>
                      <td />
                      <td />
                      <td className="pt-3 text-right font-medium tabular-nums">{formatArea(total)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {project.totalArea && total > 0 && Math.abs(total - project.totalArea.value) / project.totalArea.value > 0.1 && (
              <Notice tone="warn" className="mt-4">
                De getekende ruimtes ({formatArea(total)}) wijken meer dan 10% af van de opgegeven woonoppervlakte ({formatArea(project.totalArea.value)}). Controleer de maten. Let op: de gebruiksoppervlakte volgens NEN 2580 telt o.a. ruimtes onder 1,5 m hoogte niet mee.
              </Notice>
            )}
          </Card>
          <MediaSection />
        </div>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Woninggegevens</h2>
            <Field label="Adres">
              <Input key={project.address} defaultValue={project.address} onBlur={(e) => e.target.value !== project.address && st().update((d) => void (d.address = e.target.value.trim()), { history: false })} placeholder="Straat, huisnummer, plaats" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type woning">
                <Select value={project.propertyType} onChange={(e) => st().update((d) => void (d.propertyType = e.target.value as PropertyType), { history: false })}>
                  {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Staat">
                <Select value={project.furnishing} onChange={(e) => st().update((d) => void (d.furnishing = e.target.value as FurnishingState), { history: false })}>
                  {Object.entries(FURNISHING_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Aantal kamers">
                <Input type="number" min={0} key={String(project.roomCount)} defaultValue={project.roomCount ?? ""} onBlur={(e) => st().update((d) => void (d.roomCount = e.target.value ? parseInt(e.target.value) : null), { history: false })} />
              </Field>
              <Field label="Woonoppervlakte" hint={project.totalArea ? <ProvenanceBadge source={project.totalArea.source} /> : "Niet ingevoerd"}>
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    key={String(project.totalArea?.value)}
                    defaultValue={project.totalArea?.value ?? ""}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value.replace(",", "."));
                      st().update((d) => void (d.totalArea = v > 0 ? { value: v, source: "user" } : null), { history: false });
                    }}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">m²</span>
                </div>
              </Field>
            </div>
            <Field label="Plafondhoogte" hint={<span className="inline-flex items-center gap-1">Herkomst: <ProvenanceBadge source={project.ceilingHeight.source} /></span>}>
              <MeterInput value={project.ceilingHeight.value} min={1.8} onCommit={(v) => st().update((d) => void (d.ceilingHeight = { value: v, source: "user" }))} />
            </Field>
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Projectbestand</h2>
            <p className="text-[13px] text-muted">Download het volledige project (plattegrond, varianten, foto&apos;s en visualisaties) als bestand. Handig als back-up of om over te zetten naar een ander apparaat.</p>
            <Button size="sm" icon={<Download size={14} />} onClick={async () => download(await exportBundle(project), `${slugify(project.name)}.realestate.json`)}>
              Download projectbestand
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

const GROUPS: { kind: MediaAsset["kind"]; title: string; accept?: string; uploadKind?: "photo" | "floorplan" | "video" }[] = [
  { kind: "photo", title: "Originele foto's", accept: ACCEPT.photo, uploadKind: "photo" },
  { kind: "floorplan", title: "Plattegronden", accept: ACCEPT.floorplan, uploadKind: "floorplan" },
  { kind: "video", title: "Video's", accept: ACCEPT.video, uploadKind: "video" },
  { kind: "visualization", title: "Visualisaties" },
];

function MediaSection() {
  const project = useEditor((s) => s.project)!;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(kind: "photo" | "floorplan" | "video", files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const assets = await ingestFiles(project.id, Array.from(files), kind);
      useEditor.getState().update((d) => void d.media.push(...assets), { history: false });
    } catch (e) {
      setError(e instanceof UploadError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: MediaAsset) {
    const used = project.plan.background?.assetId === a.id || project.visualizations.some((v) => v.assetId === a.id || v.beforeAssetId === a.id) || project.variants.some((v) => v.furniture.some((f) => f.modelAssetId === a.id));
    if (!confirm(used ? `"${a.name}" wordt gebruikt (als onderlegger, visualisatie of 3D-model). Toch verwijderen?` : `"${a.name}" verwijderen?`)) return;
    await getRepository().deleteBlob(project.id, a.id);
    useEditor.getState().update(
      (d) => {
        d.media = d.media.filter((m) => m.id !== a.id);
        d.visualizations = d.visualizations.filter((v) => v.assetId !== a.id && v.beforeAssetId !== a.id);
        if (d.plan.background?.assetId === a.id) d.plan.background = null;
      },
      { history: false },
    );
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-semibold">Beeldmateriaal</h2>
      <p className="mb-4 text-[13px] text-muted">Originelen worden altijd bewaard naast bewerkte versies en visualisaties.</p>
      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}
      <div className="space-y-6">
        {GROUPS.map((g) => {
          const items = project.media.filter((m) => m.kind === g.kind);
          return (
            <div key={g.kind}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[13px] font-medium">
                  {g.title} <span className="text-muted">({items.length})</span>
                </h3>
                {g.uploadKind && (
                  <>
                    <Button size="sm" variant="ghost" icon={<Upload size={14} />} disabled={busy} onClick={() => inputs.current[g.kind]?.click()}>
                      Toevoegen
                    </Button>
                    <input ref={(el) => void (inputs.current[g.kind] = el)} type="file" multiple accept={g.accept} hidden onChange={(e) => (upload(g.uploadKind!, e.target.files), (e.target.value = ""))} />
                  </>
                )}
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted">Geen bestanden.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {items.map((a) => (
                    <div key={a.id} className="group relative overflow-hidden rounded-xl border border-line bg-white">
                      <MediaThumb projectId={project.id} asset={a} className="aspect-[4/3] w-full" />
                      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                        <span className="truncate text-[11px]" title={a.name}>
                          {a.name}
                        </span>
                        <span className="flex shrink-0">
                          {g.kind === "floorplan" && a.mime.startsWith("image/") && (
                            <button
                              title="Gebruik als onderlegger in de editor"
                              className="rounded p-1 text-muted hover:text-ink"
                              onClick={() =>
                                useEditor.getState().update((d) => {
                                  d.plan.background = { assetId: a.id, pxPerMeter: null, offset: { x: 0, y: 0 }, opacity: 0.6, widthPx: a.width ?? 1000, heightPx: a.height ?? 1000, visible: true };
                                })
                              }
                            >
                              <Layers size={13} />
                            </button>
                          )}
                          <button title="Verwijderen" className="rounded p-1 text-muted hover:text-red-700" onClick={() => remove(a)}>
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
