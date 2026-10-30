import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDb } from "../src/lib/db";
import { DEFAULT_SETTINGS, Repo } from "../src/lib/repo";
import { runPipeline } from "../src/lib/pipeline";
import { SOURCES } from "../src/lib/sources/registry";
import type { Analysis } from "../src/lib/analyze/schema";
import { NOW, atom, fakeAi, fakeFetch, hoursAgo, rss } from "./helpers";

function setup(enabled = ["techcrunch", "verge", "openai", "claude-code-releases", "hackernews"]) {
  const repo = new Repo(createMemoryDb());
  repo.saveSettings({
    ...DEFAULT_SETTINGS,
    enabledSources: Object.fromEntries(SOURCES.map((s) => [s.id, enabled.includes(s.id)])),
  });
  return repo;
}

const routes = {
  "https://techcrunch.com": rss([
    { title: "OpenAI launches GPT-6 with native agents", link: "https://techcrunch.com/2026/10/30/gpt-6/?utm_source=rss", date: hoursAgo(3), description: "OpenAI released GPT-6 today." },
    { title: "Startup raises $40M Series B for AI bookkeeping agents", link: "https://techcrunch.com/2026/10/30/bookkeeping", date: hoursAgo(6) },
    { title: "Old news about GPT-4", link: "https://techcrunch.com/2025/01/01/old", date: hoursAgo(90) },
    { title: "Best AI gadgets deal: 40% off", link: "https://techcrunch.com/deal", date: hoursAgo(2) },
  ]),
  "https://www.theverge.com": new Error("ECONNRESET"),
  "https://openai.com": rss([{ title: "Introducing GPT-6", link: "https://openai.com/index/gpt-6", date: hoursAgo(4) }]),
  "https://github.com/anthropics/claude-code": atom([{ title: "v3.1.0", link: "https://github.com/anthropics/claude-code/releases/tag/v3.1.0", date: hoursAgo(8), content: "&lt;p&gt;Adds background subagents&lt;/p&gt;" }]),
  "https://hn.algolia.com": JSON.stringify({ hits: [
    { objectID: "9", title: "OpenAI launches GPT-6 with native agents (discussion)", url: "https://techcrunch.com/2026/10/30/gpt-6/", points: 900, created_at: hoursAgo(2).toISOString() },
    { objectID: "10", title: "Show HN: A new cooking app", url: "https://cook.example.com", points: 300, created_at: hoursAgo(2).toISOString() },
  ] }),
};

const idsIn = (prompt: string) => [...prompt.matchAll(/id=([0-9a-f]{16})/g)].map((m) => m[1]);

function analysisFor(prompt: string): Analysis {
  const ids = idsIn(prompt);
  return {
    headlines: [
      { article_ids: [ids[0], ids[1]], title: "OpenAI lanceert GPT-6", summary: "Samenvatting.", what_happened: "Release.", why_it_matters: "Belangrijk.", category: "models", status: "confirmed", relevance: 14, note: null },
      { article_ids: ["deadbeefdeadbeef"], title: "Verzonnen verhaal", summary: "x", what_happened: "x", why_it_matters: "x", category: "other", status: "rumor", relevance: 9, note: null },
      { article_ids: ids.slice(2), title: "Overige ontwikkelingen", summary: "y", what_happened: "y", why_it_matters: "y", category: "funding", status: "confirmed", relevance: 6, note: null },
    ],
    tools: [{ name: "Claude Code", what_it_does: "Coding agent", problem_solved: "Sneller bouwen", audience: "Developers", website: "https://github.com/anthropics/claude-code", pricing: "Betaald", article_ids: [ids[ids.length - 1]] }],
    opportunities: [
      { title: "Boekhoudagent voor zzp", problem: "p", audience: "zzp", ai_approach: "a", how_to_sell: "SaaS", revenue_model: "abonnement", build_difficulty: 0, commercial_potential: 8, article_ids: [] },
      { title: "Kans 2", problem: "p", audience: "a", ai_approach: "a", how_to_sell: "s", revenue_model: "r", build_difficulty: 5, commercial_potential: 5, article_ids: [] },
    ],
    development: { updates: [{ title: "Claude Code 3.1", summary: "Subagents", kind: "claude_code", article_ids: [ids[ids.length - 1]] }], build_idea: { title: "Idee", description: "d", steps: ["a", "b", "c"], why_now: "nu" } },
    explained: { topic: "Wat is een subagent?", explanation: "Uitleg", analogy: null },
    big_picture: { key_development: "GPT-6", long_term: "lang", takeaway: "onthoud" },
  };
}

test("volledige run met AI: filtert, ontdubbelt, verwijdert verzonnen bronnen en slaat op", async () => {
  const repo = setup();
  const ai = fakeAi(analysisFor);
  const res = await runPipeline({ trigger: "manual" }, { repo, fetcher: fakeFetch(routes), ai, now: () => NOW });
  assert.equal(res.status, "success", res.message);

  const n = repo.getNewsletter(res.newsletterId!)!;
  assert.equal(n.mode, "ai");
  assert.equal(n.date, "2026-10-30");
  // Prompt bevat geen oud nieuws, aanbiedingen of niet-AI HN-posts
  const prompt = ai.prompts[0];
  assert.ok(!prompt.includes("Old news about GPT-4"));
  assert.ok(!prompt.includes("40% off"));
  assert.ok(!prompt.includes("cooking app"));
  // HN-link naar hetzelfde TechCrunch-artikel is via URL-normalisatie samengevoegd
  assert.equal((prompt.match(/OpenAI launches GPT-6 with native agents/g) ?? []).length, 1);

  const titles = n.content.headlines.map((h) => h.title);
  assert.ok(!titles.includes("Verzonnen verhaal"));
  assert.ok(n.content.warnings.some((w) => w.includes("onbekende bronnen")));
  assert.ok(n.content.warnings.some((w) => w.includes("konden niet worden opgehaald")));
  const gpt = n.content.headlines.find((h) => h.title === "OpenAI lanceert GPT-6")!;
  assert.equal(gpt.relevance, 10); // 14 afgekapt
  assert.ok(gpt.sources.every((s) => s.url.startsWith("https://")));
  assert.ok(gpt.publishedAt);
  assert.equal(n.content.tools![0].websiteVerified, true);
  assert.equal(n.content.opportunities![0].buildDifficulty, 1);
  assert.equal(repo.listOpportunities().length, 2);
  assert.equal(n.content.stats.sourcesFailed, 1);

  // Run-log bevat per bron een regel
  const run = repo.listRuns(1)[0];
  assert.equal(run.status, "success");
  assert.ok(run.log.some((l) => l.message.includes("The Verge: mislukt")));

  // Tweede run dezelfde dag wordt overgeslagen
  const again = await runPipeline({ trigger: "schedule" }, { repo, fetcher: fakeFetch(routes), ai, now: () => NOW });
  assert.equal(again.status, "skipped");

  // Geforceerd opnieuw: dezelfde artikelen mogen weer gebruikt worden
  const forced = await runPipeline({ trigger: "manual", force: true }, { repo, fetcher: fakeFetch(routes), ai, now: () => NOW });
  assert.equal(forced.status, "success");
  assert.ok(repo.getNewsletter(forced.newsletterId!)!.content.headlines.length >= 2);

  // De volgende dag: dezelfde artikelen komen niet terug
  const tomorrow = new Date(NOW.getTime() + 20 * 3600e3);
  const next = await runPipeline({ trigger: "schedule" }, { repo, fetcher: fakeFetch(routes), ai: fakeAi(analysisFor), now: () => tomorrow });
  assert.equal(next.status, "success");
  const nextContent = repo.getNewsletter(next.newsletterId!)!.content;
  assert.ok(nextContent.headlines.every((h) => !h.sources.some((s) => s.url.includes("gpt-6"))));
});

test("feedback wordt opgeslagen, is doorzoekbaar en beïnvloedt het profiel", async () => {
  const repo = setup();
  const res = await runPipeline({ trigger: "manual" }, { repo, fetcher: fakeFetch(routes), ai: fakeAi(analysisFor), now: () => NOW });
  const h = repo.getNewsletter(res.newsletterId!)!.content.headlines[0];
  repo.setFeedback(h.itemId, "like", true);
  repo.setFeedback(h.itemId, "save", true);
  assert.deepEqual(repo.getItem(h.itemId)!.feedback.sort(), ["like", "save"]);
  repo.setFeedback(h.itemId, "dismiss", true);
  assert.deepEqual(repo.getItem(h.itemId)!.feedback.sort(), ["dismiss", "save"]);
  assert.equal(repo.searchItems({ action: "save" }).length, 1);
  assert.equal(repo.searchItems({ q: "GPT-6" }).length >= 1, true);
  assert.equal(repo.feedbackSignals().length, 2);
});

test("zonder API-key: basisnieuwsbrief met waarschuwing", async () => {
  const repo = setup();
  const res = await runPipeline({ trigger: "cli" }, { repo, fetcher: fakeFetch(routes), ai: null, now: () => NOW });
  assert.equal(res.status, "success");
  const n = repo.getNewsletter(res.newsletterId!)!.content;
  assert.equal(n.mode, "basic");
  assert.ok(n.headlines.length > 0);
  assert.ok(n.headlines.every((h) => h.status === "unverified"));
  assert.equal(n.opportunities, null);
  assert.ok(n.warnings.some((w) => w.includes("Basismodus")));
});

test("AI-fout valt terug op basisversie in plaats van niets", async () => {
  const repo = setup();
  const ai = fakeAi(() => {
    throw new Error("overloaded");
  });
  const res = await runPipeline({ trigger: "manual" }, { repo, fetcher: fakeFetch(routes), ai, now: () => NOW });
  assert.equal(res.status, "success");
  const n = repo.getNewsletter(res.newsletterId!)!.content;
  assert.equal(n.mode, "basic");
  assert.ok(n.warnings.some((w) => w.includes("overloaded")));
});

test("alle bronnen kapot: run mislukt met duidelijke fout", async () => {
  const repo = setup(["verge"]);
  const res = await runPipeline({ trigger: "manual" }, { repo, fetcher: fakeFetch(routes), ai: null, now: () => NOW });
  assert.equal(res.status, "failed");
  assert.match(res.message, /Geen enkele bron/);
  assert.equal(repo.listRuns(1)[0].status, "failed");
});

test("gelijktijdige runs worden geweigerd", async () => {
  const repo = setup();
  const first = repo.startRun("manual");
  assert.ok(first);
  const res = await runPipeline({ trigger: "manual" }, { repo, fetcher: fakeFetch(routes), ai: null, now: () => NOW });
  assert.equal(res.status, "busy");
});
