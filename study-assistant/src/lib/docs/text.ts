// Pure tekstfuncties (zonder Node-afhankelijkheden) zodat ze los te testen zijn.

export interface Segment {
  location: string | null;
  heading: string | null;
  text: string;
}

export interface Chunk {
  index: number;
  location: string | null;
  heading: string | null;
  content: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML (bv. uit mammoth) → segmenten per kop. */
export function htmlToSegments(html: string): Segment[] {
  const segments: Segment[] = [];
  let heading: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) segments.push({ location: heading ? `§ ${heading.slice(0, 80)}` : null, heading, text });
    buf = [];
  };
  // Tabellen eerst plat slaan: één regel per rij, cellen gescheiden door " | "
  const flat = html.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []).map((tr) =>
      (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map((td) => td.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join(" | "),
    );
    return rows.map((r) => `<p>${r}</p>`).join("");
  });
  const blocks = flat
    .replace(/<(p|li|h[1-6]|tr|table|ul|ol)\b/gi, "\n$&")
    .replace(/<\/(p|li|h[1-6]|tr)>/gi, "$&\n")
    .split(/\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  for (const b of blocks) {
    const h = b.match(/^<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/i);
    const text = decodeXml(
      b
        .replace(/<\/t[dh]>/gi, " | ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    )
      .replace(/( \| )+$/, "")
      .trim();
    if (!text) continue;
    if (h) {
      flush();
      heading = text;
      buf.push(text);
    } else {
      buf.push(/^<li/i.test(b) ? `• ${text}` : text);
    }
  }
  flush();
  return segments;
}

export function markdownToSegments(md: string): Segment[] {
  const segments: Segment[] = [];
  let heading: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) segments.push({ location: heading ? `§ ${heading.slice(0, 80)}` : null, heading, text });
    buf = [];
  };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^#{1,3}\s+(.+)/);
    if (h) {
      flush();
      heading = h[1].trim();
    }
    buf.push(line);
  }
  flush();
  return segments;
}

function normalize(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits een te lang stuk tekst op zinsgrenzen. */
function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > max) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function mergeLocation(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b || a === b) return a;
  const ma = a.match(/^(p\.|slide) (\d+)/);
  const mb = b.match(/^(p\.|slide) (\d+)$/);
  if (ma && mb && ma[1] === mb[1]) return `${ma[1]} ${ma[2]}–${mb[2]}`;
  return a;
}

/**
 * Deelt segmenten op in fragmenten van ~target tekens. Korte opeenvolgende
 * segmenten (bv. slides) worden samengevoegd; lange worden op alinea-/zinsgrenzen
 * gesplitst met een kleine overlap zodat context bij de grens niet verloren gaat.
 */
export function chunkSegments(segments: Segment[], target = 1400, max = 2000, overlap = 200): Chunk[] {
  const chunks: Chunk[] = [];
  let cur = "";
  let loc: string | null = null;
  let heading: string | null = null;
  const push = () => {
    const content = cur.trim();
    if (content.length >= 20) chunks.push({ index: chunks.length, location: loc, heading, content });
    cur = "";
  };
  for (const seg of segments) {
    const text = normalize(seg.text);
    if (!text) continue;
    if (cur && cur.length + text.length + 2 > target) push();
    if (!cur) {
      loc = seg.location;
      heading = seg.heading;
    } else {
      loc = mergeLocation(loc, seg.location);
    }
    if (text.length <= max - cur.length) {
      cur += (cur ? "\n\n" : "") + text;
      continue;
    }
    // Lang segment: per alinea/zin opbouwen
    const pieces = text.split(/\n{2,}/).flatMap((p) => splitLong(p, target));
    for (const piece of pieces) {
      if (cur && cur.length + piece.length + 2 > target) {
        const tail = cur.slice(-overlap);
        push();
        loc = seg.location;
        heading = seg.heading;
        const cut = tail.indexOf(" ");
        cur = cut >= 0 ? tail.slice(cut + 1) : "";
      }
      cur += (cur ? "\n\n" : "") + piece;
    }
  }
  push();
  return chunks;
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}
