import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterArticles, guessCategory, isAiRelated, isClickbait, isRecent, scoreCluster, selectCandidates } from "../src/lib/filter";
import { computePreferences, prefScorers, topTopics } from "../src/lib/preferences";
import { DEFAULT_SETTINGS } from "../src/lib/repo";
import { isDue } from "../src/lib/scheduler";
import type { Article } from "../src/lib/types";
import { NOW, hoursAgo } from "./helpers";

const art = (p: Partial<Article> & { title: string }): Article => ({
  id: p.id ?? p.title,
  url: p.url ?? `https://x.com/${encodeURIComponent(p.title)}`,
  sourceId: p.sourceId ?? "techcrunch",
  sourceName: p.sourceName ?? "TechCrunch",
  tier: p.tier ?? "press",
  publishedAt: p.publishedAt ?? hoursAgo(2).toISOString(),
  excerpt: p.excerpt ?? "",
  fetchedAt: NOW.toISOString(),
  usedInNewsletter: null,
  ...p,
});

test("isRecent: binnen venster, zonder datum afgewezen", () => {
  assert.ok(isRecent(hoursAgo(23).toISOString(), 24, NOW));
  assert.ok(!isRecent(hoursAgo(25).toISOString(), 24, NOW));
  assert.ok(!isRecent(null, 24, NOW));
});

test("AI-filter en clickbait-filter", () => {
  assert.ok(isAiRelated("Nvidia unveils new GPU for inference", ""));
  assert.ok(!isAiRelated("Apple releases new iPad colors", "Pink and green"));
  assert.ok(isClickbait("You won't believe what ChatGPT just did"));
  assert.ok(isClickbait("Best AI laptops deal: 30% off today"));
  assert.ok(!isClickbait("OpenAI releases GPT-6"));
});

test("guessCategory", () => {
  assert.equal(guessCategory("Anthropic raises $10B at $400B valuation", ""), "funding");
  assert.equal(guessCategory("Claude Code adds background agents", ""), "coding");
  assert.equal(guessCategory("New study shows LLM reasoning limits", ""), "research");
});

test("clustering + scoring: meerdere bronnen en officiële bron winnen", () => {
  const groups = clusterArticles([
    art({ title: "OpenAI launches GPT-6 with native agents", sourceId: "verge", sourceName: "The Verge" }),
    art({ title: "GPT-6 is here: OpenAI launches new model with agents", sourceId: "techcrunch" }),
    art({ title: "Introducing GPT-6", sourceId: "openai", sourceName: "OpenAI", tier: "official", publishedAt: hoursAgo(5).toISOString() }),
    art({ title: "Small startup ships AI note app", sourceId: "reddit-ml", tier: "community" }),
  ]);
  // "Introducing GPT-6" deelt te weinig woorden; acceptabel, de AI voegt verder samen.
  const scored = groups.map((g) => scoreCluster(g, { category: () => 0, source: () => 0 }));
  const top = selectCandidates(scored, 10)[0];
  assert.equal(top.articles.length, 2);
  assert.ok(scored.find((c) => c.lead.tier === "community")!.score < top.score);
});

test("selectCandidates beperkt het aantal per bron", () => {
  const many = Array.from({ length: 12 }, (_, i) => scoreCluster([art({ title: `Unique story number ${i} about zebra${i}`, sourceId: "hackernews" })], { category: () => 0, source: () => 0 }));
  assert.equal(selectCandidates(many, 50, 8).length, 8);
});

test("leersysteem: likes verhogen, 'niet interessant' verlaagt", () => {
  const prefs = computePreferences(DEFAULT_SETTINGS, [
    { action: "like", category: "funding", sourceIds: ["techcrunch"], title: "a" },
    { action: "favorite", category: "funding", sourceIds: ["techcrunch"], title: "b" },
    { action: "dismiss", category: "policy", sourceIds: ["verge"], title: "c" },
    { action: "dismiss", category: "policy", sourceIds: ["verge"], title: "d" },
  ]);
  // Interesse 'ai_investments' = 4 → +0.5, plus geleerd 1.5*tanh(3/4)
  assert.ok(prefs.categoryBoost.funding > 1.4);
  assert.ok(prefs.categoryBoost.policy < -1);
  assert.ok(prefs.sourceBoost.techcrunch > 0 && prefs.sourceBoost.verge < 0);
  assert.equal(topTopics(prefs)[0].category, "funding");
  const s = prefScorers(prefs);
  assert.equal(s.category("models"), 0);
});

test("interesseprioriteit telt mee zonder feedback", () => {
  const settings = { ...DEFAULT_SETTINGS, interests: { ...DEFAULT_SETTINGS.interests, claude_code: 5, software_dev: 1 } };
  const prefs = computePreferences(settings, []);
  assert.equal(prefs.categoryBoost.coding, 1); // max(+1, -1)
});

test("planner: pas na het tijdstip, niet dubbel, met maximaal 3 pogingen", () => {
  const base = { now: new Date("2026-10-30T06:30:00Z"), timezone: "Europe/Amsterdam", deliveryTime: "07:00", hasNewsletterToday: false, attemptsToday: [] };
  assert.ok(isDue(base)); // 07:30 lokale tijd (CET, UTC+1)
  assert.ok(!isDue({ ...base, deliveryTime: "08:00" }));
  assert.ok(!isDue({ ...base, hasNewsletterToday: true }));
  assert.ok(!isDue({ ...base, attemptsToday: [{ startedAt: "2026-10-30T06:20:00Z" }] })); // < 30 min geleden
  assert.ok(isDue({ ...base, attemptsToday: [{ startedAt: "2026-10-30T05:50:00Z" }] }));
  assert.ok(!isDue({ ...base, attemptsToday: [1, 2, 3].map(() => ({ startedAt: "2026-10-30T04:00:00Z" })) }));
});
