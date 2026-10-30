import { CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { buildPlannerInput, ensurePlanFresh } from "@/lib/plan-service";
import { generatePlan } from "@/lib/planner";
import type { Course, PlanSession, Profile } from "@/lib/types";
import { addDays, formatLongDate, formatMinutes, parseDateKey, pct, toDateKey } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { CourseDot } from "@/components/course-dot";
import { PlanItem } from "@/components/plan-item";
import { PlannerControls } from "./planner-controls";

export const metadata = { title: "Planner" };

export default async function PlannerPage() {
  const { supabase, user } = await requireUser();
  await ensurePlanFresh(supabase, user.id);
  const input = await buildPlannerInput(supabase, user.id);
  const { estimates } = generatePlan(input);
  const today = input.today;
  const t = parseDateKey(today);
  const [profileR, coursesR, planR] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("courses").select("*").eq("archived", false),
    supabase.from("plan_sessions").select("*").gte("date", toDateKey(addDays(t, -7))).lte("date", toDateKey(addDays(t, 60))).order("date").order("created_at"),
  ]);
  const profile = profileR.data as Profile | null;
  const courses = new Map(((coursesR.data ?? []) as Course[]).map((c) => [c.id, c]));
  const plan = (planR.data ?? []) as PlanSession[];
  const byDate = new Map<string, PlanSession[]>();
  for (const p of plan) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  const past = [...byDate.keys()].filter((d) => d < today);
  const missed = plan.filter((p) => p.date < today && p.status === "planned").reduce((s, p) => s + p.minutes, 0);
  const upcoming = [...byDate.keys()].filter((d) => d >= today);

  return (
    <div>
      <PageHeader
        title="Studieplanner"
        description="Wordt dagelijks automatisch herberekend op basis van je resterende stof, beheersing, gestudeerde tijd en tentamendata."
        actions={<PlannerControls studyDays={profile?.study_days ?? [1, 2, 3, 4, 5, 6]} dailyGoal={profile?.daily_goal_minutes ?? 120} />}
      />
      {courses.size === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Nog niets te plannen">Maak een vak aan met tentamendatum en beschikbare uren.</EmptyState>
      ) : (
        <div className="space-y-6">
          {(profile?.plan_warnings ?? []).filter((w) => w.type !== "exam_passed").map((w) => (
            <Alert key={w.courseId + w.type} tone={w.type === "infeasible" ? "danger" : "warning"}>
              {w.message}
            </Alert>
          ))}
          {missed > 0 && (
            <Alert tone="warning" title={`${formatMinutes(missed)} gemist in de afgelopen week`}>
              Die tijd is niet verloren in de berekening: de resterende stof is opnieuw over de beschikbare dagen verdeeld. Vink sessies af die je wel hebt gedaan.
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {estimates.map((e) => {
              const c = courses.get(e.courseId);
              if (!c) return null;
              return (
                <Card key={e.courseId} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <CourseDot color={c.color} /> <span className="truncate">{c.name}</span>
                    </p>
                    <Badge tone={e.feasible ? "success" : "danger"}>{e.feasible ? "haalbaar" : "krap"}</Badge>
                  </div>
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Nog te doen</dt>
                      <dd className="tabular-nums">{formatMinutes(e.remainingMinutes)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Beschikbaar tot tentamen</dt>
                      <dd className="tabular-nums">
                        {formatMinutes(e.capacityMinutes)} ({e.studyDayCount} dagen)
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Geschatte kennis</dt>
                      <dd className="tabular-nums">{pct(e.knowledge)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-[11px] text-muted-foreground">Studielast: {e.assumption}; gecorrigeerd voor voorkennis +15% herhaling.</p>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Geen komende sessies.</p>}
              {upcoming.map((d) => (
                <Card key={d} className="p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium capitalize">{d === today ? "Vandaag" : formatLongDate(d)}</p>
                    <span className="text-xs text-muted-foreground">{formatMinutes(byDate.get(d)!.reduce((s, p) => s + p.minutes, 0))}</span>
                  </div>
                  {byDate.get(d)!.map((s) => {
                    const c = courses.get(s.course_id);
                    return <PlanItem key={s.id} session={s} courseName={c?.name ?? ""} courseColor={c?.color ?? "slate"} />;
                  })}
                </Card>
              ))}
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold">Afgelopen week</h2>
              {past.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen geplande sessies.</p>
              ) : (
                <div className="space-y-3">
                  {past.reverse().map((d) => (
                    <div key={d}>
                      <p className="text-xs font-medium capitalize text-muted-foreground">{formatLongDate(d)}</p>
                      {byDate.get(d)!.map((s) => {
                        const c = courses.get(s.course_id);
                        return <PlanItem key={s.id} session={s} courseName={c?.name ?? ""} courseColor={c?.color ?? "slate"} past />;
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
