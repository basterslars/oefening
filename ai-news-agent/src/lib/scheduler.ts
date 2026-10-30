import { Repo } from "./repo";
import { defaultDeps, runPipeline } from "./pipeline";
import { localParts } from "./time";

// Ingebouwde planner: controleert elke minuut of het tijdstip uit Instellingen
// gepasseerd is en er nog geen nieuwsbrief voor vandaag is. Omdat de check op
// "is er al een nieuwsbrief?" gebaseerd is in plaats van op een exact tijdstip,
// wordt een gemiste ochtend (server stond uit) bij de volgende start ingehaald.
//
// Werkt alleen bij een permanent draaiend proces (`next start`, Docker, VPS).
// Op serverless (Vercel) gebruik je in plaats daarvan /api/cron met een externe
// cron; zet dan SCHEDULER_ENABLED=false.

const MAX_SCHEDULED_ATTEMPTS_PER_DAY = 3;
const RETRY_AFTER_MS = 30 * 60e3;

export function isDue(opts: {
  now: Date;
  timezone: string;
  deliveryTime: string;
  hasNewsletterToday: boolean;
  attemptsToday: { startedAt: string }[];
}): boolean {
  if (opts.hasNewsletterToday) return false;
  const { time } = localParts(opts.timezone, opts.now);
  if (time < opts.deliveryTime) return false;
  if (opts.attemptsToday.length >= MAX_SCHEDULED_ATTEMPTS_PER_DAY) return false;
  const last = opts.attemptsToday[0];
  return !last || opts.now.getTime() - Date.parse(last.startedAt) >= RETRY_AFTER_MS;
}

export async function tick(repo = new Repo(), now = new Date()): Promise<void> {
  const settings = repo.getSettings();
  const { date } = localParts(settings.timezone, now);
  const hasNewsletterToday = repo.newsletterIdsForDate(date).length > 0;
  // "Vandaag" ruim genomen (36 uur) en daarna gefilterd op de lokale datum.
  const attemptsToday = repo
    .runsSince(new Date(now.getTime() - 36 * 3600e3).toISOString(), "schedule")
    .filter((r) => localParts(settings.timezone, new Date(r.startedAt)).date === date);
  if (!isDue({ now, timezone: settings.timezone, deliveryTime: settings.deliveryTime, hasNewsletterToday, attemptsToday })) return;
  const result = await runPipeline({ trigger: "schedule" }, await defaultDeps());
  console.log(`[news-agent scheduler] ${result.status}: ${result.message}`);
}

const g = globalThis as unknown as { __newsScheduler?: NodeJS.Timeout };

export function startScheduler(): void {
  if (g.__newsScheduler) return;
  console.log("[news-agent scheduler] gestart (controle elke minuut)");
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await tick();
    } catch (err) {
      console.error("[news-agent scheduler] fout:", err);
    } finally {
      busy = false;
    }
  };
  g.__newsScheduler = setInterval(run, 60_000);
  g.__newsScheduler.unref?.();
  setTimeout(run, 10_000).unref?.();
}
