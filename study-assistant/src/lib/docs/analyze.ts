// Lokale (gratis) documentanalyse: categorie en kernbegrippen zonder API-aanroep.
import type { FileType, KeyTerm } from "@/lib/types";
import type { Segment } from "./text";

export const CATEGORIES = [
  "collegeslides",
  "boek/hoofdstuk",
  "artikel",
  "samenvatting",
  "aantekeningen",
  "oefenmateriaal",
  "data/rekenmodel",
  "overig",
] as const;
export type Category = (typeof CATEGORIES)[number];

export function categorize(fileName: string, type: FileType, sample: string): Category {
  const name = fileName.toLowerCase();
  const text = sample.slice(0, 6000).toLowerCase();
  if (/(tentamen|exam|oefen|practice|opgave|exercise|quiz|werkcollege|tutorial|assignment)/.test(name)) return "oefenmateriaal";
  if (/(samenvatting|summary|summa)/.test(name)) return "samenvatting";
  if (type === "pptx" || /(slides?|lecture|hoorcollege|sheets)/.test(name)) return "collegeslides";
  if (type === "xlsx" || type === "csv") return "data/rekenmodel";
  if (/(aantekening|notes|notities)/.test(name)) return "aantekeningen";
  if (/(hoofdstuk|chapter|\bch\.?\s?\d|\bh\d+)/.test(name) || /^(hoofdstuk|chapter)\s+\d+/m.test(text)) return "boek/hoofdstuk";
  if (/(abstract|doi\.org|journal|keywords:|references)/.test(text)) return "artikel";
  if (/(vraag \d|question \d|opgave \d|exercise \d)/.test(text)) return "oefenmateriaal";
  return "overig";
}

const DEF_PATTERNS = [
  // "X is/zijn/betekent ..." en Engelse varianten, aan het begin van een zin
  /(?:^|[.!?]\s+|\n)([A-ZÀ-ſ][\p{L}\p{N}\- ()/]{1,60}?)\s+(?:is|zijn|betekent|wordt gedefinieerd als|wordt omschreven als|verwijst naar|is defined as|refers to|means|is the)\s+([^.\n]{15,240}[.])/gu,
  // "X: definitie" in opsommingen/slides
  /(?:^|\n)\s*[•\-–]?\s*([A-ZÀ-ſ][\p{L}\p{N}\- ()/]{1,50}?)\s*[:=–]\s+([^\n]{15,200})/gu,
];

const STOP_START = /^(dit|dat|deze|die|er|hij|zij|we|wij|je|u|it|this|that|there|these|they|he|she|you|what|wat|why|waarom|how|hoe|figure|figuur|tabel|table|slide|notities|notes)\b/i;
const ARTICLE = /^(de|het|een|the|a|an)\s+/i;

/** Herkent kernbegrippen: definities ("X is …") en vaak terugkerende afkortingen. */
export function extractKeyTerms(segments: Segment[], limit = 30): KeyTerm[] {
  const text = segments.map((s) => s.text).join("\n");
  const found = new Map<string, KeyTerm>();
  for (const re of DEF_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const term = m[1].trim().replace(/\s+/g, " ").replace(ARTICLE, "");
      if (term.split(" ").length > 6 || STOP_START.test(term) || term.length < 2 || /^\p{Ll}/u.test(term)) continue;
      const key = term.toLowerCase();
      if (!found.has(key)) found.set(key, { term, definition: m[2].trim() });
      if (found.size >= limit) break;
    }
  }
  // Afkortingen (WACC, CAPM, NPV …) die minstens 3× voorkomen
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9&]{1,6}\b/g)) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  const acronyms = [...counts.entries()]
    .filter(([a, n]) => n >= 3 && !/^(II|III|IV|VI|VII|VIII|IX|XI|XII|PDF|URL|HTTP|HTTPS|WWW|NB|OK|EN|OF|DE|HET)$/.test(a))
    .sort((a, b) => b[1] - a[1]);
  for (const [a] of acronyms) {
    if (found.size >= limit) break;
    if (!found.has(a.toLowerCase())) found.set(a.toLowerCase(), { term: a });
  }
  return [...found.values()].slice(0, limit);
}

/** Koppen uit het document als kandidaat-onderwerpen (alleen indicatief). */
export function headingTopics(segments: Segment[], limit = 15): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of segments) {
    const h = s.heading?.trim();
    if (!h || h.length < 3 || h.length > 100 || /^notities/i.test(h)) continue;
    const key = h.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
