import { randomUUID } from "node:crypto";
import type { Cluster } from "./filter";
import type { Analysis } from "./analyze/schema";
import type { Preferences } from "./preferences";
import { hostOf, truncateWords } from "./text";
import {
  CATEGORY_KEYS,
  type Article,
  type Category,
  type DevUpdate,
  type Headline,
  type NewsletterContent,
  type Opportunity,
  type SourceRef,
  type ToolPick,
} from "./types";

const clamp = (n: number, lo = 1, hi = 10) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)));
const newId = () => randomUUID().replace(/-/g, "").slice(0, 16);

function toRef(a: Article): SourceRef {
  return { articleId: a.id, sourceId: a.sourceId, name: a.sourceName, url: a.url, title: a.title, publishedAt: a.publishedAt, tier: a.tier };
}

function earliest(refs: SourceRef[]): string | null {
  const ts = refs.map((r) => r.publishedAt).filter((d): d is string => !!d).sort();
  return ts[0] ?? null;
}

function personal(relevance: number, category: Category, refs: SourceRef[], prefs: Preferences): number {
  const sourceBoost = Math.max(0, ...refs.map((r) => prefs.sourceBoost[r.sourceId] ?? 0));
  return Math.round((relevance + (prefs.categoryBoost[category] ?? 0) + sourceBoost) * 10) / 10;
}

export interface BuildContext {
  date: string;
  clusters: Cluster[];
  prefs: Preferences;
  headlineCount: number;
  stats: NewsletterContent["stats"];
  warnings: string[];
}

function resolver(clusters: Cluster[]) {
  const index = new Map<string, Article>();
  for (const c of clusters) for (const a of c.articles) index.set(a.id, a);
  const resolve = (ids: string[]): SourceRef[] => {
    const seen = new Set<string>();
    const out: SourceRef[] = [];
    for (const id of ids) {
      const a = index.get(id.trim());
      if (!a || seen.has(a.id)) continue; // onbekende id's (hallucinaties) vallen weg
      seen.add(a.id);
      out.push(toRef(a));
    }
    return out;
  };
  return { index, resolve };
}

export function buildAiNewsletter(analysis: Analysis, ctx: BuildContext, model: string): NewsletterContent {
  const { resolve, index } = resolver(ctx.clusters);
  const warnings = [...ctx.warnings];

  let dropped = 0;
  const headlines: Headline[] = [];
  for (const h of analysis.headlines) {
    const sources = resolve(h.article_ids);
    if (sources.length === 0) {
      dropped++;
      continue;
    }
    const category = (CATEGORY_KEYS as string[]).includes(h.category) ? (h.category as Category) : "other";
    const relevance = clamp(h.relevance);
    headlines.push({
      itemId: newId(),
      title: h.title,
      summary: truncateWords(h.summary, 110),
      whatHappened: h.what_happened,
      whyItMatters: h.why_it_matters,
      category,
      status: h.status,
      relevance,
      personalScore: personal(relevance, category, sources, ctx.prefs),
      publishedAt: earliest(sources),
      sources,
      note: h.note,
    });
  }
  if (dropped) warnings.push(`${dropped} headline(s) verwijderd omdat ze naar onbekende bronnen verwezen.`);
  headlines.sort((a, b) => b.personalScore - a.personalScore);

  const knownHosts = new Set([...index.values()].map((a) => hostOf(a.url)));
  const tools: ToolPick[] = analysis.tools.slice(0, 3).map((t) => {
    const sources = resolve(t.article_ids);
    const website = t.website && /^https?:\/\//i.test(t.website) ? t.website : null;
    const excerptText = sources.map((s) => index.get(s.articleId)?.excerpt ?? "").join(" ");
    const verified = !!website && (knownHosts.has(hostOf(website)) || excerptText.includes(hostOf(website)));
    return {
      itemId: newId(),
      name: t.name,
      whatItDoes: t.what_it_does,
      problemSolved: t.problem_solved,
      audience: t.audience,
      website,
      websiteVerified: verified,
      pricing: t.pricing || "Onbekend",
      sources,
    };
  });

  const opportunities: Opportunity[] = analysis.opportunities.slice(0, 2).map((o) => ({
    title: o.title,
    problem: o.problem,
    audience: o.audience,
    aiApproach: o.ai_approach,
    howToSell: o.how_to_sell,
    revenueModel: o.revenue_model,
    buildDifficulty: clamp(o.build_difficulty),
    commercialPotential: clamp(o.commercial_potential),
    sources: resolve(o.article_ids),
  }));

  const updates: DevUpdate[] = [];
  for (const u of analysis.development.updates) {
    const sources = resolve(u.article_ids);
    if (sources.length) updates.push({ itemId: newId(), title: u.title, summary: u.summary, kind: u.kind, sources });
  }

  return {
    date: ctx.date,
    mode: "ai",
    generatedAt: new Date().toISOString(),
    model,
    headlines: headlines.slice(0, ctx.headlineCount),
    tools,
    opportunities,
    development: { updates, buildIdea: { ...analysis.development.build_idea, whyNow: analysis.development.build_idea.why_now } },
    explained: analysis.explained,
    bigPicture: {
      keyDevelopment: analysis.big_picture.key_development,
      longTerm: analysis.big_picture.long_term,
      takeaway: analysis.big_picture.takeaway,
    },
    stats: ctx.stats,
    warnings,
  };
}

/** Nieuwsbrief zonder AI: wel gefilterd, ontdubbeld en gerangschikt, maar zonder analyse. */
export function buildBasicNewsletter(ctx: BuildContext): NewsletterContent {
  const { resolve } = resolver(ctx.clusters);
  const headlines: Headline[] = ctx.clusters.slice(0, ctx.headlineCount).map((c) => {
    const sources = resolve(c.articles.map((a) => a.id));
    const relevance = clamp(c.score * 1.2);
    return {
      itemId: newId(),
      title: c.lead.title,
      summary: c.lead.excerpt ? truncateWords(c.lead.excerpt, 100) : "",
      whatHappened: null,
      whyItMatters: null,
      category: c.category,
      status: "unverified",
      relevance,
      personalScore: Math.round(c.score * 10) / 10,
      publishedAt: earliest(sources),
      sources,
      note: sources.length > 1 ? `Gemeld door ${sources.length} bronnen.` : null,
    };
  });
  const updates: DevUpdate[] = ctx.clusters
    .filter((c) => c.category === "coding")
    .slice(0, 5)
    .map((c) => ({
      itemId: newId(),
      title: c.lead.title,
      summary: truncateWords(c.lead.excerpt, 60),
      kind: "dev_tool",
      sources: resolve(c.articles.map((a) => a.id)),
    }));

  return {
    date: ctx.date,
    mode: "basic",
    generatedAt: new Date().toISOString(),
    model: null,
    headlines,
    tools: null,
    opportunities: null,
    development: updates.length ? { updates, buildIdea: null } : null,
    explained: null,
    bigPicture: null,
    stats: ctx.stats,
    warnings: ctx.warnings,
  };
}
