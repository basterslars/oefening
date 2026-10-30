import { XMLParser } from "fast-xml-parser";
import type { RawArticle, SourceDef } from "../types";
import { parseDate, stripHtml, truncateWords } from "../text";

export type Fetcher = typeof fetch;

export const USER_AGENT = "Mozilla/5.0 (compatible; PersonalAINewsAgent/0.1; +https://github.com/basterslars/oefening)";

export async function fetchText(fetcher: Fetcher, url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetcher(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.5" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} voor ${url}`);
  return res.text();
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ["item", "entry", "link", "category"].includes(name),
});

type Node = string | number | { "#text"?: string; [k: string]: unknown } | undefined | null;

function text(node: Node | Node[]): string {
  if (Array.isArray(node)) return text(node[0]);
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return typeof node["#text"] === "string" || typeof node["#text"] === "number" ? String(node["#text"]) : "";
}

function atomLink(links: unknown): string {
  if (!Array.isArray(links)) return text(links as Node);
  const pick =
    links.find((l) => typeof l === "object" && l && (l["@_rel"] ?? "alternate") === "alternate") ?? links[0];
  if (typeof pick === "string") return pick;
  return (pick && typeof pick === "object" && (pick["@_href"] as string)) || text(pick as Node);
}

/** Parse RSS 2.0, RSS 1.0 (RDF) en Atom naar RawArticles. */
export function parseFeed(xml: string, source: SourceDef, now = new Date()): RawArticle[] {
  const doc = parser.parse(xml);
  const out: RawArticle[] = [];

  const rssItems: Record<string, Node>[] = doc?.rss?.channel?.item ?? doc?.["rdf:RDF"]?.item ?? [];
  for (const item of rssItems) {
    const url = atomLink(item.link) || text(item.guid);
    const title = stripHtml(text(item.title));
    if (!url || !title) continue;
    const body = text(item.description) || text(item["content:encoded"]);
    out.push({
      url: url.trim(),
      title,
      sourceId: source.id,
      sourceName: source.name,
      tier: source.tier,
      publishedAt: parseDate(text(item.pubDate) || text(item["dc:date"]), now),
      excerpt: truncateWords(stripHtml(body), 120),
    });
  }

  const entries: Record<string, Node>[] = doc?.feed?.entry ?? [];
  for (const entry of entries) {
    const url = atomLink(entry.link);
    const title = stripHtml(text(entry.title));
    if (!url || !title) continue;
    let body = stripHtml(text(entry.summary) || text(entry.content));
    // Reddit plakt "submitted by /u/x [link] [comments]" achter elke post.
    body = body.replace(/\s*submitted by\s+\/u\/\S+.*$/i, "");
    out.push({
      url: url.trim(),
      title,
      sourceId: source.id,
      sourceName: source.name,
      tier: source.tier,
      publishedAt: parseDate(text(entry.published) || text(entry.updated), now),
      excerpt: truncateWords(body, 120),
    });
  }
  return out;
}

export async function collectRss(source: SourceDef, fetcher: Fetcher, now = new Date()): Promise<RawArticle[]> {
  if (!source.url) throw new Error(`Bron ${source.id} heeft geen URL`);
  const xml = await fetchText(fetcher, source.url);
  const items = parseFeed(xml, source, now);
  if (items.length === 0 && !/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) {
    throw new Error(`Geen geldige RSS/Atom-feed op ${source.url}`);
  }
  return items;
}
