import Link from "next/link";
import { CheckCircle2, CircleAlert, Clock } from "lucide-react";
import { GenerateButton } from "@/components/GenerateButton";
import { Card, Empty, StatusBadge } from "@/components/ui";
import { aiAvailable, config } from "@/lib/config";
import { computePreferences, topTopics } from "@/lib/preferences";
import { Repo } from "@/lib/repo";
import { formatDateNl, formatDateTimeNl, localParts } from "@/lib/time";
import { CATEGORIES } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const repo = new Repo();
  const settings = repo.getSettings();
  const { date } = localParts(settings.timezone);
  const latest = repo.latestNewsletter();
  const today = repo.newsletterForDate(date);
  const runs = repo.listRuns(5);
  const lastRun = runs[0];
  const since24h = new Date(Date.now() - 24 * 3600e3).toISOString();
  const collected24h = repo.countArticles(since24h);
  const topics = topTopics(computePreferences(settings, repo.feedbackSignals()));
  const key = latest?.content.bigPicture?.keyDevelopment ?? latest?.content.headlines[0]?.title ?? null;
  const savedCount = repo.searchItems({ action: "any", limit: 1000 }).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Vandaag</p>
          <h1 className="text-2xl font-semibold tracking-tight">{formatDateNl(date, settings.timezone)}</h1>
        </div>
        <GenerateButton hasToday={!!today} initialRunning={lastRun?.status === "running"} />
      </div>

      {!aiAvailable() && (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          Basismodus: zonder <code>ANTHROPIC_API_KEY</code> wordt nieuws verzameld, gefilterd en ontdubbeld, maar niet samengevat of geanalyseerd.
          Zie <code>.env.example</code>.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Verzameld (24 uur)</p>
          <p className="mt-1 text-3xl font-semibold">{collected24h}</p>
          <p className="text-xs text-muted">nieuwe artikelen in de database</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Volgende nieuwsbrief</p>
          <p className="mt-1 text-3xl font-semibold">{settings.deliveryTime}</p>
          <p className="text-xs text-muted">
            {today ? "vandaag al gemaakt · morgen weer" : "vandaag"} · {config.schedulerEnabled ? "ingebouwde planner" : "externe cron"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Opgeslagen</p>
          <p className="mt-1 text-3xl font-semibold">{savedCount}</p>
          <Link href="/saved" className="text-xs text-accent hover:underline">bekijk opgeslagen nieuws →</Link>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Belangrijkste ontwikkeling</p>
          {key ? <p className="mt-2 text-lg font-medium leading-snug">{key}</p> : <p className="mt-2 text-sm text-muted">Nog geen nieuwsbrief.</p>}
          {latest && (
            <>
              <ul className="mt-4 space-y-2">
                {latest.content.headlines.slice(0, 4).map((h) => (
                  <li key={h.itemId} className="flex items-start gap-2 text-sm">
                    <StatusBadge status={h.status} />
                    <span className="leading-snug">{h.title}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/newsletter/${latest.id}`} className="mt-4 inline-block text-sm text-accent hover:underline">
                Lees de nieuwsbrief van {latest.date} →
              </Link>
            </>
          )}
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Favoriete onderwerpen</p>
          {topics.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {topics.map((t) => (
                <li key={t.category} className="flex justify-between gap-2">
                  <span>{CATEGORIES[t.category]}</span>
                  <span className="font-mono text-xs text-muted">+{t.boost.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Nog geen voorkeuren.</p>
          )}
          <Link href="/settings" className="mt-3 inline-block text-xs text-accent hover:underline">interesses aanpassen →</Link>
        </Card>
      </div>

      <h2 className="mb-2 mt-8 text-sm font-medium text-muted">Laatste runs</h2>
      {runs.length === 0 ? (
        <Empty>Nog geen runs.</Empty>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                {r.status === "success" ? <CheckCircle2 size={15} className="text-emerald-600" /> : r.status === "running" ? <Clock size={15} className="text-accent" /> : <CircleAlert size={15} className="text-red-600" />}
                <span>{formatDateTimeNl(r.startedAt, settings.timezone)}</span>
                <span className="text-xs text-muted">{r.trigger}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{r.error ?? r.log.at(-1)?.message}</span>
                {r.newsletterId && <Link href={`/newsletter/${r.newsletterId}`} className="text-xs text-accent">#{r.newsletterId}</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
