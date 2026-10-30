import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, articleId, sameStory, parseDate, stripHtml, truncateWords } from "../src/lib/text";
import { parseFeed } from "../src/lib/sources/rss";
import { collectHackerNews } from "../src/lib/sources/hackernews";
import { collectWebSearch } from "../src/lib/sources/websearch";
import { getSource } from "../src/lib/sources/registry";
import { NOW, atom, fakeAi, fakeFetch, hoursAgo, rss } from "./helpers";

test("normalizeUrl verwijdert tracking, www, fragment en trailing slash", () => {
  assert.equal(
    normalizeUrl("http://www.Example.com/news/gpt-6/?utm_source=x&b=2&a=1#top"),
    "https://example.com/news/gpt-6?a=1&b=2",
  );
  assert.equal(articleId("https://example.com/a/?utm_campaign=z"), articleId("https://www.example.com/a"));
});

test("sameStory herkent hetzelfde verhaal bij verschillende media", () => {
  assert.ok(sameStory("OpenAI launches GPT-6 with native agents", "GPT-6 is here: OpenAI launches its new model with agents"));
  assert.ok(!sameStory("OpenAI launches GPT-6", "Nvidia reports record quarterly revenue"));
  assert.ok(!sameStory("Anthropic raises $5B", "Mistral raises $1B"));
});

test("parseDate begrijpt RFC 822, ISO en relatieve datums", () => {
  assert.equal(parseDate("Thu, 30 Oct 2026 05:00:00 GMT", NOW), "2026-10-30T05:00:00.000Z");
  assert.equal(parseDate("3 hours ago", NOW), "2026-10-30T03:30:00.000Z");
  assert.equal(parseDate("geen datum", NOW), null);
  assert.equal(parseDate(null, NOW), null);
});

test("stripHtml en truncateWords", () => {
  assert.equal(stripHtml("<p>Hallo&nbsp;<b>wereld</b> &amp; meer</p><script>x()</script>"), "Hallo wereld & meer");
  assert.equal(truncateWords("een twee drie vier", 2), "een twee…");
});

test("parseFeed leest RSS 2.0", () => {
  const src = getSource("techcrunch")!;
  const items = parseFeed(rss([{ title: "Anthropic &amp; Claude news", link: "https://techcrunch.com/a", date: hoursAgo(2) }]), src, NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Anthropic & Claude news");
  assert.equal(items[0].tier, "press");
  assert.equal(items[0].excerpt, "Some & description");
  assert.equal(items[0].publishedAt, hoursAgo(2).toISOString().replace(/\.\d+Z$/, ".000Z"));
});

test("parseFeed leest Atom (GitHub releases) en Reddit-posts", () => {
  const gh = parseFeed(atom([{ title: "v2.5.0", link: "https://github.com/anthropics/claude-code/releases/tag/v2.5.0", date: hoursAgo(5) }]), getSource("claude-code-releases")!, NOW);
  assert.equal(gh[0].url, "https://github.com/anthropics/claude-code/releases/tag/v2.5.0");
  assert.equal(gh[0].excerpt, "Release notes");

  const reddit = parseFeed(
    atom([{ title: "New local model beats GPT", link: "https://www.reddit.com/r/LocalLLaMA/comments/abc", date: hoursAgo(1), content: "&lt;p&gt;Benchmarks inside&lt;/p&gt; submitted by /u/someone [link] [comments]" }]),
    getSource("reddit-localllama")!,
    NOW,
  );
  assert.equal(reddit[0].excerpt, "Benchmarks inside");
  assert.equal(reddit[0].tier, "community");
});

test("collectHackerNews ontdubbelt hits over zoektermen en gebruikt discussielink als fallback", async () => {
  const hits = { hits: [
    { objectID: "1", title: "Claude does X", url: "https://anthropic.com/news/x", points: 420, created_at: hoursAgo(3).toISOString() },
    { objectID: "2", title: "Ask HN: AI tools?", url: null, points: 150, created_at: hoursAgo(4).toISOString() },
  ] };
  const items = await collectHackerNews(getSource("hackernews")!, fakeFetch({ "https://hn.algolia.com": JSON.stringify(hits) }), 24, NOW);
  assert.equal(items.length, 2);
  assert.equal(items[0].engagement, 420);
  assert.equal(items[1].url, "https://news.ycombinator.com/item?id=2");
});

test("collectWebSearch neemt alleen URL's over die echt in de zoekresultaten stonden", async () => {
  const ai = fakeAi(() => ({}));
  ai.webSearch = async () => ({
    text: 'Gevonden:\n[{"url":"https://www.anthropic.com/news/claude-x","summary":"Anthropic kondigt X aan.","published":null},{"url":"https://anthropic.com/news/verzonnen","summary":"Bestaat niet"}]',
    results: [
      { url: "https://www.anthropic.com/news/claude-x", title: "Introducing Claude X", pageAge: "2 hours ago" },
      { url: "https://evil.example.com/anthropic", title: "Buiten domein", pageAge: "1 hour ago" },
    ],
  });
  const items = await collectWebSearch(getSource("web-labs")!, ai, 24, NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Introducing Claude X");
  assert.equal(items[0].sourceName, "Anthropic");
  assert.equal(items[0].excerpt, "Anthropic kondigt X aan.");
  assert.equal(items[0].publishedAt, hoursAgo(2).toISOString());
});
