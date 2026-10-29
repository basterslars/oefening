import { getCatalogItem } from "../catalog";
import {
  convexOverlap,
  dot,
  footprintCorners,
  itemFootprint,
  normalize,
  projectOnSegment,
  sub,
  wallPolygon,
} from "../geometry";
import type { FurnitureItem, Vec2, Wall } from "../types";

export function itemSize(item: FurnitureItem) {
  return item.size ?? getCatalogItem(item.catalogId).size;
}

export function itemCorners(item: FurnitureItem) {
  return footprintCorners(itemFootprint(item, itemSize(item)));
}

export interface PlacementCheck {
  ok: boolean;
  wallIds: string[];
  itemIds: string[];
}

/**
 * Controleert of een object op deze plek kan staan zonder door muren te steken
 * of onbedoeld andere meubels te overlappen. Vloerkleden, wand-, plafond- en
 * 'surface'-objecten worden niet getoetst; stoelen mogen onder tafels.
 */
export function checkPlacement(item: FurnitureItem, others: FurnitureItem[], walls: Wall[]): PlacementCheck {
  const cat = getCatalogItem(item.catalogId);
  const result: PlacementCheck = { ok: true, wallIds: [], itemIds: [] };
  if (cat.layer !== "floor") return result;
  const corners = itemCorners(item);
  for (const w of walls) {
    if (convexOverlap(corners, wallPolygon(w), 0.01)) result.wallIds.push(w.id);
  }
  for (const o of others) {
    if (o.id === item.id) continue;
    const oc = getCatalogItem(o.catalogId);
    if (oc.layer !== "floor") continue;
    if (cat.tucksUnder?.includes(oc.shape) || oc.tucksUnder?.includes(cat.shape)) continue;
    if (convexOverlap(corners, itemCorners(o), 0.01)) result.itemIds.push(o.id);
  }
  result.ok = result.wallIds.length === 0 && result.itemIds.length === 0;
  return result;
}

/**
 * Plaatst wandobjecten (schilderij, spiegel, gordijn) tegen de dichtstbijzijnde
 * muur, met de achterkant tegen de muur aan de kant van de cursor.
 */
export function snapToWall(p: Vec2, depth: number, walls: Wall[], maxDistance = 0.8): { x: number; y: number; rotation: number } | null {
  let best: { x: number; y: number; rotation: number; d: number } | null = null;
  for (const w of walls) {
    const proj = projectOnSegment(p, w.a, w.b);
    if (proj.distance > maxDistance) continue;
    if (best && proj.distance >= best.d) continue;
    const dir = normalize(sub(w.b, w.a));
    let n = { x: -dir.y, y: dir.x };
    if (dot(sub(p, proj.point), n) < 0) n = { x: -n.x, y: -n.y };
    const off = w.thickness / 2 + depth / 2 + 0.005;
    // Voorkant (+z lokaal, = +y in plan bij rotatie 0) moet in richting n wijzen.
    const rotation = Math.atan2(n.y, n.x) - Math.PI / 2;
    best = { x: proj.point.x + n.x * off, y: proj.point.y + n.y * off, rotation, d: proj.distance };
  }
  return best ? { x: best.x, y: best.y, rotation: best.rotation } : null;
}

/**
 * Zoekt vanaf een gewenste positie een nabije vrije plek (spiraalsgewijs).
 * Wordt gebruikt bij het toevoegen van objecten en voor AI-voorstellen.
 */
export function findFreeSpot(item: FurnitureItem, others: FurnitureItem[], walls: Wall[], bounds?: (p: Vec2) => boolean): FurnitureItem | null {
  if (checkPlacement(item, others, walls).ok && (!bounds || bounds(item))) return item;
  const step = 0.1;
  for (let r = 1; r <= 30; r++) {
    const n = r * 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cand = { ...item, x: item.x + Math.cos(a) * r * step, y: item.y + Math.sin(a) * r * step };
      if ((!bounds || bounds(cand)) && checkPlacement(cand, others, walls).ok) return cand;
    }
  }
  return null;
}
