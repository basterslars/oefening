import { getCatalogItem } from "../catalog";
import { checkPlacement, findFreeSpot, snapToWall } from "../editor/collision";
import { pointInPolygon, polygonArea } from "../geometry";
import { newFurniture, nowIso, uid } from "../project";
import type { DesignVariant, FloorPlan, Project, Vec2 } from "../types";
import type { DesignContext, DesignProposal, FloorPlanAnalysis } from "./schemas";

const r2 = (v: number) => Math.round(v * 100) / 100;

export function roomOfPoint(plan: FloorPlan, p: Vec2) {
  return plan.rooms.find((r) => pointInPolygon(p, r.polygon)) ?? null;
}

/** Bouwt de context die naar de ontwerp-AI gaat: ruimtes, muren, openingen en huidige objecten */
export function buildDesignContext(project: Project, variant: DesignVariant, prompt: string, variantCount: number, selectedRoomId: string | null): DesignContext {
  const plan = project.plan;
  return {
    prompt,
    variantCount,
    selectedRoomId,
    ceilingHeight: project.ceilingHeight.value,
    rooms: plan.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      areaM2: r2(polygonArea(r.polygon)),
      polygon: r.polygon.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
      floor: variant.finishes[r.id]?.floor ?? r.floor,
      wallColor: variant.finishes[r.id]?.wallColor ?? r.wallColor,
    })),
    walls: plan.walls.map((w) => ({ a: { x: r2(w.a.x), y: r2(w.a.y) }, b: { x: r2(w.b.x), y: r2(w.b.y) }, thickness: w.thickness })),
    openings: plan.openings.flatMap((o) => {
      const w = plan.walls.find((x) => x.id === o.wallId);
      if (!w) return [];
      const l = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
      const t = o.offset / l;
      return [{ type: o.type, x: r2(w.a.x + (w.b.x - w.a.x) * t), y: r2(w.a.y + (w.b.y - w.a.y) * t), width: o.width }];
    }),
    furniture: variant.furniture.map((f) => {
      const c = getCatalogItem(f.catalogId);
      const s = f.size ?? c.size;
      return { id: f.id, catalogId: f.catalogId, name: c.name, x: r2(f.x), y: r2(f.y), rotationDeg: Math.round((f.rotation * 180) / Math.PI), w: s.w, d: s.d, roomId: roomOfPoint(plan, f)?.id ?? null };
    }),
  };
}

export interface AppliedProposal {
  variant: DesignVariant;
  added: number;
  moved: number;
  skipped: { name: string; reason: string }[];
}

/**
 * Vertaalt een AI-voorstel naar een concrete, bewerkbare ontwerpvariant.
 * Elk voorgesteld object wordt gecontroleerd: het moet binnen de opgegeven
 * ruimte liggen en mag niet door muren of andere meubels steken. Lukt dat niet
 * op de voorgestelde plek, dan wordt een nabije vrije plek gezocht; anders
 * wordt het object overgeslagen en gerapporteerd.
 */
export function applyProposal(project: Project, base: DesignVariant, proposal: DesignProposal["variants"][number]): AppliedProposal {
  const plan = project.plan;
  const removeSet = new Set(proposal.remove);
  let furniture = base.furniture.filter((f) => !removeSet.has(f.id)).map((f) => ({ ...f, id: uid("obj") }));
  // recolor verwijst naar id's van de basisvariant
  const idMap = new Map(base.furniture.filter((f) => !removeSet.has(f.id)).map((f, i) => [f.id, furniture[i].id]));
  for (const rc of proposal.recolor) {
    const nid = idMap.get(rc.itemId);
    const it = furniture.find((f) => f.id === nid);
    if (it && /^#[0-9a-f]{6}$/i.test(rc.color)) {
      it.color = rc.color;
      const cat = getCatalogItem(it.catalogId);
      if (rc.finish && cat.finishes.includes(rc.finish)) it.finish = rc.finish;
    }
  }
  const skipped: AppliedProposal["skipped"] = [];
  let added = 0;
  let moved = 0;
  for (const a of proposal.add) {
    const cat = getCatalogItem(a.catalogId);
    const room = plan.rooms.find((r) => r.id === a.roomId) ?? roomOfPoint(plan, a);
    let item = newFurniture(a.catalogId, a.x, a.y, (a.rotationDeg * Math.PI) / 180, {
      color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : cat.defaultColor,
      finish: cat.finishes.includes(a.finish) ? a.finish : cat.defaultFinish,
      source: "ai_proposal",
    });
    if (cat.layer === "wall") {
      const sw = snapToWall(item, cat.size.d, plan.walls, 1.2);
      if (!sw) {
        skipped.push({ name: cat.name, reason: "geen muur in de buurt van de voorgestelde plek" });
        continue;
      }
      item = { ...item, ...sw };
    }
    const inRoom = (p: Vec2) => !room || pointInPolygon(p, room.polygon);
    const ok = checkPlacement(item, furniture, plan.walls).ok && inRoom(item);
    if (!ok) {
      const free = findFreeSpot(item, furniture, plan.walls, inRoom);
      if (!free) {
        skipped.push({ name: cat.name, reason: "geen vrije plek zonder botsing gevonden" });
        continue;
      }
      item = free;
      moved++;
    }
    furniture.push(item);
    added++;
  }
  furniture = furniture.filter(Boolean);
  const finishes = structuredClone(base.finishes);
  for (const f of proposal.roomFinishes) {
    if (!plan.rooms.some((r) => r.id === f.roomId)) continue;
    finishes[f.roomId] = {
      ...finishes[f.roomId],
      ...(f.floor ? { floor: f.floor } : {}),
      ...(f.wallColor && /^#[0-9a-f]{6}$/i.test(f.wallColor) ? { wallColor: f.wallColor } : {}),
    };
  }
  const t = nowIso();
  return {
    variant: { id: uid("var"), name: proposal.name, style: proposal.style, description: proposal.rationale, furniture, finishes, createdAt: t, updatedAt: t },
    added,
    moved,
    skipped,
  };
}

/**
 * Zet een AI-plattegrondanalyse (genormaliseerde beeldcoördinaten) om naar
 * meters. De schaal komt uit de kalibratie van de gebruiker; anders uit
 * maatvoeringen die de AI op de tekening las (dan expliciet als schatting).
 */
export function floorPlanFromAnalysis(
  a: FloorPlanAnalysis,
  img: { widthPx: number; heightPx: number },
  calibratedPxPerMeter: number | null,
  offset: Vec2,
): { plan: Pick<FloorPlan, "walls" | "openings" | "rooms">; pxPerMeter: number | null; scaleSource: "calibration" | "ai_dimensions" | "none" } {
  let pxPerMeter = calibratedPxPerMeter;
  let scaleSource: "calibration" | "ai_dimensions" | "none" = pxPerMeter ? "calibration" : "none";
  if (!pxPerMeter) {
    const ratios = a.dimensions
      .filter((d) => d.meters > 0.3)
      .map((d) => Math.hypot((d.x2 - d.x1) * img.widthPx, (d.y2 - d.y1) * img.heightPx) / d.meters)
      .filter((v) => Number.isFinite(v) && v > 1)
      .sort((x, y) => x - y);
    if (ratios.length) {
      pxPerMeter = ratios[Math.floor(ratios.length / 2)]; // mediaan, robuust tegen uitschieters
      scaleSource = "ai_dimensions";
    }
  }
  if (!pxPerMeter) return { plan: { walls: [], openings: [], rooms: [] }, pxPerMeter: null, scaleSource };
  const toM = (x: number, y: number): Vec2 => ({ x: r2(offset.x + (x * img.widthPx) / pxPerMeter!), y: r2(offset.y + (y * img.heightPx) / pxPerMeter!) });
  const walls = a.walls
    .map((w) => ({ id: uid("wall"), a: toM(w.x1, w.y1), b: toM(w.x2, w.y2), thickness: w.exterior ? 0.25 : 0.12, source: "ai_estimate" as const }))
    .filter((w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) > 0.2);
  const openings = a.openings.flatMap((o) => {
    const p = toM(o.x, o.y);
    let best: { w: (typeof walls)[number]; t: number; d: number } | null = null;
    for (const w of walls) {
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const l2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / l2));
      const d = Math.hypot(w.a.x + dx * t - p.x, w.a.y + dy * t - p.y);
      if (d < 0.6 && (!best || d < best.d)) best = { w, t, d };
    }
    if (!best) return [];
    const l = Math.hypot(best.w.b.x - best.w.a.x, best.w.b.y - best.w.a.y);
    const width = Math.min(Math.max((o.widthNorm * img.widthPx) / pxPerMeter!, 0.5), l - 0.05);
    const offsetAlong = Math.min(Math.max(best.t * l, width / 2), l - width / 2);
    return [{ id: uid(o.type), wallId: best.w.id, type: o.type, offset: offsetAlong, width, height: o.type === "door" ? 2.1 : 1.3, sill: o.type === "door" ? 0 : 0.9, swing: 1 as const, source: "ai_estimate" as const }];
  });
  const rooms = a.rooms
    .filter((r) => r.polygon.length >= 3)
    .map((r) => ({
      id: uid("room"),
      name: r.name || "Ruimte",
      polygon: r.polygon.map((p) => toM(p.x, p.y)),
      floor: /bad|douche|toilet|wc/i.test(r.name) ? ("tiles_light" as const) : ("oak" as const),
      wallColor: "#f4f2ee",
      source: "ai_estimate" as const,
    }));
  return { plan: { walls, openings, rooms }, pxPerMeter, scaleSource };
}
