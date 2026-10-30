import { createHash } from "node:crypto";

const TRACKING_PARAMS = /^(utm_|ref$|ref_src$|fbclid$|gclid$|mc_cid$|mc_eid$|source$|s$|cmpid$|guccounter$)/i;

/** Canonieke URL: zonder tracking-parameters, fragment, www. en trailing slash. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString().replace(/^http:\/\//, "https://");
  } catch {
    return raw.trim();
  }
}

export function articleId(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex").slice(0, 16);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateWords(s: string, maxWords: number): string {
  const words = s.split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : words.slice(0, maxWords).join(" ") + "…";
}

const STOPWORDS = new Set(
  "the a an and or of to in on for with by from at is are was were be its it this that as new how why what your you we our has have will can now just about into over after more than says said de het een en van voor met op in is".split(" "),
);

/** Betekenisvolle woorden uit een titel, voor het herkennen van dubbele verhalen. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[’']s\b/g, "")
      .split(/[^a-z0-9.+-]+/)
      .map((t) => t.replace(/^[.+-]+|[.+-]+$/g, ""))
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Lijken twee titels over hetzelfde verhaal te gaan? Jaccard alleen is te streng
 * voor koppen van verschillende media ("OpenAI launches GPT-6" vs "GPT-6 is here:
 * OpenAI's new model…"), dus we tellen ook gedeelde 'zeldzame' tokens zoals
 * productnamen met cijfers.
 */
export function sameStory(a: string, b: string): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  const j = jaccard(ta, tb);
  if (j >= 0.5) return true;
  let distinctive = 0;
  let shared = 0;
  for (const t of ta) {
    if (tb.has(t)) {
      shared++;
      if (/\d/.test(t) || t.length >= 8) distinctive++;
    }
  }
  return j >= 0.3 && distinctive >= 1 && shared >= 3;
}

/** Parse datums uit feeds en web search ("2026-10-30T07:00Z", RFC 822, "3 hours ago"). */
export function parseDate(raw: string | null | undefined, now = new Date()): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const rel = s.match(/^(\d+)\s+(minute|hour|day|week)s?\s+ago$/i);
  if (rel) {
    const mult = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3 }[rel[2].toLowerCase() as "minute"];
    return new Date(now.getTime() - Number(rel[1]) * mult).toISOString();
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  // Datums in de toekomst (verkeerde tijdzone in een feed) afkappen op 'nu'.
  return new Date(Math.min(t, now.getTime() + 3600e3)).toISOString();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
