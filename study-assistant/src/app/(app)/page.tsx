import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpen, CalendarClock, CheckCircle2, ClipboardCheck, Layers, MessageSquareText, Sparkles, Upload } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { ensurePlanFresh } from "@/lib/plan-service";
import { loadOverview } from "@/lib/overview";
import { buildInsights, dailyGoals } from "@/lib/coach";
import { addDays, daysBetween, formatDate, formatLongDate, formatMinutes, parseDateKey, pct, toDateKey } from "@/lib/utils";
import { masteryLabel } from "@/lib/mastery";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, masteryTone, Progress, Stat } from "@/components/ui/misc";
import { CourseDot } from "@/components/course-dot";
import { PlanItem } from "@/components/plan-item";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hourCycle: "h23", timeZone: process.env.APP_TIMEZONE || "Europe/Amsterdam" }).format(new Date()));
  return h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  await ensurePlanFresh(supabase, user.id);
  const ov = await loadOverview(supabase, user.id);
  const name = ov.profile.display_name;
  const courseById = new Map(ov.courses.map((c) => [c.id, c]));

  if (ov.courses.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welkom{name ? `, ${name}` : ""}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Begin met het aanmaken van je eerste vak. Daarna upload je je studiemateriaal.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { n: 1, t: "Maak een vak aan", d: "Met tentamendatum en beschikbare uren per week." },
            { n: 2, t: "Upload je materiaal", d: "PDF, PowerPoint, Word, Excel of tekst." },
            { n: 3, t: "Studeer met AI", d: "Vraag uitleg, maak oefententamens en flashcards." },
          ].map((s) => (
            <Card key={s.n} className="p-5">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{s.n}</span>
              <p className="mt-3 text-sm font-medium">{s.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </Card>
          ))}
        </div>
        <Link href="/courses?new=1" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
          <BookOpen /> Eerste vak aanmaken
        </Link>
      </div>
    );
  }

  const goals = dailyGoals(ov.coach);
  const insights = buildInsights(ov.coach).filter((i) => i.level !== "info").slice(0, 3);
  const t = parseDateKey(ov.today);
  const upcomingExams = ov.courses
    .filter((c) => c.exam_date && c.exam_date >= ov.today)
    .sort((a, b) => a.exam_date!.localeCompare(b.exam_date!))
    .slice(0, 4);
  const nextDays = [0, 1, 2].map((i) => toDateKey(addDays(t, i)));
  const weak = ov.coach.weakTopics.slice(0, 6);
  const recent = ov.topics
    .filter((x) => x.last_studied_at && courseById.has(x.course_id))
    .sort((a, b) => b.last_studied_at!.localeCompare(a.last_studied_at!))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm capitalize text-muted-foreground">{formatLongDate(ov.today)}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/tutor" className={buttonVariants()}>
            <MessageSquareText /> Vraag de AI-docent
          </Link>
          <Link href="/exams/new" className={buttonVariants({ variant: "outline" })}>
            <ClipboardCheck /> Oefententamen
          </Link>
          <Link href="/flashcards/review" className={buttonVariants({ variant: "outline" })}>
            <Layers /> Flashcards
          </Link>
          <Link href="/courses" className={buttonVariants({ variant: "outline" })}>
            <Upload /> Upload
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vandaag gestudeerd" value={formatMinutes(ov.coach.todayMinutes)} sub={`doel ${formatMinutes(ov.profile.daily_goal_minutes)}`} />
        <Stat label="Afgelopen 7 dagen" value={formatMinutes(ov.coach.minutesLast7)} sub={`${ov.coach.studyDaysLast7} studiedagen`} />
        <Stat label="Flashcards te herhalen" value={ov.coach.dueCardsTotal} />
        <Stat label="Gem. tentamenscore" value={ov.totals.avgExamPct === null ? "—" : `${Math.round(ov.totals.avgExamPct)}%`} sub={`${ov.totals.questionsAnswered} vragen gemaakt`} />
      </div>

      {insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((i) => (
            <div
              key={i.title}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
                i.level === "urgent" ? "border-danger/40 bg-danger/5" : i.level === "warning" ? "border-warning/50 bg-warning/8" : "border-success/40 bg-success/5",
              )}
            >
              {i.level === "positive" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", i.level === "urgent" ? "text-danger" : "text-warning")} />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{i.title}</p>
                <p className="text-muted-foreground">{i.detail}</p>
              </div>
              {i.href && (
                <Link href={i.href} className="shrink-0 text-xs font-medium text-primary hover:underline">
                  {i.action ?? "Bekijk"}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Dagdoelen</CardTitle>
                <CardDescription>Voorgesteld op basis van je planning, flashcards en zwakke onderwerpen</CardDescription>
              </div>
              <Link href="/coach" className="text-xs font-medium text-primary hover:underline">
                Coach
              </Link>
            </CardHeader>
            <CardContent>
              {goals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen doelen voor vandaag. Vul tentamendata en uren per week in bij je vakken.</p>
              ) : (
                <ul className="space-y-1.5">
                  {goals.map((g) => (
                    <li key={g.label}>
                      <Link href={g.href} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", g.done ? "border-success bg-success text-white" : "border-border")}>
                          {g.done && <CheckCircle2 className="size-3.5" />}
                        </span>
                        <span className={cn("flex-1", g.done && "text-muted-foreground line-through")}>{g.label}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Studieplanning</CardTitle>
                <CardDescription>Vandaag en de komende twee dagen</CardDescription>
              </div>
              <Link href="/planner" className="text-xs font-medium text-primary hover:underline">
                Volledige planning
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              {nextDays.map((d) => {
                const sessions = ov.plan.filter((p) => p.date === d);
                return (
                  <div key={d}>
                    <p className="mb-1 text-xs font-medium capitalize text-muted-foreground">{d === ov.today ? "Vandaag" : formatLongDate(d)}</p>
                    {sessions.length === 0 ? (
                      <p className="px-2 text-sm text-muted-foreground">Niets gepland.</p>
                    ) : (
                      sessions.map((s) => {
                        const c = courseById.get(s.course_id);
                        return <PlanItem key={s.id} session={s} courseName={c?.name ?? ""} courseColor={c?.color ?? "slate"} />;
                      })
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mijn vakken</CardTitle>
              <Link href="/courses" className="text-xs font-medium text-primary hover:underline">
                Alle vakken
              </Link>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {ov.courses.map((c) => {
                const s = ov.stats.get(c.id)!;
                return (
                  <Link key={c.id} href={`/courses/${c.id}`} className="rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <CourseDot color={c.color} />
                      <p className="truncate text-sm font-medium">{c.name}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Beheersing</span>
                      <span className="tabular-nums">{pct(s.coverageMastery)}</span>
                    </div>
                    <Progress className="mt-1" value={s.coverageMastery} tone={s.topicCount ? masteryTone(s.coverageMastery) : "neutral"} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {s.documentCount} document{s.documentCount === 1 ? "" : "en"} · {s.testedCount}/{s.topicCount} onderwerpen getoetst · {formatMinutes(s.totalMinutes)} gestudeerd
                    </p>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aankomende tentamens</CardTitle>
              <CalendarClock className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {upcomingExams.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen tentamendata ingevuld.</p>
              ) : (
                <ul className="space-y-3">
                  {upcomingExams.map((c) => {
                    const days = daysBetween(t, parseDateKey(c.exam_date!));
                    const s = ov.stats.get(c.id)!;
                    return (
                      <li key={c.id} className="flex items-center gap-3">
                        <div className={cn("flex w-12 shrink-0 flex-col items-center rounded-lg py-1", days <= 7 ? "bg-danger/10 text-danger" : days <= 21 ? "bg-warning/15" : "bg-muted")}>
                          <span className="text-lg font-semibold leading-none tabular-nums">{days}</span>
                          <span className="text-[10px]">{days === 1 ? "dag" : "dagen"}</span>
                        </div>
                        <div className="min-w-0">
                          <Link href={`/courses/${c.id}`} className="block truncate text-sm font-medium hover:underline">
                            {c.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(c.exam_date!)} · {pct(s.coverageMastery)} beheerst
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Zwakke onderwerpen</CardTitle>
                <CardDescription>Gemeten onder 60%</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {weak.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {ov.topics.some((x) => x.attempts > 0) ? "Geen zwakke onderwerpen gemeten." : "Nog niets gemeten. Maak een oefententamen of oefen flashcards."}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {weak.map((w) => (
                    <li key={w.topicId}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/tutor?course=${w.courseId}&mode=practice&topic=${encodeURIComponent(w.name)}`} className="truncate hover:underline" title="Oefen met de AI-docent">
                          {w.name}
                        </Link>
                        <Badge tone="danger">{pct(w.mastery)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{w.courseName}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent bestudeerd</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen activiteit.</p>
              ) : (
                <ul className="space-y-2">
                  {recent.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <CourseDot color={courseById.get(r.course_id)?.color} />
                        <span className="truncate">{r.name}</span>
                      </span>
                      <Badge tone={masteryTone(r.mastery, r.attempts)}>{masteryLabel(r.mastery, r.attempts)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Link href="/tutor" className="flex items-center gap-3 rounded-xl border border-primary/30 bg-accent/60 p-4 transition-colors hover:bg-accent">
            <Sparkles className="size-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Chat met je AI-docent</p>
              <p className="text-xs text-muted-foreground">Uitleg, oefenen of tentamentraining op basis van je eigen materiaal</p>
            </div>
            <ArrowRight className="size-4 text-primary" />
          </Link>
        </div>
      </div>
    </div>
  );
}
