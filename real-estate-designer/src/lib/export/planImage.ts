"use client";

import { getCatalogItem } from "../catalog";
import { itemCorners } from "../editor/collision";
import { add, normalize, polygonArea, polygonBounds, polygonCentroid, sub, wallLength } from "../geometry";
import { roomFinish } from "../project";
import { FLOOR_SWATCH } from "../three/materials";
import type { DesignVariant, FloorPlan, Vec2 } from "../types";

/**
 * Tekent de plattegrond als nette 2D-afbeelding (voor PDF-export en
 * presentaties): ruimtes met naam en oppervlakte, muren, openingen,
 * maatvoering en optioneel de inrichting.
 */
export function renderPlanImage(plan: FloorPlan, variant: DesignVariant | null, opts: { width?: number; height?: number; furniture?: boolean } = {}): string | null {
  const pts: Vec2[] = [...plan.walls.flatMap((w) => [w.a, w.b]), ...plan.rooms.flatMap((r) => r.polygon)];
  if (!pts.length) return null;
  const W = opts.width ?? 1600;
  const H = opts.height ?? 1100;
  const b = polygonBounds(pts);
  const margin = 80;
  const s = Math.min((W - margin * 2) / Math.max(b.width, 0.5), (H - margin * 2) / Math.max(b.height, 0.5));
  const ox = (W - b.width * s) / 2 - b.minX * s;
  const oy = (H - b.height * s) / 2 - b.minY * s;
  const P = (p: Vec2) => ({ x: p.x * s + ox, y: p.y * s + oy });
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const path = (poly: Vec2[]) => {
    ctx.beginPath();
    poly.forEach((p, i) => {
      const q = P(p);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.closePath();
  };

  for (const r of plan.rooms) {
    path(r.polygon);
    ctx.fillStyle = FLOOR_SWATCH[roomFinish(r, variant).floor] + "55";
    ctx.fill();
  }

  if (opts.furniture && variant) {
    for (const it of variant.furniture) {
      const cat = getCatalogItem(it.catalogId);
      path(itemCorners(it));
      ctx.fillStyle = it.color + (cat.layer === "rug" ? "55" : "cc");
      ctx.fill();
      ctx.strokeStyle = "#00000044";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  for (const w of plan.walls) {
    const dir = normalize(sub(w.b, w.a));
    const n = { x: -dir.y * (w.thickness / 2), y: dir.x * (w.thickness / 2) };
    path([add(w.a, n), add(w.b, n), sub(w.b, n), sub(w.a, n)]);
    ctx.fillStyle = w.source === "ai_estimate" ? "#9b86c4" : "#2f2d29";
    ctx.fill();
  }

  for (const o of plan.openings) {
    const w = plan.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const dir = normalize(sub(w.b, w.a));
    const nn = { x: -dir.y, y: dir.x };
    const cpt = add(w.a, { x: dir.x * o.offset, y: dir.y * o.offset });
    const h = o.width / 2;
    const t = w.thickness / 2 + 0.01;
    const p1 = add(cpt, { x: -dir.x * h, y: -dir.y * h });
    const p2 = add(cpt, { x: dir.x * h, y: dir.y * h });
    path([add(p1, { x: nn.x * t, y: nn.y * t }), add(p2, { x: nn.x * t, y: nn.y * t }), add(p2, { x: -nn.x * t, y: -nn.y * t }), add(p1, { x: -nn.x * t, y: -nn.y * t })]);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#5c574e";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (o.type === "door") {
      const sw = o.swing ?? 1;
      const hinge = P(p1);
      const leaf = P(add(p1, { x: nn.x * o.width * sw, y: nn.y * o.width * sw }));
      ctx.beginPath();
      ctx.moveTo(hinge.x, hinge.y);
      ctx.lineTo(leaf.x, leaf.y);
      ctx.stroke();
    } else {
      const a = P(p1);
      const bb = P(p2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bb.x, bb.y);
      ctx.stroke();
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const r of plan.rooms) {
    const cpt = P(polygonCentroid(r.polygon));
    ctx.fillStyle = "#1c1b19";
    ctx.font = "600 20px Inter, Helvetica, Arial, sans-serif";
    ctx.fillText(r.name, cpt.x, cpt.y - 12);
    ctx.fillStyle = r.source === "ai_estimate" ? "#6b4fa0" : "#6f6b64";
    ctx.font = "16px Inter, Helvetica, Arial, sans-serif";
    ctx.fillText(`${polygonArea(r.polygon).toFixed(1).replace(".", ",")} m²${r.source === "ai_estimate" ? " (AI-schatting)" : ""}`, cpt.x, cpt.y + 12);
  }

  ctx.font = "13px Inter, Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#6f6b64";
  for (const w of plan.walls) {
    const l = wallLength(w);
    if (l * s < 70) continue;
    const mid = P({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });
    const dir = normalize(sub(w.b, w.a));
    let ang = Math.atan2(dir.y, dir.x);
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    const off = (w.thickness / 2) * s + 12;
    ctx.save();
    ctx.translate(mid.x - dir.y * off, mid.y + dir.x * off);
    ctx.rotate(ang);
    ctx.fillText(`${l.toFixed(2).replace(".", ",")} m`, 0, 0);
    ctx.restore();
  }

  // Schaalbalk
  const bar = Math.max(1, Math.round(150 / s));
  ctx.fillStyle = "#1c1b19";
  ctx.fillRect(margin, H - 40, bar * s, 4);
  ctx.textAlign = "left";
  ctx.fillText(`${bar} m`, margin + bar * s + 8, H - 38);
  return c.toDataURL("image/png");
}
