import type { AiClient } from "./analyze/ai-client";
import { AnalysisSchema } from "./analyze/schema";
import { SYSTEM_PROMPT, buildPrompt } from "./analyze/prompt";
import { sendNewsletterEmail } from "./email";
import { alreadyCovered, clusterArticles, isAiRelated, isClickbait, isRecent, scoreCluster, selectCandidates } from "./filter";
import { buildAiNewsletter, buildBasicNewsletter, type BuildContext } from "./newsletter";
import { computePreferences, describePreferences, prefScorers } from "./preferences";
import type { Repo } from "./repo";
import { collectAll } from "./sources/collect";
import type { Fetcher } from "./sources/rss";
import { SOURCES, getSource } from "./sources/registry";
import { localParts } from "./time";
import { LENGTH_HEADLINES, type NewsletterContent, type RunLogEntry, type RunRow } from "./types";

export interface PipelineDeps {
  repo: Repo;
  fetcher: Fetcher;
  ai: AiClient | null;
  now?: () => Date;
  sendEmail?: (n: NewsletterContent, to: string) => Promise<void>;
  emailConfigured?: boolean;
}

export interface PipelineResult {
  status: "success" | "skipped" | "busy" | "failed";
  runId: number | null;
  newsletterId: number | null;
  message: string;
}

/** Maximaal aantal verhalen dat naar de AI gaat (houdt kosten en prompt beperkt). */
const MAX_CANDIDATES = 60;

export async function runPipeline(
  opts: { trigger: RunRow["trigger"]; force?: boolean },
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const { repo } = deps;
  const now = deps.now ?? (() => new Date());
  const runId = repo.startRun(opts.trigger);
  if (runId === null) return { status: "busy", runId: null, newsletterId: null, message: "Er loopt al een generatie." };

  const log = (level: RunLogEntry["level"], message: string) => {
    const entry = { at: now().toISOString(), level, message };
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`[news-agent run ${runId}] ${message}`);
    try {
      repo.appendRunLog(runId, entry);
    } catch {
      // Logging mag de run nooit laten mislukken.
    }
  };

  try {
    const settings = repo.getSettings();
    const startedAt = now();
    const { date } = localParts(settings.timezone, startedAt);

    const existing = repo.newsletterIdsForDate(date);
    if (existing.length && !opts.force) {
      log("info", `Nieuwsbrief voor ${date} bestaat al (#${existing[0]}); overgeslagen.`);
      repo.finishRun(runId, { status: "success", newsletterId: existing[0] });
      return { status: "skipped", runId, newsletterId: existing[0], message: "Nieuwsbrief van vandaag bestaat al." };
    }

    // 1. Verzamelen
    const sources = SOURCES.filter((s) => settings.enabledSources[s.id]);
    log("info", `Nieuws verzamelen uit ${sources.length} bronnen (afgelopen ${settings.lookbackHours} uur)…`);
    const { articles: raw, results } = await collectAll(sources, { fetcher: deps.fetcher, ai: deps.ai, lookbackHours: settings.lookbackHours, now: startedAt });
    for (const r of results) {
      if (r.skipped) log("info", `${r.name}: overgeslagen (${r.skipped})`);
      else if (r.ok) log("info", `${r.name}: ${r.count} items`);
      else log("warn", `${r.name}: mislukt — ${r.error}`);
    }
    const sourcesOk = results.filter((r) => r.ok && !r.skipped).length;
    const sourcesFailed = results.filter((r) => !r.ok).length;
    if (sourcesOk === 0) throw new Error("Geen enkele bron kon worden opgehaald. Controleer de internetverbinding.");

    const { inserted } = repo.upsertArticles(raw, startedAt.toISOString());
    log("info", `${raw.length} items opgehaald, ${inserted} nieuw in de database.`);

    // 2. Filteren: actualiteit, AI-relevantie, clickbait, eerder behandeld
    const since = new Date(startedAt.getTime() - settings.lookbackHours * 3600e3).toISOString();
    const pool = repo.candidateArticlesSince(since, existing);
    const recentTitles = repo.recentlyUsedTitles(new Date(startedAt.getTime() - 4 * 86400e3).toISOString(), existing);
    const counters = { old: 0, offTopic: 0, clickbait: 0, covered: 0 };
    const fresh = pool.filter((a) => {
      if (!isRecent(a.publishedAt, settings.lookbackHours, startedAt)) return counters.old++, false;
      if (getSource(a.sourceId)?.needsAiFilter && !isAiRelated(a.title, a.excerpt)) return counters.offTopic++, false;
      if (isClickbait(a.title)) return counters.clickbait++, false;
      if (alreadyCovered(a.title, recentTitles)) return counters.covered++, false;
      return true;
    });
    log("info", `Filter: ${fresh.length} bruikbaar · ${counters.old} te oud · ${counters.offTopic} niet over AI · ${counters.clickbait} clickbait/aanbieding · ${counters.covered} al eerder behandeld.`);

    // 3. Ontdubbelen + rangschikken met persoonlijke voorkeuren
    const prefs = computePreferences(settings, repo.feedbackSignals());
    const scorers = prefScorers(prefs);
    const clusters = selectCandidates(clusterArticles(fresh).map((g) => scoreCluster(g, scorers)), MAX_CANDIDATES);
    log("info", `${clusters.length} unieke verhalen geselecteerd voor analyse.`);

    const headlineCount = LENGTH_HEADLINES[settings.length];
    const ctx: BuildContext = {
      date,
      clusters,
      prefs,
      headlineCount,
      stats: { collected: raw.length, candidates: clusters.length, sourcesOk, sourcesFailed },
      warnings: sourcesFailed ? [`${sourcesFailed} bron(nen) konden niet worden opgehaald; zie het logboek.`] : [],
    };

    // 4. Analyseren
    let content: NewsletterContent;
    if (clusters.length === 0) {
      log("warn", "Geen nieuwe verhalen gevonden.");
      content = buildBasicNewsletter({ ...ctx, warnings: [...ctx.warnings, "Er was geen nieuw, relevant AI-nieuws in de gekozen periode."] });
    } else if (!deps.ai) {
      log("info", "Geen ANTHROPIC_API_KEY: basisnieuwsbrief zonder AI-analyse.");
      content = buildBasicNewsletter({
        ...ctx,
        warnings: [...ctx.warnings, "Basismodus: zonder ANTHROPIC_API_KEY zijn er geen AI-samenvattingen, tools, kansen en uitleg. Statussen zijn niet gecontroleerd."],
      });
    } else {
      try {
        log("info", `AI-analyse met ${deps.ai.model}…`);
        const analysis = await deps.ai.json({
          system: SYSTEM_PROMPT,
          prompt: buildPrompt({ date, clusters, headlineCount, profile: describePreferences(prefs, settings) }),
          schema: AnalysisSchema,
        });
        content = buildAiNewsletter(analysis, ctx, deps.ai.model);
        log("info", `AI-analyse klaar: ${content.headlines.length} headlines.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("error", `AI-analyse mislukt: ${msg}. Terugval op basisnieuwsbrief.`);
        content = buildBasicNewsletter({ ...ctx, warnings: [...ctx.warnings, `AI-analyse mislukt (${msg}); dit is de basisversie.`] });
      }
    }

    // 5. Opslaan
    const newsletterId = saveNewsletter(repo, content);
    log("info", `Nieuwsbrief #${newsletterId} opgeslagen.`);

    // 6. E-mail (optioneel)
    if (settings.email.enabled && settings.email.to && deps.sendEmail && deps.emailConfigured) {
      try {
        await deps.sendEmail(content, settings.email.to);
        log("info", `E-mail verstuurd naar ${settings.email.to}.`);
      } catch (err) {
        log("warn", `E-mail versturen mislukt: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    repo.finishRun(runId, { status: "success", newsletterId });
    return { status: "success", runId, newsletterId, message: `Nieuwsbrief #${newsletterId} gemaakt (${content.mode === "ai" ? "met AI-analyse" : "basismodus"}).` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", msg);
    repo.finishRun(runId, { status: "failed", error: msg });
    return { status: "failed", runId, newsletterId: null, message: msg };
  }
}

export function saveNewsletter(repo: Repo, content: NewsletterContent): number {
  const id = repo.insertNewsletter(content);
  const at = content.generatedAt;
  const used = new Set<string>();
  for (const h of content.headlines) {
    h.sources.forEach((s) => used.add(s.articleId));
    repo.insertItem({
      id: h.itemId, newsletterId: id, kind: "headline", title: h.title, summary: h.summary, category: h.category,
      sourceIds: [...new Set(h.sources.map((s) => s.sourceId))], url: h.sources[0]?.url ?? null, publishedAt: h.publishedAt, data: h, createdAt: at,
    });
  }
  for (const t of content.tools ?? []) {
    t.sources.forEach((s) => used.add(s.articleId));
    repo.insertItem({
      id: t.itemId, newsletterId: id, kind: "tool", title: t.name, summary: t.whatItDoes, category: "tools",
      sourceIds: [...new Set(t.sources.map((s) => s.sourceId))], url: t.website ?? t.sources[0]?.url ?? null, publishedAt: null, data: t, createdAt: at,
    });
  }
  for (const u of content.development?.updates ?? []) {
    u.sources.forEach((s) => used.add(s.articleId));
    repo.insertItem({
      id: u.itemId, newsletterId: id, kind: "dev", title: u.title, summary: u.summary, category: "coding",
      sourceIds: [...new Set(u.sources.map((s) => s.sourceId))], url: u.sources[0]?.url ?? null, publishedAt: u.sources[0]?.publishedAt ?? null, data: u, createdAt: at,
    });
  }
  for (const o of content.opportunities ?? []) repo.insertOpportunity(id, content.date, o);
  repo.markArticlesUsed([...used], id);
  return id;
}

/** Standaard-afhankelijkheden voor productie (lazy, zodat tests ze niet laden). */
export async function defaultDeps(): Promise<PipelineDeps> {
  const [{ Repo }, { createAnthropicClient }, { config }] = await Promise.all([
    import("./repo"),
    import("./analyze/ai-client"),
    import("./config"),
  ]);
  return {
    repo: new Repo(),
    fetcher: fetch,
    ai: createAnthropicClient(),
    sendEmail: (n, to) => sendNewsletterEmail(n, to),
    emailConfigured: config.resendKey !== null,
  };
}
