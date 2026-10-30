import type { AiClient } from "../src/lib/analyze/ai-client";

export const NOW = new Date("2026-10-30T06:30:00Z");
export const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600e3);

export function rss(items: { title: string; link: string; date: Date; description?: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Feed</title>
${items
  .map(
    (i) => `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link><pubDate>${i.date.toUTCString()}</pubDate>
<description><![CDATA[${i.description ?? "<p>Some &amp; description</p>"}]]></description></item>`,
  )
  .join("\n")}
</channel></rss>`;
}

export function atom(entries: { title: string; link: string; date: Date; content?: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Releases</title>
${entries
  .map(
    (e) => `<entry><id>${e.link}</id><updated>${e.date.toISOString()}</updated>
<link rel="alternate" type="text/html" href="${e.link}"/><title>${e.title}</title>
<content type="html">${(e.content ?? "&lt;p&gt;Release notes&lt;/p&gt;")}</content></entry>`,
  )
  .join("\n")}
</feed>`;
}

/** Nep-fetch: URL-prefix → body (string) of Error. */
export function fakeFetch(routes: Record<string, string | Error>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response("not found", { status: 404 });
    const body = routes[key];
    if (body instanceof Error) throw body;
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

export function fakeAi(jsonImpl: (prompt: string) => unknown): AiClient & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    model: "fake-model",
    prompts,
    async json({ prompt, schema }) {
      prompts.push(prompt);
      return schema.parse(jsonImpl(prompt));
    },
    async text() {
      return "## Plan\nTest";
    },
    async webSearch() {
      return { text: "[]", results: [] };
    },
  };
}
