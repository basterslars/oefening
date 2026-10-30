"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { CATEGORIES, STATUS_LABELS, type Category, type FeedbackAction, type NewsStatus, type NewsletterContent } from "@/lib/types";
import { FeedbackButtons } from "./FeedbackButtons";
import { Card, Empty, Pill, Score, SectionTitle, SourceLinks, StatusBadge } from "./ui";

interface Props {
  content: NewsletterContent;
  feedback: Record<string, FeedbackAction[]>;
  opportunityIds: number[];
  timezone: string;
}

const DEV_KIND: Record<string, string> = {
  claude_code: "Claude Code", coding_agent: "Coding agent", dev_tool: "Dev tool", mcp: "MCP",
  api_model: "API / model", github: "GitHub", open_source: "Open source",
};

export function NewsletterView({ content, feedback, opportunityIds, timezone }: Props) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<NewsStatus | "all">("all");
  const [hideDismissed, setHideDismissed] = useState(true);

  const presentCategories = useMemo(() => [...new Set(content.headlines.map((h) => h.category))], [content.headlines]);
  const headlines = content.headlines.filter(
    (h) =>
      (category === "all" || h.category === category) &&
      (status === "all" || h.status === status) &&
      !(hideDismissed && feedback[h.itemId]?.includes("dismiss")),
  );

  return (
    <div>
      {content.warnings.length > 0 && (
        <div className="mb-6 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          {content.warnings.map((w, i) => (
            <p key={i} className="flex gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" /> {w}
            </p>
          ))}
        </div>
      )}

      {/* A. Headlines */}
      <SectionTitle letter="A" title="Today's AI Headlines" subtitle={`${content.headlines.length} ontwikkelingen`} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <select value={category} onChange={(e) => setCategory(e.target.value as Category | "all")} className="rounded-md border border-line bg-panel px-2 py-1">
          <option value="all">Alle categorieën</option>
          {presentCategories.map((c) => <option key={c} value={c}>{CATEGORIES[c]}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as NewsStatus | "all")} className="rounded-md border border-line bg-panel px-2 py-1">
          <option value="all">Alle statussen</option>
          {(Object.keys(STATUS_LABELS) as NewsStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" checked={hideDismissed} onChange={(e) => setHideDismissed(e.target.checked)} /> verberg &lsquo;niet interessant&rsquo;
        </label>
      </div>

      <div className="space-y-4">
        {headlines.length === 0 && <Empty>Geen headlines voor dit filter.</Empty>}
        {headlines.map((h, i) => (
          <Card key={h.itemId}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <StatusBadge status={h.status} />
              <Pill>{CATEGORIES[h.category]}</Pill>
              <span className="ml-auto">
                <Score label="Relevantie" value={h.relevance} />
              </span>
            </div>
            <h3 className="mt-2 text-lg font-semibold leading-snug">{h.title}</h3>
            {h.summary && <p className="mt-2 text-[15px] leading-relaxed">{h.summary}</p>}
            {(h.whatHappened || h.whyItMatters) && (
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                {h.whatHappened && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">Wat is er gebeurd</dt>
                    <dd className="mt-1 leading-relaxed">{h.whatHappened}</dd>
                  </div>
                )}
                {h.whyItMatters && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">Waarom belangrijk</dt>
                    <dd className="mt-1 leading-relaxed">{h.whyItMatters}</dd>
                  </div>
                )}
              </dl>
            )}
            {h.note && <p className="mt-3 text-xs italic text-muted">Kanttekening: {h.note}</p>}
            <SourceLinks sources={h.sources} timezone={timezone} />
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-muted">
                Gepubliceerd {h.publishedAt ? new Date(h.publishedAt).toLocaleString("nl-NL", { timeZone: timezone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "onbekend"}
              </span>
              <FeedbackButtons itemId={h.itemId} initial={feedback[h.itemId] ?? []} />
            </div>
          </Card>
        ))}
      </div>

      {/* B. Tools */}
      <SectionTitle letter="B" title="AI Tools of the Day" />
      {content.tools ? (
        <div className="grid gap-4 md:grid-cols-3">
          {content.tools.map((t) => (
            <Card key={t.itemId} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{t.name}</h3>
                <Pill>{t.pricing}</Pill>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{t.whatItDoes}</p>
              <p className="mt-2 text-sm text-muted"><span className="font-medium text-ink">Probleem:</span> {t.problemSolved}</p>
              <p className="mt-1 text-sm text-muted"><span className="font-medium text-ink">Voor:</span> {t.audience}</p>
              <div className="mt-auto pt-3">
                {t.website && (
                  <a href={t.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                    Website <ExternalLink size={12} />
                  </a>
                )}
                {t.website && !t.websiteVerified && <span className="ml-2 text-xs text-muted">(niet geverifieerd in bron)</span>}
                <SourceLinks sources={t.sources} timezone={timezone} />
                <div className="mt-2 flex justify-end">
                  <FeedbackButtons itemId={t.itemId} initial={feedback[t.itemId] ?? []} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>Alleen beschikbaar met AI-analyse (ANTHROPIC_API_KEY).</Empty>
      )}

      {/* C. Opportunities */}
      <SectionTitle letter="C" title="AI Business Opportunities" />
      {content.opportunities ? (
        <div className="grid gap-4 md:grid-cols-2">
          {content.opportunities.map((o, i) => (
            <Card key={i}>
              <h3 className="font-semibold">{o.title}</h3>
              <div className="mt-2 flex flex-wrap gap-4">
                <Score label="Moeilijkheid" value={o.buildDifficulty} />
                <Score label="Potentieel" value={o.commercialPotential} />
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                {([
                  ["Probleem", o.problem], ["Doelgroep", o.audience], ["AI-aanpak", o.aiApproach],
                  ["Verkopen als", o.howToSell], ["Verdienmodel", o.revenueModel],
                ] as const).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">{k}</dt>
                    <dd className="leading-relaxed">{v}</dd>
                  </div>
                ))}
              </dl>
              <SourceLinks sources={o.sources} timezone={timezone} />
              {opportunityIds[i] && (
                <Link href={`/opportunities#op-${opportunityIds[i]}`} className="mt-3 inline-block text-sm text-accent hover:underline">
                  Opslaan of verder uitwerken →
                </Link>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty>Alleen beschikbaar met AI-analyse (ANTHROPIC_API_KEY).</Empty>
      )}

      {/* D. Development */}
      <SectionTitle letter="D" title="AI Development & Claude Code" />
      {content.development ? (
        <div className="space-y-4">
          {content.development.updates.map((u) => (
            <Card key={u.itemId}>
              <div className="flex items-center gap-2">
                <Pill>{DEV_KIND[u.kind] ?? u.kind}</Pill>
                <h3 className="font-semibold">{u.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{u.summary}</p>
              <SourceLinks sources={u.sources} timezone={timezone} />
              <div className="mt-2 flex justify-end">
                <FeedbackButtons itemId={u.itemId} initial={feedback[u.itemId] ?? []} />
              </div>
            </Card>
          ))}
          {content.development.buildIdea && (
            <Card className="border-accent/40 bg-accent-soft/40">
              <p className="text-xs font-medium uppercase tracking-wide text-accent">Bouw dit met Claude Code</p>
              <h3 className="mt-1 font-semibold">{content.development.buildIdea.title}</h3>
              <p className="mt-2 text-sm leading-relaxed">{content.development.buildIdea.description}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                {content.development.buildIdea.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <p className="mt-3 text-sm text-muted"><span className="font-medium text-ink">Waarom nu:</span> {content.development.buildIdea.whyNow}</p>
            </Card>
          )}
        </div>
      ) : (
        <Empty>Geen ontwikkelaarsnieuws vandaag.</Empty>
      )}

      {/* E. Explained */}
      <SectionTitle letter="E" title="AI Explained" />
      {content.explained ? (
        <Card>
          <h3 className="font-semibold">{content.explained.topic}</h3>
          {content.explained.explanation.split(/\n{2,}/).map((p, i) => <p key={i} className="mt-2 text-[15px] leading-relaxed">{p}</p>)}
          {content.explained.analogy && <p className="mt-3 rounded-lg bg-bg p-3 text-sm"><span className="font-medium">Vergelijking:</span> {content.explained.analogy}</p>}
        </Card>
      ) : (
        <Empty>Alleen beschikbaar met AI-analyse (ANTHROPIC_API_KEY).</Empty>
      )}

      {/* F. Big picture */}
      <SectionTitle letter="F" title="The Big Picture" />
      {content.bigPicture ? (
        <Card>
          <dl className="space-y-4 text-[15px] leading-relaxed">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Belangrijkste ontwikkeling</dt><dd className="mt-1">{content.bigPicture.keyDevelopment}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Op langere termijn</dt><dd className="mt-1">{content.bigPicture.longTerm}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Onthoud</dt><dd className="mt-1 font-medium">{content.bigPicture.takeaway}</dd></div>
          </dl>
        </Card>
      ) : (
        <Empty>Alleen beschikbaar met AI-analyse (ANTHROPIC_API_KEY).</Empty>
      )}

      <p className="mt-10 text-xs text-muted">
        {content.stats.collected} items verzameld · {content.stats.candidates} unieke verhalen geanalyseerd · {content.stats.sourcesOk} bronnen ok
        {content.stats.sourcesFailed ? `, ${content.stats.sourcesFailed} mislukt` : ""} · {content.model ? `analyse: ${content.model}` : "zonder AI-analyse"}
      </p>
    </div>
  );
}
