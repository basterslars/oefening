import type { FurnitureItem, Opening, Vec2, Wall } from "./types";

export const EPS = 1e-6;

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const rotate = (a: Vec2, angle: number): Vec2 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};

export const round = (v: number, step = 0.01) => Math.round(v / step) * step;
/** Snapt naar het raster en verwijdert floating-point-ruis (1.2000000000000002 → 1.2) */
export const snapValue = (v: number, step: number) => (step > 0 ? Math.round(Math.round(v / step) * step * 1e6) / 1e6 : v);
export const snapPoint = (p: Vec2, step: number): Vec2 => ({ x: snapValue(p.x, step), y: snapValue(p.y, step) });

export const wallLength = (w: Pick<Wall, "a" | "b">) => dist(w.a, w.b);
export const wallAngle = (w: Pick<Wall, "a" | "b">) => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);

/** Projecteert punt p op segment ab. Geeft parameter t (0..1, geclampt) en het punt terug. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = add(a, scale(ab, t));
  return { t, point, distance: dist(p, point) };
}

export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2) {
  return projectOnSegment(p, a, b).distance;
}

/** Oppervlakte van een polygoon (m²), altijd positief. */
export function polygonArea(poly: Vec2[]) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  if (poly.length === 0) return { x: 0, y: 0 };
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < EPS) {
    const sx = poly.reduce((s, p) => s + p.x, 0);
    const sy = poly.reduce((s, p) => s + p.y, 0);
    return { x: sx / poly.length, y: sy / poly.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function polygonBounds(poly: Vec2[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function rectPolygon(x: number, y: number, w: number, h: number): Vec2[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/**
 * Splitst een muur in massieve stukken rond de openingen. Elk stuk heeft een
 * begin/eind langs de muur (m) en een onder/bovenkant (m boven de vloer).
 * Wordt gebruikt door de 3D-renderer om openingen uit muren te sparen.
 */
export interface WallPiece {
  from: number;
  to: number;
  bottom: number;
  top: number;
}

export function clampOpening(o: Opening, wallLen: number): { start: number; end: number } {
  const half = o.width / 2;
  const start = Math.max(0, o.offset - half);
  const end = Math.min(wallLen, o.offset + half);
  return { start, end };
}

export function wallPieces(wallLen: number, height: number, openings: Opening[]): WallPiece[] {
  const ops = openings
    .map((o) => ({ ...clampOpening(o, wallLen), o }))
    .filter((r) => r.end - r.start > EPS)
    .sort((a, b) => a.start - b.start);
  const pieces: WallPiece[] = [];
  let cursor = 0;
  for (const { start, end, o } of ops) {
    const s = Math.max(start, cursor);
    if (s - cursor > EPS) pieces.push({ from: cursor, to: s, bottom: 0, top: height });
    if (end - s > EPS) {
      const bottomTop = Math.min(o.sill, height);
      const openTop = Math.min(o.sill + o.height, height);
      if (bottomTop > EPS) pieces.push({ from: s, to: end, bottom: 0, top: bottomTop });
      if (height - openTop > EPS) pieces.push({ from: s, to: end, bottom: openTop, top: height });
    }
    cursor = Math.max(cursor, end);
  }
  if (wallLen - cursor > EPS) pieces.push({ from: cursor, to: wallLen, bottom: 0, top: height });
  return pieces;
}

/** Controleert of een opening binnen de muur past en niet overlapt met andere openingen. */
export function openingFits(o: Opening, wall: Wall, others: Opening[]) {
  const l = wallLength(wall);
  if (o.offset - o.width / 2 < -EPS || o.offset + o.width / 2 > l + EPS) return false;
  return !others.some(
    (x) => x.id !== o.id && x.wallId === o.wallId && Math.abs(x.offset - o.offset) < (x.width + o.width) / 2 - EPS,
  );
}

// ---------- Footprints & botsingsdetectie ----------

export interface Footprint {
  center: Vec2;
  halfW: number;
  halfD: number;
  rotation: number;
}

export function footprintCorners(f: Footprint): Vec2[] {
  const local = [
    { x: -f.halfW, y: -f.halfD },
    { x: f.halfW, y: -f.halfD },
    { x: f.halfW, y: f.halfD },
    { x: -f.halfW, y: f.halfD },
  ];
  return local.map((p) => add(f.center, rotate(p, f.rotation)));
}

function projectPoly(poly: Vec2[], axis: Vec2) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = dot(p, axis);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/** Separating Axis Theorem voor twee convexe polygonen. `margin` krimpt de overlap (tolerantie). */
export function convexOverlap(a: Vec2[], b: Vec2[], margin = 0.005) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const axis = normalize({ x: -(q.y - p.y), y: q.x - p.x });
      const pa = projectPoly(a, axis);
      const pb = projectPoly(b, axis);
      if (pa.max - margin <= pb.min || pb.max - margin <= pa.min) return false;
    }
  }
  return true;
}

/** Muur als rechthoek (met dikte) */
export function wallPolygon(w: Wall): Vec2[] {
  const dir = normalize(sub(w.b, w.a));
  const n = { x: -dir.y * (w.thickness / 2), y: dir.x * (w.thickness / 2) };
  return [add(w.a, n), add(w.b, n), sub(w.b, n), sub(w.a, n)];
}

export function itemFootprint(item: Pick<FurnitureItem, "x" | "y" | "rotation">, size: { w: number; d: number }): Footprint {
  return { center: { x: item.x, y: item.y }, halfW: size.w / 2, halfD: size.d / 2, rotation: item.rotation };
}

/**
 * Zoekt een snap-punt: eerst bestaande muureindpunten binnen `radius`,
 * daarna het raster.
 */
export function snapToEndpoints(p: Vec2, walls: Wall[], radius: number, exclude?: string): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = radius;
  for (const w of walls) {
    if (w.id === exclude) continue;
    for (const e of [w.a, w.b]) {
      const d = dist(p, e);
      if (d < bestD) {
        bestD = d;
        best = { ...e };
      }
    }
  }
  return best;
}

/** Hoeksnap: forceert horizontale/verticale lijnen als de hoek binnen `tolDeg` ligt. */
export function orthoSnap(from: Vec2, to: Vec2, tolDeg = 6): Vec2 {
  const d = sub(to, from);
  const angle = Math.abs((Math.atan2(d.y, d.x) * 180) / Math.PI);
  if (angle < tolDeg || angle > 180 - tolDeg) return { x: to.x, y: from.y };
  if (Math.abs(angle - 90) < tolDeg) return { x: from.x, y: to.y };
  return to;
}

export function formatMeters(v: number, digits = 2) {
  return `${v.toFixed(digits).replace(".", ",")} m`;
}

export function formatArea(v: number) {
  return `${v.toFixed(1).replace(".", ",")} m²`;
}
