import { polygonArea, polygonBounds, wallLength } from "../geometry";
import { PROVENANCE_LABELS, type Project } from "../types";

const num = (v: number, d = 2) => v.toFixed(d).replace(".", ",");
const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * Overzicht van ruimtes en afmetingen als CSV (puntkomma-gescheiden met
 * decimale komma, zodat het direct goed opent in een Nederlandse Excel).
 */
export function roomsCsv(p: Project): string {
  const rows: string[][] = [["Ruimte", "Oppervlakte (m²)", "Breedte (m)", "Diepte (m)", "Hoeken", "Herkomst maten"]];
  for (const r of p.plan.rooms) {
    const b = polygonBounds(r.polygon);
    rows.push([r.name, num(polygonArea(r.polygon), 1), num(b.width), num(b.height), String(r.polygon.length), PROVENANCE_LABELS[r.source]]);
  }
  const total = p.plan.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
  rows.push(["Totaal getekend", num(total, 1), "", "", "", ""]);
  rows.push([]);
  rows.push(["Plafondhoogte (m)", num(p.ceilingHeight.value), "", "", "", PROVENANCE_LABELS[p.ceilingHeight.source]]);
  if (p.totalArea) rows.push(["Opgegeven woonoppervlakte (m²)", num(p.totalArea.value, 1), "", "", "", PROVENANCE_LABELS[p.totalArea.source]]);
  rows.push([]);
  rows.push(["Muur", "Lengte (m)", "Dikte (m)", "", "", "Herkomst"]);
  p.plan.walls.forEach((w, i) => rows.push([`Muur ${i + 1}`, num(wallLength(w)), num(w.thickness), "", "", PROVENANCE_LABELS[w.source]]));
  rows.push([]);
  rows.push(["Opening", "Breedte (m)", "Hoogte (m)", "Borstwering (m)", "", "Herkomst"]);
  p.plan.openings.forEach((o, i) => rows.push([`${o.type === "door" ? "Deur" : "Raam"} ${i + 1}`, num(o.width), num(o.height), num(o.sill), "", PROVENANCE_LABELS[o.source]]));
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
