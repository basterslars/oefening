"use client";

import { CheckCircle2, Copy, FlipHorizontal, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { COLOR_SWATCHES, FINISH_LABELS, getCatalogItem } from "@/lib/catalog";
import { checkPlacement } from "@/lib/editor/collision";
import { useEditor } from "@/lib/editor/store";
import { formatArea, formatMeters, polygonArea, polygonBounds, wallLength } from "@/lib/geometry";
import { activeVariant, roomFinish } from "@/lib/project";
import { FLOOR_LABELS, FLOOR_SWATCH } from "@/lib/three/materials";
import { PROVENANCE_LABELS, type FloorMaterialId, type MaterialFinish, type Room } from "@/lib/types";
import { Badge, Button, Field, Input, MeterInput, ProvenanceBadge, Select, cx } from "../ui";

const WALL_COLORS = ["#ffffff", "#f4f2ee", "#ece6dc", "#e3ddd2", "#d6d3cc", "#c9cfc9", "#b7c2c6", "#d9c7b4", "#a8b5a2", "#8a9aa8", "#5f6b73", "#3d4246"];

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
        {aside}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange(c: string): void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((c) => (
        <button key={c} onClick={() => onChange(c)} title={c} aria-label={`Kleur ${c}`} className={cx("h-6 w-6 rounded-full border shadow-sm transition", value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-accent ring-offset-1" : "border-black/10")} style={{ background: c }} />
      ))}
      <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-dashed border-stone-400" title="Eigen kleur">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        <span className="flex h-full w-full items-center justify-center text-[10px] text-muted">+</span>
      </label>
    </div>
  );
}

export function Inspector() {
  const project = useEditor((s) => s.project)!;
  const sel = useEditor((s) => s.selection);
  const s = useEditor.getState;
  const plan = project.plan;
  const variant = activeVariant(project);

  if (!sel) return <PlanSummary />;

  if (sel.kind === "wall") {
    const w = plan.walls.find((x) => x.id === sel.id);
    if (!w) return <PlanSummary />;
    const ops = plan.openings.filter((o) => o.wallId === w.id);
    return (
      <div>
        <Section title="Muur" aside={<ProvenanceBadge source={w.source} />}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lengte">
              <MeterInput value={wallLength(w)} min={0.1} onCommit={(v) => s().setWallLength(w.id, v)} aria-label="Lengte muur" />
            </Field>
            <Field label="Dikte">
              <MeterInput value={w.thickness} min={0.03} onCommit={(v) => s().updateWall(w.id, { thickness: v })} aria-label="Dikte muur" />
            </Field>
            <Field label="Hoogte" hint={w.height ? undefined : "= plafondhoogte"}>
              <MeterInput value={w.height ?? project.ceilingHeight.value} min={0.3} onCommit={(v) => s().updateWall(w.id, { height: v })} aria-label="Hoogte muur" />
            </Field>
          </div>
          <Field label="Kleur (beide zijden)" hint="Leeg = kleur van de aangrenzende ruimte">
            <Swatches colors={WALL_COLORS} value={w.color ?? "#f4f2ee"} onChange={(c) => s().updateWall(w.id, { color: c })} />
          </Field>
          {w.color && (
            <Button size="sm" variant="ghost" onClick={() => s().updateWall(w.id, { color: undefined })}>
              Kleur van ruimte gebruiken
            </Button>
          )}
          {w.source === "ai_estimate" && <ConfirmButton onClick={() => s().updateWall(w.id, { source: "user" })} />}
          <p className="text-xs text-muted">{ops.length} opening(en) in deze muur. Sleep de ronde grepen om eindpunten te verplaatsen; aangesloten muren bewegen mee.</p>
        </Section>
        <DeleteBar />
      </div>
    );
  }

  if (sel.kind === "opening") {
    const o = plan.openings.find((x) => x.id === sel.id);
    const w = o && plan.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return <PlanSummary />;
    const l = wallLength(w);
    return (
      <div>
        <Section title={o.type === "door" ? "Deur" : "Raam"} aside={<ProvenanceBadge source={o.source} />}>
          <Field label="Type">
            <Select value={o.type} onChange={(e) => s().updateOpening(o.id, e.target.value === "door" ? { type: "door", sill: 0, height: 2.1 } : { type: "window", sill: 0.9, height: 1.3 })}>
              <option value="door">Deur</option>
              <option value="window">Raam</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Breedte">
              <MeterInput value={o.width} min={0.3} onCommit={(v) => s().updateOpening(o.id, { width: Math.min(v, l - 0.02) })} />
            </Field>
            <Field label="Hoogte">
              <MeterInput value={o.height} min={0.2} onCommit={(v) => s().updateOpening(o.id, { height: v })} />
            </Field>
            {o.type === "window" && (
              <Field label="Borstwering">
                <MeterInput value={o.sill} onCommit={(v) => s().updateOpening(o.id, { sill: v })} />
              </Field>
            )}
            <Field label="Afstand tot hoek">
              <MeterInput value={o.offset - o.width / 2} onCommit={(v) => s().updateOpening(o.id, { offset: v + o.width / 2 })} />
            </Field>
          </div>
          {o.type === "door" && (
            <Button size="sm" icon={<FlipHorizontal size={14} />} onClick={() => s().updateOpening(o.id, { swing: o.swing === -1 ? 1 : -1 })}>
              Draairichting omkeren
            </Button>
          )}
          {o.source === "ai_estimate" && <ConfirmButton onClick={() => s().updateOpening(o.id, { source: "user" })} />}
        </Section>
        <DeleteBar />
      </div>
    );
  }

  if (sel.kind === "room") {
    const r = plan.rooms.find((x) => x.id === sel.id);
    if (!r) return <PlanSummary />;
    return <RoomInspector room={r} />;
  }

  // item
  const it = variant.furniture.find((f) => f.id === sel.id);
  if (!it) return <PlanSummary />;
  const cat = getCatalogItem(it.catalogId);
  const size = it.size ?? cat.size;
  const check = checkPlacement(it, variant.furniture, plan.walls);
  const deg = Math.round(((((it.rotation * 180) / Math.PI) % 360) + 360) % 360);
  return (
    <div>
      <Section title="Object" aside={it.source === "ai_proposal" ? <Badge tone="ai">AI-voorstel</Badge> : undefined}>
        <div>
          <div className="text-sm font-medium">{cat.name}</div>
          <div className="text-xs text-muted">{cat.category === "eigen" ? "Eigen GLB/GLTF-model" : cat.name}</div>
        </div>
        {!check.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{check.wallIds.length ? "Dit object steekt door een muur." : "Dit object overlapt een ander meubel."}</p>}
        <Field label={`Rotatie · ${deg}°`}>
          <div className="flex items-center gap-2">
            <Button size="sm" aria-label="90° linksom" onClick={() => s().updateItem(it.id, { rotation: it.rotation - Math.PI / 2 })}>
              <RotateCcw size={14} />
            </Button>
            <input type="range" min={0} max={359} step={1} value={deg} onChange={(e) => s().updateItem(it.id, { rotation: (parseInt(e.target.value) * Math.PI) / 180 })} className="flex-1" aria-label="Rotatie" />
            <Button size="sm" aria-label="90° rechtsom" onClick={() => s().updateItem(it.id, { rotation: it.rotation + Math.PI / 2 })}>
              <RotateCw size={14} />
            </Button>
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          {(["w", "d", "h"] as const).map((k) => (
            <Field key={k} label={k === "w" ? "Breedte" : k === "d" ? "Diepte" : "Hoogte"}>
              <MeterInput value={size[k]} min={0.02} onCommit={(v) => s().updateItem(it.id, { size: { ...size, [k]: v } })} />
            </Field>
          ))}
        </div>
        {(cat.layer === "wall" || cat.layer === "surface") && (
          <Field label="Hoogte boven vloer">
            <MeterInput value={it.elevation} onCommit={(v) => s().updateItem(it.id, { elevation: v })} />
          </Field>
        )}
        {cat.category !== "eigen" && (
          <>
            <Field label="Kleur">
              <Swatches colors={COLOR_SWATCHES} value={it.color} onChange={(c) => s().updateItem(it.id, { color: c })} />
            </Field>
            {cat.finishes.length > 1 && (
              <Field label="Materiaal">
                <Select value={it.finish} onChange={(e) => s().updateItem(it.id, { finish: e.target.value as MaterialFinish })}>
                  {cat.finishes.map((f) => (
                    <option key={f} value={f}>
                      {FINISH_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}
        <p className="text-xs text-muted">Sneltoetsen: Q/E draaien · Ctrl+D dupliceren · Delete verwijderen</p>
      </Section>
      <div className="flex gap-2 px-4 py-3">
        <Button size="sm" icon={<Copy size={14} />} onClick={() => s().duplicateItem(it.id)}>
          Dupliceren
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => s().deleteSelection()}>
          Verwijderen
        </Button>
      </div>
    </div>
  );
}

function ConfirmButton({ onClick }: { onClick(): void }) {
  return (
    <Button size="sm" variant="secondary" icon={<CheckCircle2 size={14} />} onClick={onClick}>
      Maat gecontroleerd — bevestigen
    </Button>
  );
}

function DeleteBar() {
  return (
    <div className="px-4 py-3">
      <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => useEditor.getState().deleteSelection()}>
        Verwijderen
      </Button>
    </div>
  );
}

function RoomInspector({ room }: { room: Room }) {
  const project = useEditor((s) => s.project)!;
  const s = useEditor.getState;
  const variant = activeVariant(project);
  const fin = roomFinish(room, variant);
  const b = polygonBounds(room.polygon);
  const isRect = room.polygon.length === 4;
  const resize = (w: number, h: number) => {
    const kx = w / b.width;
    const ky = h / b.height;
    s().updateRoom(room.id, { polygon: room.polygon.map((p) => ({ x: b.minX + (p.x - b.minX) * kx, y: b.minY + (p.y - b.minY) * ky })), source: "user" });
  };
  return (
    <div>
      <Section title="Ruimte" aside={<ProvenanceBadge source={room.source} />}>
        <Field label="Naam">
          <Input key={room.id} defaultValue={room.name} onBlur={(e) => e.target.value.trim() && e.target.value !== room.name && s().updateRoom(room.id, { name: e.target.value.trim() })} onKeyDown={(e) => (e.stopPropagation(), e.key === "Enter" && (e.target as HTMLInputElement).blur())} />
        </Field>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Oppervlakte</span>
          <span className="font-medium tabular-nums">{formatArea(polygonArea(room.polygon))}</span>
        </div>
        {isRect && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Breedte">
              <MeterInput value={b.width} min={0.3} onCommit={(v) => resize(v, b.height)} />
            </Field>
            <Field label="Diepte">
              <MeterInput value={b.height} min={0.3} onCommit={(v) => resize(b.width, v)} />
            </Field>
          </div>
        )}
        <p className="text-xs text-muted">Het aanpassen van een ruimte verplaatst muren niet automatisch; pas muren apart aan of teken ze opnieuw.</p>
        {room.source === "ai_estimate" && <ConfirmButton onClick={() => s().updateRoom(room.id, { source: "user" })} />}
      </Section>
      <Section title={`Afwerking · ${variant.name}`}>
        <Field label="Vloer">
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(FLOOR_LABELS) as FloorMaterialId[]).map((f) => (
              <button key={f} onClick={() => s().setRoomFinish(room.id, { floor: f })} title={FLOOR_LABELS[f]} className={cx("flex flex-col items-center gap-1 rounded-lg p-1 text-[10px]", fin.floor === f ? "bg-accent-soft ring-1 ring-accent" : "hover:bg-stone-50")}>
                <span className="h-7 w-full rounded-md border border-black/10" style={{ background: FLOOR_SWATCH[f] }} />
                <span className="w-full truncate text-center">{FLOOR_LABELS[f]}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Wandkleur">
          <Swatches colors={WALL_COLORS} value={fin.wallColor} onChange={(c) => s().setRoomFinish(room.id, { wallColor: c })} />
        </Field>
        <p className="text-xs text-muted">Afwerkingen gelden voor de actieve ontwerpvariant, zodat u stijlen kunt vergelijken.</p>
      </Section>
      <DeleteBar />
    </div>
  );
}

function PlanSummary() {
  const project = useEditor((s) => s.project)!;
  const s = useEditor.getState;
  const plan = project.plan;
  const total = plan.rooms.reduce((a, r) => a + polygonArea(r.polygon), 0);
  return (
    <div>
      <Section title="Woning">
        <Field label="Plafondhoogte" hint={<span className="flex items-center gap-1">Herkomst: <ProvenanceBadge source={project.ceilingHeight.source} /></span>}>
          <MeterInput value={project.ceilingHeight.value} min={1.8} onCommit={(v) => s().update((d) => void (d.ceilingHeight = { value: v, source: "user" }))} />
        </Field>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Ruimtes" value={String(plan.rooms.length)} />
          <Stat label="Getekend opp." value={formatArea(total)} />
          <Stat label="Muren" value={String(plan.walls.length)} />
          <Stat label="Deuren / ramen" value={`${plan.openings.filter((o) => o.type === "door").length} / ${plan.openings.filter((o) => o.type === "window").length}`} />
        </div>
        {project.totalArea && (
          <p className="text-xs text-muted">
            Opgegeven woonoppervlakte: {formatArea(project.totalArea.value)} ({PROVENANCE_LABELS[project.totalArea.source].toLowerCase()})
            {total > 0 && Math.abs(total - project.totalArea.value) / project.totalArea.value > 0.1 && <span className="text-amber-700"> · getekende ruimtes wijken &gt;10% af</span>}
          </p>
        )}
      </Section>
      <Section title="Ruimtes">
        {plan.rooms.length === 0 ? (
          <p className="text-[13px] text-muted">Nog geen ruimtes. Gebruik het ruimte-gereedschap om een ruimte te tekenen.</p>
        ) : (
          <ul className="-mx-2">
            {plan.rooms.map((r) => (
              <li key={r.id}>
                <button onClick={() => s().select({ kind: "room", id: r.id })} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-stone-50">
                  <span className="truncate">{r.name}</span>
                  <span className="flex items-center gap-2 text-xs tabular-nums text-muted">
                    {formatArea(polygonArea(r.polygon))}
                    {r.source === "ai_estimate" && <Badge tone="ai">AI</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Legenda">
        <div className="space-y-1.5 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className="h-2 w-6 rounded bg-[#3a3833]" /> Ingevoerd / getekend
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-6 rounded border border-dashed border-ai bg-[#b9a6dc]" /> AI-schatting (nog niet bevestigd)
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-6 rounded border-2 border-red-600" /> Botsing met muur of meubel
          </div>
        </div>
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

export { formatMeters };
