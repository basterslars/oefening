"use client";

import { jsPDF } from "jspdf";
import { formatArea, polygonArea, polygonBounds } from "../geometry";
import { activeVariant } from "../project";
import { FURNISHING_LABELS, PROPERTY_TYPE_LABELS, PROVENANCE_LABELS, type Project, type Visualization } from "../types";
import { renderPlanImage } from "./planImage";

export interface PdfOptions {
  includePlan: boolean;
  includeRooms: boolean;
  includeVariants: boolean;
  visualizationIds: string[];
  includeOriginalPhotos: boolean;
  agentName?: string;
}

/** De standaardfonts van jsPDF ondersteunen alleen WinAnsi-tekens; vervang wat daarbuiten valt */
const t = (s: string) => s.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x20-\x7e -ÿ\n]/g, "");

const INK: [number, number, number] = [28, 27, 25];
const MUTED: [number, number, number] = [111, 107, 100];
const ACCENT: [number, number, number] = [31, 58, 52];

async function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => res({ w: 4, h: 3 });
    i.src = src;
  });
}

/** Zet een (object-)URL om naar een data-URL die jsPDF kan insluiten */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
}

/**
 * Genereert een PDF-presentatie van het project (A4 liggend), volledig in de
 * browser. `getUrl` levert een URL voor een asset (lokaal of ondertekend).
 */
export async function generatePresentationPdf(p: Project, opts: PdfOptions, getUrl: (assetId: string) => Promise<string | null>): Promise<Blob> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const date = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  let page = 1;

  const footer = () => {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(t(`${p.name}${p.address ? " - " + p.address : ""}`), M, H - 8);
    doc.text(String(page), W - M, H - 8, { align: "right" });
  };
  const newPage = (title: string, subtitle?: string) => {
    doc.addPage();
    page++;
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(t(title), M, M + 6);
    doc.setFont("helvetica", "normal");
    if (subtitle) {
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text(t(subtitle), M, M + 13);
    }
    footer();
  };
  const placeImage = async (src: string, x: number, y: number, maxW: number, maxH: number) => {
    const data = await toDataUrl(src);
    const { w, h } = await imageSize(data);
    const k = Math.min(maxW / w, maxH / h);
    const fmt = data.startsWith("data:image/png") ? "PNG" : "JPEG";
    doc.addImage(data, fmt, x + (maxW - w * k) / 2, y + (maxH - h * k) / 2, w * k, h * k, undefined, "FAST");
  };

  // ---------- Omslag ----------
  const heroVis =
    p.visualizations.find((v) => v.kind === "staging" && v.favorite) ??
    p.visualizations.find((v) => opts.visualizationIds.includes(v.id)) ??
    null;
  const heroUrl = heroVis ? await getUrl(heroVis.assetId) : p.thumbnail;
  doc.setFillColor(247, 245, 241);
  doc.rect(0, 0, W, H, "F");
  if (heroUrl) await placeImage(heroUrl, W * 0.42, 0, W * 0.58, H);
  doc.setTextColor(...ACCENT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("WONINGPRESENTATIE", M, 40);
  doc.setTextColor(...INK);
  doc.setFontSize(26);
  doc.text(doc.splitTextToSize(t(p.name), W * 0.42 - M * 2), M, 54);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...MUTED);
  let y = 54 + doc.splitTextToSize(t(p.name), W * 0.42 - M * 2).length * 10 + 4;
  if (p.address) {
    doc.text(t(p.address), M, y);
    y += 7;
  }
  doc.text(t(`${PROPERTY_TYPE_LABELS[p.propertyType]}${p.totalArea ? ` · ${formatArea(p.totalArea.value)}` : ""}${p.roomCount ? ` · ${p.roomCount} kamers` : ""}`), M, y);
  y += 7;
  doc.setFontSize(9);
  doc.text(t(`Opgesteld op ${date}${opts.agentName ? ` door ${opts.agentName}` : ""}`), M, H - 20);
  doc.text(t("Virtuele inrichtingen zijn illustratief. Meubels en decoratie zijn niet aanwezig in de woning."), M, H - 14);

  // ---------- Plattegrond ----------
  const variant = activeVariant(p);
  if (opts.includePlan) {
    const img = renderPlanImage(p.plan, variant, { furniture: true, width: 2000, height: 1250 });
    if (img) {
      newPage("Plattegrond", `Ontwerpvariant: ${variant.name}`);
      await placeImage(img, M, M + 18, W - M * 2, H - M * 2 - 26);
    }
  }

  // ---------- Ruimtes ----------
  if (opts.includeRooms) {
    newPage("Ruimtes en afmetingen", "Maten met de markering AI-schatting zijn niet door de gebruiker gecontroleerd.");
    const cols = [M, M + 90, M + 130, M + 170, M + 215];
    let yy = M + 26;
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    ["Ruimte", "Breedte", "Diepte", "Oppervlakte", "Herkomst"].forEach((h, i) => doc.text(h, cols[i], yy));
    doc.setDrawColor(231, 227, 220);
    doc.line(M, yy + 2, W - M, yy + 2);
    doc.setTextColor(...INK);
    doc.setFontSize(10);
    for (const r of p.plan.rooms) {
      yy += 8;
      if (yy > H - 25) {
        newPage("Ruimtes en afmetingen (vervolg)");
        yy = M + 26;
      }
      const b = polygonBounds(r.polygon);
      doc.text(t(r.name), cols[0], yy);
      doc.text(`${b.width.toFixed(2).replace(".", ",")} m`, cols[1], yy);
      doc.text(`${b.height.toFixed(2).replace(".", ",")} m`, cols[2], yy);
      doc.text(t(formatArea(polygonArea(r.polygon))), cols[3], yy);
      doc.text(t(PROVENANCE_LABELS[r.source]), cols[4], yy);
    }
    const total = p.plan.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
    yy += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Totaal getekend", cols[0], yy);
    doc.text(t(formatArea(total)), cols[3], yy);
    doc.setFont("helvetica", "normal");
    yy += 12;
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(t(`Plafondhoogte: ${p.ceilingHeight.value.toFixed(2).replace(".", ",")} m (${PROVENANCE_LABELS[p.ceilingHeight.source].toLowerCase()}) · Staat: ${FURNISHING_LABELS[p.furnishing]}`), M, yy);
    if (p.totalArea) doc.text(t(`Opgegeven woonoppervlakte: ${formatArea(p.totalArea.value)} (${PROVENANCE_LABELS[p.totalArea.source].toLowerCase()})`), M, yy + 6);
  }

  // ---------- Visualisaties ----------
  const vis = opts.visualizationIds.map((id) => p.visualizations.find((v) => v.id === id)).filter((v): v is Visualization => !!v);
  for (const v of vis) {
    const url = await getUrl(v.assetId);
    if (!url) continue;
    const sub =
      v.origin === "ai_image"
        ? "AI-visualisatie (virtuele staging) - geen bewerkbaar 3D-model; meubels zijn digitaal toegevoegd."
        : v.origin === "uploaded"
          ? "Aangeleverde visualisatie (virtuele staging)."
          : "Render van het 3D-model met virtuele inrichting.";
    newPage(v.title, sub);
    if (v.kind === "staging" && v.beforeAssetId) {
      const before = await getUrl(v.beforeAssetId);
      const half = (W - M * 2 - 6) / 2;
      if (before) await placeImage(before, M, M + 20, half, H - M * 2 - 34);
      await placeImage(url, M + half + 6, M + 20, half, H - M * 2 - 34);
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text("Origineel", M, H - 16);
      doc.text(t("Virtueel ingericht"), M + half + 6, H - 16);
    } else await placeImage(url, M, M + 20, W - M * 2, H - M * 2 - 30);
  }

  // ---------- Originele foto's ----------
  if (opts.includeOriginalPhotos) {
    const photos = p.media.filter((m) => m.kind === "photo");
    for (let i = 0; i < photos.length; i += 4) {
      newPage("Foto's van de woning", "Originele, onbewerkte foto's");
      const cellW = (W - M * 2 - 6) / 2;
      const cellH = (H - M * 2 - 34) / 2;
      for (let j = 0; j < 4 && i + j < photos.length; j++) {
        const u = await getUrl(photos[i + j].id);
        if (u) await placeImage(u, M + (j % 2) * (cellW + 6), M + 20 + Math.floor(j / 2) * (cellH + 4), cellW, cellH);
      }
    }
  }

  // ---------- Varianten ----------
  if (opts.includeVariants && p.variants.length > 0) {
    newPage("Ontwerpvarianten");
    let yy = M + 28;
    for (const v of p.variants) {
      if (yy > H - 30) {
        newPage("Ontwerpvarianten (vervolg)");
        yy = M + 28;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...INK);
      doc.text(t(`${v.name} - ${v.style}`), M, yy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      const lines = doc.splitTextToSize(t(`${v.furniture.length} objecten${v.furniture.some((f) => f.source === "ai_proposal") ? " (deels voorgesteld door AI en goedgekeurd door de gebruiker)" : ""}. ${v.description ?? ""}`), W - M * 2);
      doc.text(lines, M, yy + 6);
      yy += 12 + lines.length * 5;
    }
  }

  return doc.output("blob");
}
