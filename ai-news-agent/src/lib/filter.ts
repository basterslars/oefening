import type { Article, Category, SourceTier } from "./types";
import { sameStory } from "./text";

// Regelgebaseerde voorfilters. Deze draaien altijd (ook zonder AI) en bepalen
// welke artikelen überhaupt bij de AI-analyse terechtkomen. Zo blijft de
// LLM-prompt klein en kan het model geen oud nieuws "herontdekken".

const AI_TERMS =
  /\b(ai|a\.i\.|artificial intelligence|llms?|gpt[-\w.]*|chatgpt|openai|anthropic|claude|gemini|deepmind|llama|mistral|grok|xai|perplexity|copilot|codex|cursor|hugging ?face|transformer|neural|machine learning|deep learning|diffusion|agents?|agentic|rag|mcp|model context protocol|inference|fine-?tun\w*|embeddings?|multimodal|reasoning model|foundation model|nvidia|gpu|chatbot|genai|generative)\b/i;

const CLICKBAIT =
  /(you won'?t believe|shocking|this one trick|will blow your mind|is (dead|over)\b|destroys|insane|game[- ]?changer!|\?\?|!!|top \d+ (ways|reasons)|everything you need to know|here'?s why you should|i tried|my honest|ranked:)/i;

const DEALS = /\b(deal|sale|discount|% off|coupon|black friday|prime day|best .* to buy|gift guide)\b/i;

export function isAiRelated(title: string, excerpt: string): boolean {
  return AI_TERMS.test(title) || AI_TERMS.test(excerpt.slice(0, 400));
}

export function isClickbait(title: string): boolean {
  return CLICKBAIT.test(title) || DEALS.test(title);
}

const CATEGORY_RULES: [Category, RegExp][] = [
  ["funding", /\b(raises?|raised|funding|series [a-f]|seed round|valuation|invests?|investment|acquires?|acquisition|acquired|ipo|merger|buys)\b/i],
  ["coding", /\b(claude code|codex|copilot|cursor|windsurf|coding agent|code review|ide|sdk|cli|github|devin|programming|developer|api|mcp|model context protocol|release v?\d)/i],
  ["agents", /\b(agents?|agentic|autonomous|computer use|browser use|operator)\b/i],
  ["policy", /\b(regulat\w+|ai act|lawsuit|sues?|court|copyright|senate|congress|eu commission|ban|policy|safety institute)\b/i],
  ["research", /\b(paper|research|study|benchmark|arxiv|breakthrough|scientists?|alphafold|interpretability)\b/i],
  ["industry", /\b(real estate|vastgoed|finance|banking|bank|marketing|healthcare|insurance|legal|retail|property|mortgage)\b/i],
  ["startups", /\b(startup|start-up|founder|launches company|y combinator|yc)\b/i],
  ["assistants", /\b(chatgpt|claude\.ai|gemini app|claude app|assistant|voice mode|memory feature)\b/i],
  ["models", /\b(model|gpt-?\d|claude (opus|sonnet|haiku|fable)|gemini \d|llama \d|open[- ]weights?|weights|parameters|release[sd]?)\b/i],
  ["business", /\b(enterprise|automation|workflow|business|customers|productivity|roi|workforce|jobs)\b/i],
  ["tools", /\b(tool|app|launch(es|ed)?|plugin|extension|platform)\b/i],
];

export function guessCategory(title: string, excerpt: string): Category {
  const hay = `${title} ${excerpt.slice(0, 300)}`;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(hay)) return cat;
  return "other";
}

export function isRecent(publishedAt: string | null, lookbackHours: number, now = new Date()): boolean {
  if (!publishedAt) return false; // zonder datum kunnen we actualiteit niet controleren
  const age = now.getTime() - Date.parse(publishedAt);
  return age <= lookbackHours * 3600e3 && age >= -3600e3;
}

const TIER_WEIGHT: Record<SourceTier, number> = { official: 3, press: 2.5, community: 1 };

export interface Cluster {
  articles: Article[];
  /** Het artikel dat het verhaal het best vertegenwoordigt (hoogste tier, oudste = origineel). */
  lead: Article;
  category: Category;
  score: number;
}

/** Groepeert artikelen die over hetzelfde verhaal gaan. */
export function clusterArticles(articles: Article[]): Article[][] {
  const clusters: Article[][] = [];
  for (const a of articles) {
    const hit = clusters.find((c) => c.some((b) => sameStory(a.title, b.title)));
    if (hit) hit.push(a);
    else clusters.push([a]);
  }
  return clusters;
}

/**
 * Score voor de voorselectie: bronbetrouwbaarheid + aantal onafhankelijke
 * bronnen + engagement + persoonlijke voorkeur. Bewust simpel en uitlegbaar.
 */
export function scoreCluster(
  group: Article[],
  prefs: { category: (c: Category) => number; source: (id: string) => number },
): Cluster {
  const tierRank: Record<SourceTier, number> = { official: 0, press: 1, community: 2 };
  const lead = [...group].sort(
    (a, b) => tierRank[a.tier] - tierRank[b.tier] || (Date.parse(a.publishedAt ?? "") || 0) - (Date.parse(b.publishedAt ?? "") || 0),
  )[0];
  const category = guessCategory(lead.title, lead.excerpt);
  const distinctSources = new Set(group.map((a) => a.sourceId)).size;
  const engagement = Math.max(0, ...group.map((a) => a.engagement ?? 0));
  const score =
    Math.max(...group.map((a) => TIER_WEIGHT[a.tier])) +
    Math.min(3, distinctSources - 1) * 1.5 +
    Math.min(2, Math.log10(1 + engagement / 50)) +
    prefs.category(category) +
    Math.max(...group.map((a) => prefs.source(a.sourceId)));
  return { articles: group, lead, category, score };
}

/** Is dit verhaal al eerder (in recente nieuwsbrieven) behandeld? */
export function alreadyCovered(title: string, recentTitles: string[]): boolean {
  return recentTitles.some((t) => sameStory(title, t));
}

export function selectCandidates(clusters: Cluster[], max: number, perSourceMax = 8): Cluster[] {
  const sorted = [...clusters].sort((a, b) => b.score - a.score);
  const perSource = new Map<string, number>();
  const out: Cluster[] = [];
  for (const c of sorted) {
    const n = perSource.get(c.lead.sourceId) ?? 0;
    if (n >= perSourceMax) continue;
    perSource.set(c.lead.sourceId, n + 1);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}
