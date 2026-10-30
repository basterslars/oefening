import "server-only";
import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { FileType } from "@/lib/types";
import { decodeXml, htmlToSegments, markdownToSegments, type Segment } from "./text";

export interface ExtractResult {
  segments: Segment[];
  pageCount: number | null;
  warnings: string[];
}

const MAX_SHEET_ROWS = 3000;

export async function extractDocument(buf: Uint8Array, type: FileType): Promise<ExtractResult> {
  switch (type) {
    case "pdf":
      return extractPdf(buf);
    case "docx":
      return extractDocx(buf);
    case "pptx":
      return extractPptx(buf);
    case "xlsx":
      return extractXlsx(buf);
    case "md":
      return { segments: markdownToSegments(new TextDecoder().decode(buf)), pageCount: null, warnings: [] };
    case "txt":
    case "csv":
      return {
        segments: [{ location: null, heading: null, text: new TextDecoder().decode(buf) }],
        pageCount: null,
        warnings: [],
      };
  }
}

async function extractPdf(buf: Uint8Array): Promise<ExtractResult> {
  const pdf = await getDocumentProxy(buf);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const segments = text
    .map((t, i) => ({ location: `p. ${i + 1}`, heading: null, text: t.replace(/[ \t]+\n/g, "\n").trim() }))
    .filter((s) => s.text.length > 0);
  const warnings: string[] = [];
  const chars = segments.reduce((n, s) => n + s.text.length, 0);
  if (chars < 50 * Math.max(1, totalPages) * 0.2) {
    warnings.push(
      "Er is weinig of geen tekst gevonden. Mogelijk is dit een gescande PDF (afbeeldingen); tekstherkenning (OCR) wordt niet ondersteund.",
    );
  }
  return { segments, pageCount: totalPages, warnings };
}

async function extractDocx(buf: Uint8Array): Promise<ExtractResult> {
  const { value: html, messages } = await mammoth.convertToHtml({ buffer: Buffer.from(buf) });
  const warnings = messages.filter((m) => m.type === "error").map((m) => m.message);
  return { segments: htmlToSegments(html), pageCount: null, warnings };
}

function numberedEntries(zip: JSZip, re: RegExp): { n: number; path: string }[] {
  return Object.keys(zip.files)
    .map((p) => {
      const m = p.match(re);
      return m ? { n: Number(m[1]), path: p } : null;
    })
    .filter((x): x is { n: number; path: string } => x !== null)
    .sort((a, b) => a.n - b.n);
}

/** Tekst per alinea (<a:p>) uit DrawingML-XML. */
function drawingMlParagraphs(xml: string): string[] {
  const paras: string[] = [];
  for (const p of xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) ?? []) {
    const runs = [...p.matchAll(/<a:t(?: [^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    const line = runs.join("").trim();
    if (line) paras.push(line);
  }
  return paras;
}

async function extractPptx(buf: Uint8Array): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(buf);
  const slides = numberedEntries(zip, /^ppt\/slides\/slide(\d+)\.xml$/);
  const notes = new Map(
    numberedEntries(zip, /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/).map((e) => [e.n, e.path] as const),
  );
  const segments: Segment[] = [];
  for (const s of slides) {
    const xml = await zip.file(s.path)!.async("string");
    const paras = drawingMlParagraphs(xml);
    // Sprekersnotities bevatten vaak de echte uitleg; neem ze mee.
    const rels = await zip.file(s.path.replace("slides/", "slides/_rels/") + ".rels")?.async("string");
    const noteTarget = rels?.match(/notesSlide(\d+)\.xml/);
    const notePath = noteTarget ? notes.get(Number(noteTarget[1])) : undefined;
    let noteText = "";
    if (notePath) {
      const nxml = await zip.file(notePath)!.async("string");
      noteText = drawingMlParagraphs(nxml)
        .filter((l) => !/^\d+$/.test(l))
        .join("\n");
    }
    const text = [paras.join("\n"), noteText ? `Notities: ${noteText}` : ""].filter(Boolean).join("\n");
    if (text.trim()) segments.push({ location: `slide ${s.n}`, heading: paras[0]?.slice(0, 120) ?? null, text });
  }
  return { segments, pageCount: slides.length, warnings: [] };
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

/** 0.9258999999999999 → 0.9259 (afrondingsruis van floating point weghalen). */
function formatCellNumber(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) && /\.\d{7,}/.test(v) ? String(Number(n.toPrecision(10))) : v;
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function extractXlsx(buf: Uint8Array): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(buf);
  const warnings: string[] = [];
  const sharedXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  const shared = (sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) =>
    [...si.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join(""),
  );
  const workbook = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const relsXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  // Attribuutvolgorde verschilt per programma (Excel, LibreOffice, openpyxl): los uitlezen
  const rels = new Map([...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: decodeXml(attr(m[0], "name") ?? "blad"),
    path: "xl/" + (rels.get(attr(m[0], "r:id")) ?? "").replace(/^\/?xl\//, ""),
  }));
  const segments: Segment[] = [];
  for (const sheet of sheets) {
    const xml = await zip.file(sheet.path)?.async("string");
    if (!xml) continue;
    const lines: string[] = [];
    const rows = xml.match(/<row[ >][\s\S]*?<\/row>/g) ?? [];
    for (const row of rows.slice(0, MAX_SHEET_ROWS)) {
      const cells: string[] = [];
      for (const c of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = c.match(/ r="([A-Z]+\d+)"/)?.[1];
        const t = c.match(/ t="([^"]+)"/)?.[1];
        const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const f = c.match(/<f>([\s\S]*?)<\/f>/)?.[1];
        let val = "";
        if (t === "s" && v !== undefined) val = shared[Number(v)] ?? "";
        else if (t === "inlineStr") val = [...c.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join("");
        else if (v !== undefined && v !== "") val = formatCellNumber(decodeXml(v));
        if (f) val = `${val} (=${decodeXml(f)})`;
        if (ref && val !== "") cells[colIndex(ref)] = val;
      }
      const line = Array.from(cells, (c) => c ?? "").join(" | ").replace(/( \| )+$/, "");
      if (line.trim()) lines.push(line);
    }
    if (rows.length > MAX_SHEET_ROWS) {
      warnings.push(`Blad "${sheet.name}": alleen de eerste ${MAX_SHEET_ROWS} van ${rows.length} rijen zijn ingelezen.`);
    }
    if (lines.length) segments.push({ location: `blad ${sheet.name}`, heading: sheet.name, text: lines.join("\n") });
  }
  return { segments, pageCount: sheets.length, warnings };
}
