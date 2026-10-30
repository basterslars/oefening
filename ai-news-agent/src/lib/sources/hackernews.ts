import type { RawArticle, SourceDef } from "../types";
import { parseDate } from "../text";
import { fetchText, type Fetcher } from "./rss";

// Officiële, gratis Hacker News-zoek-API van Algolia (geen key nodig).
// We halen populaire verhalen van de afgelopen periode op en filteren later op AI.
const QUERIES = ["AI", "LLM", "OpenAI", "Anthropic", "Claude", "GPT", "Gemini", "agent"];

interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  created_at: string;
  story_text?: string | null;
}

export async function collectHackerNews(
  source: SourceDef,
  fetcher: Fetcher,
  lookbackHours: number,
  now = new Date(),
): Promise<RawArticle[]> {
  const since = Math.floor(now.getTime() / 1000) - lookbackHours * 3600;
  const seen = new Map<string, RawArticle>();
  for (const q of QUERIES) {
    const url =
      `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=30` +
      `&query=${encodeURIComponent(q)}&numericFilters=${encodeURIComponent(`created_at_i>${since},points>=100`)}`;
    const json = JSON.parse(await fetchText(fetcher, url)) as { hits: HnHit[] };
    for (const hit of json.hits ?? []) {
      if (!hit.title || seen.has(hit.objectID)) continue;
      seen.set(hit.objectID, {
        // Ask HN e.d. hebben geen externe URL: link dan naar de discussie.
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        title: hit.title,
        sourceId: source.id,
        sourceName: source.name,
        tier: source.tier,
        publishedAt: parseDate(hit.created_at, now),
        excerpt: `${hit.points ?? 0} punten op Hacker News · discussie: https://news.ycombinator.com/item?id=${hit.objectID}`,
        engagement: hit.points ?? 0,
      });
    }
  }
  return [...seen.values()];
}
