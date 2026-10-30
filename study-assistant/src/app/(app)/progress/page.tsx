import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { loadOverview } from "@/lib/overview";
import { addDays, formatDate, formatMinutes, parseDateKey, pct, toDateKey } from "@/lib/utils";
import { masteryLabel, MASTERED_THRESHOLD, WEAK_THRESHOLD } from "@/lib/mastery";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, masteryTone, PageHeader, Progress, Stat } from "@/components/ui/misc";
import { BarChart, ScoreLine } from "@/components/charts";
import { CourseDot } from "@/components/course-dot";

export const metadata = { title: "Voortgang" };

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const ov = await loadOverview(supabase, user.id);
  const t = parseDateKey(ov.today);
  const course = ov.courses.find((c) => c.id === sp.course) ?? null;
  const inScope = (courseId: string | null) => !course || courseId === course.id;

  // Studietijd per week (laatste 8 weken, week = maandag t/m zondag)
  const monday = addDays(t, -((t.getDay() + 6) % 7));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(monday, -7 * (7 - i));
    const from = toDateKey(start);
    const to = toDateKey(addDays(start, 6));
    const minutes = ov.daily.filter((d) => d.day >= from && d.day <= to && inScope(d.course_id)).reduce((s, d) => s + d.minutes, 0);
    return { label: formatDate(from), value: minutes, sub: `week van ${formatDate(from)}` };
  });
  const byActivity = new Map<string, number>();
  for (const d of ov.daily.filter((d) => inScope(d.course_id))) byActivity.set(d.activity, (byActivity.get(d.activity) ?? 0) + d.minutes);
  const ACT: Record<string, string> = { tutor: "AI-docent", exam: "Oefententamens", flashcards: "Flashcards", reading: "Lezen", planner: "Geplande sessies", other: "Overig" };
  const examPoints = ov.exams
    .filter((e) => e.status === "finished" && e.max_score && inScope(e.course_id))
    .reverse()
    .map((e) => ({ label: formatDate(e.finished_at ?? e.created_at), value: (Number(e.score) / Number(e.max_score)) * 100, title: `${e.title} (${formatDate(e.finished_at ?? e.created_at)})` }));
  const topics = ov.topics.filter((x) => inScope(x.course_id));
  const mastered = topics.filter((x) => x.attempts > 0 && x.mastery >= MASTERED_THRESHOLD);
  const attention = topics.filter((x) => x.attempts > 0 && x.mastery < WEAK_THRESHOLD).sort((a, b) => a.mastery - b.mastery);
  const untested = topics.filter((x) => x.attempts === 0);
  const totalMinutes = course ? (ov.stats.get(course.id)?.totalMinutes ?? 0) : ov.totals.minutes;
  const avg = examPoints.length ? examPoints.reduce((s, p) => s + p.value, 0) / examPoints.length : null;
  const courseName = new Map(ov.courses.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <PageHeader title="Voortgang" description="Gemeten op basis van je oefententamens, flashcards en gelogde studietijd." />
      <div className="flex flex-wrap gap-1.5">
        <Link href="/progress" className={`rounded-lg border px-2.5 py-1 text-xs ${!course ? "border-primary bg-accent font-medium" : "border-border text-muted-foreground"}`}>
          Alle vakken
        </Link>
        {ov.courses.map((c) => (
          <Link key={c.id} href={`/progress?course=${c.id}`} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${course?.id === c.id ? "border-primary bg-accent font-medium" : "border-border text-muted-foreground"}`}>
            <CourseDot color={c.color} /> {c.name}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Totaal gestudeerd" value={formatMinutes(totalMinutes)} />
        <Stat label="Oefenvragen gemaakt" value={course ? "—" : ov.totals.questionsAnswered} sub={course ? "alleen totaal beschikbaar" : `${ov.totals.reviews} flashcard-herhalingen`} />
        <Stat label="Gem. tentamenscore" value={avg === null ? "—" : `${Math.round(avg)}%`} sub={`${examPoints.length} oefententamens`} />
        <Stat label="Onderwerpen beheerst" value={`${mastered.length}/${topics.length}`} sub={`${untested.length} nog niet getoetst`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Studietijd per week</CardTitle>
              <CardDescription>Laatste 8 weken</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <BarChart data={weeks} format={(v) => formatMinutes(v)} />
            {byActivity.size > 0 && (
              <ul className="mt-4 space-y-1 text-xs">
                {[...byActivity.entries()].sort((a, b) => b[1] - a[1]).map(([a, m]) => (
                  <li key={a} className="flex justify-between">
                    <span className="text-muted-foreground">{ACT[a] ?? a}</span>
                    <span className="tabular-nums">{formatMinutes(m)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Oefententamens</CardTitle>
              <CardDescription>Score per tentamen; stippellijn = 55% (voldoende)</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {examPoints.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen afgeronde oefententamens.</p> : <ScoreLine points={examPoints} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Kennisniveau per onderwerp / hoofdstuk</CardTitle>
            <CardDescription>Beheerst ≥ 80% · matig 60–80% · zwak &lt; 60% · ongetoetst = nog geen meting</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen onderwerpen. Ze ontstaan bij het verwerken van documenten of als je ze zelf toevoegt.</p>
          ) : (
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {[...topics].sort((a, b) => (a.attempts ? a.mastery : 2) - (b.attempts ? b.mastery : 2)).map((x) => (
                <li key={x.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {!course && <CourseDot color={courseName.get(x.course_id)?.color} />}
                      <span className="truncate">{x.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-xs tabular-nums text-muted-foreground">{x.attempts ? pct(x.mastery) : "—"}</span>
                      <Badge tone={masteryTone(x.mastery, x.attempts)}>{masteryLabel(x.mastery, x.attempts)}</Badge>
                    </span>
                  </div>
                  <Progress className="mt-1" value={x.attempts ? x.mastery : 0} tone={masteryTone(x.mastery, x.attempts)} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Extra aandacht nodig</CardTitle>
          </CardHeader>
          <CardContent>
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">{untested.length ? `Geen zwakke onderwerpen gemeten, maar ${untested.length} onderwerp(en) zijn nog niet getoetst.` : "Geen zwakke onderwerpen gemeten."}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {attention.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2">
                    <Link href={`/tutor?course=${x.course_id}&mode=explain&topic=${encodeURIComponent(x.name)}`} className="truncate hover:underline">
                      {x.name}
                    </Link>
                    <Badge tone="danger">{pct(x.mastery)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Beheerst</CardTitle>
          </CardHeader>
          <CardContent>
            {mastered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen onderwerpen aantoonbaar beheerst (≥ 80%).</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {mastered.map((x) => (
                  <Badge key={x.id} tone="success">
                    {x.name} · {pct(x.mastery)}
                  </Badge>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
