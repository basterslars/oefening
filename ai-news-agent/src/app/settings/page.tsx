import { SettingsForm } from "@/components/SettingsForm";
import { Card } from "@/components/ui";
import { aiAvailable, config } from "@/lib/config";
import { computePreferences } from "@/lib/preferences";
import { Repo } from "@/lib/repo";
import { SOURCES, getSource } from "@/lib/sources/registry";
import { formatDateTimeNl } from "@/lib/time";
import { CATEGORIES, type Category } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const repo = new Repo();
  const settings = repo.getSettings();
  const prefs = computePreferences(settings, repo.feedbackSignals());
  const runs = repo.listRuns(10);
  const learnedCats = (Object.entries(prefs.learnedCategory) as [Category, number][]).sort((a, b) => b[1] - a[1]);
  const learnedSources = Object.entries(prefs.learnedSource).sort((a, b) => b[1] - a[1]);
  const sources = SOURCES.map(({ kind: _kind, ...rest }) => rest);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Instellingen</h1>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
        <span>AI-analyse: {aiAvailable() ? `aan (${config.model}, effort ${config.effort})` : "uit — geen ANTHROPIC_API_KEY"}</span>
        <span>· Planner: {config.schedulerEnabled ? "ingebouwd" : "extern (/api/cron)"}</span>
      </div>

      <Card className="mt-6">
        <SettingsForm initial={settings} sources={sources} emailConfigured={config.resendKey !== null} />
      </Card>

      <h2 className="mb-2 mt-10 font-semibold">Wat de agent over je geleerd heeft</h2>
      <Card>
        {prefs.signalCount === 0 ? (
          <p className="text-sm text-muted">Nog geen feedback. Like, bewaar of markeer nieuwsitems als &lsquo;niet interessant&rsquo; om de selectie te verbeteren.</p>
        ) : (
          <div className="grid gap-6 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">Categorieën ({prefs.signalCount} signalen)</p>
              <ul className="space-y-1">
                {learnedCats.map(([c, v]) => (
                  <li key={c} className="flex justify-between"><span>{CATEGORIES[c] ?? c}</span><span className={`font-mono ${v < 0 ? "text-red-600" : "text-emerald-600"}`}>{v > 0 ? "+" : ""}{v}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">Bronnen</p>
              <ul className="space-y-1">
                {learnedSources.map(([id, v]) => (
                  <li key={id} className="flex justify-between"><span>{getSource(id)?.name ?? id}</span><span className={`font-mono ${v < 0 ? "text-red-600" : "text-emerald-600"}`}>{v > 0 ? "+" : ""}{v}</span></li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <h2 className="mb-2 mt-10 font-semibold">Logboek</h2>
      <div className="space-y-2">
        {runs.map((r) => (
          <details key={r.id} className="rounded-lg border border-line bg-panel px-4 py-2 text-sm">
            <summary className="cursor-pointer">
              Run #{r.id} · {formatDateTimeNl(r.startedAt, settings.timezone)} · {r.trigger} ·{" "}
              <span className={r.status === "failed" ? "text-red-600" : r.status === "success" ? "text-emerald-600" : "text-accent"}>{r.status}</span>
              {r.error && <span className="text-red-600"> — {r.error}</span>}
            </summary>
            <ul className="mt-2 space-y-0.5 font-mono text-xs">
              {r.log.map((l, i) => (
                <li key={i} className={l.level === "error" ? "text-red-600" : l.level === "warn" ? "text-amber-600" : "text-muted"}>
                  {l.at.slice(11, 19)} {l.message}
                </li>
              ))}
            </ul>
          </details>
        ))}
        {runs.length === 0 && <p className="text-sm text-muted">Nog geen runs.</p>}
      </div>
    </div>
  );
}
