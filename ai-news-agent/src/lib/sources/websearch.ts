import type { RawArticle, SourceDef } from "../types";
import type { AiClient } from "../analyze/ai-client";
import { normalizeUrl, parseDate, hostOf } from "../text";

// Zoekt recent nieuws bij bedrijven zonder RSS-feed via Claude's web search.
//
// Anti-verzinsel-regel: we nemen alleen URL's over die écht in de
// zoekresultaten van de API stonden (web_search_result-blokken). Claude mag per
// URL een korte samenvatting geven, maar kan geen artikelen of links verzinnen.

export async function collectWebSearch(
  source: SourceDef,
  ai: AiClient,
  lookbackHours: number,
  now = new Date(),
): Promise<RawArticle[]> {
  const domains = source.domains ?? [];
  const prompt = [
    `Vandaag is het ${now.toISOString().slice(0, 10)}. Zoek het belangrijkste nieuws van de afgelopen ${lookbackHours} uur`,
    `van deze organisaties: Anthropic/Claude, Meta AI, xAI (Grok) en Perplexity.`,
    `Zoek gericht naar aankondigingen, nieuwe modellen, productfuncties, onderzoek en zakelijk nieuws.`,
    `Geef daarna ALLEEN een JSON-array terug, zonder extra tekst, met per gevonden pagina:`,
    `{"url": "<exacte URL uit de zoekresultaten>", "summary": "<1-2 zinnen, alleen wat op de pagina staat>", "published": "<datum als die op de pagina staat, anders null>"}`,
    `Neem geen pagina's op die ouder lijken dan ${lookbackHours} uur. Verzin niets; laat twijfelgevallen weg.`,
  ].join("\n");

  const { text, results } = await ai.webSearch({ prompt, domains, maxUses: 6 });

  const summaries = new Map<string, { summary: string; published: string | null }>();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]) as { url?: string; summary?: string; published?: string | null }[];
      for (const r of arr) {
        if (r.url) summaries.set(normalizeUrl(r.url), { summary: String(r.summary ?? ""), published: r.published ?? null });
      }
    } catch {
      // Zonder bruikbare samenvattingen houden we alleen titels over.
    }
  }

  const out = new Map<string, RawArticle>();
  for (const r of results) {
    const key = normalizeUrl(r.url);
    if (out.has(key)) continue;
    const host = hostOf(r.url);
    if (domains.length && !domains.some((d) => host === d || host.endsWith(`.${d}`))) continue;
    const extra = summaries.get(key);
    // Datum: liefst de page_age van de zoekmachine, anders wat Claude op de pagina las.
    const publishedAt = parseDate(r.pageAge, now) ?? parseDate(extra?.published, now);
    out.set(key, {
      url: r.url,
      title: r.title,
      sourceId: source.id,
      sourceName: sourceNameForHost(host),
      tier: "official",
      publishedAt,
      excerpt: extra?.summary ?? "",
    });
  }
  return [...out.values()];
}

function sourceNameForHost(host: string): string {
  if (host.endsWith("anthropic.com") || host.endsWith("claude.com")) return "Anthropic";
  if (host.endsWith("meta.com") || host.endsWith("fb.com")) return "Meta AI";
  if (host.endsWith("x.ai")) return "xAI";
  if (host.endsWith("perplexity.ai")) return "Perplexity";
  return host;
}
