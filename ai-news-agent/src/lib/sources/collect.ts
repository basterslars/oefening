import type { RawArticle, SourceDef } from "../types";
import type { AiClient } from "../analyze/ai-client";
import { collectRss, type Fetcher } from "./rss";
import { collectHackerNews } from "./hackernews";
import { collectWebSearch } from "./websearch";

export interface SourceResult {
  sourceId: string;
  name: string;
  ok: boolean;
  count: number;
  error?: string;
  skipped?: string;
}

/** Haalt alle ingeschakelde bronnen parallel op. Een kapotte bron stopt de rest niet. */
export async function collectAll(
  sources: SourceDef[],
  opts: { fetcher: Fetcher; ai: AiClient | null; lookbackHours: number; now?: Date },
): Promise<{ articles: RawArticle[]; results: SourceResult[] }> {
  const now = opts.now ?? new Date();
  const settled = await Promise.all(
    sources.map(async (source): Promise<{ articles: RawArticle[]; result: SourceResult }> => {
      try {
        let articles: RawArticle[];
        if (source.kind === "rss") articles = await collectRss(source, opts.fetcher, now);
        else if (source.kind === "hackernews") articles = await collectHackerNews(source, opts.fetcher, opts.lookbackHours, now);
        else if (source.kind === "websearch") {
          if (!opts.ai) {
            return { articles: [], result: { sourceId: source.id, name: source.name, ok: true, count: 0, skipped: "geen API-key" } };
          }
          articles = await collectWebSearch(source, opts.ai, opts.lookbackHours, now);
        } else throw new Error(`Onbekend brontype ${(source as SourceDef).kind}`);
        return { articles, result: { sourceId: source.id, name: source.name, ok: true, count: articles.length } };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { articles: [], result: { sourceId: source.id, name: source.name, ok: false, count: 0, error: msg } };
      }
    }),
  );
  return { articles: settled.flatMap((s) => s.articles), results: settled.map((s) => s.result) };
}
