import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { generatePlan, type PlannerCourse, type PlannerInput, type PlannerOutput } from "@/lib/planner";
import { todayKey } from "@/lib/config";
import type { Course, Topic } from "@/lib/types";

/** Verzamelt de invoer voor de planner uit de database. */
export async function buildPlannerInput(supabase: Supabase, userId: string): Promise<PlannerInput> {
  const today = todayKey();
  const [profileR, coursesR, topicsR, totalsR, examsR, docsR, todayR] = await Promise.all([
    supabase.from("profiles").select("study_days").eq("id", userId).maybeSingle(),
    supabase.from("courses").select("*").eq("archived", false),
    supabase.from("topics").select("id, course_id, name, mastery, attempts"),
    supabase.rpc("study_totals"),
    supabase.from("exams").select("course_id, score, max_score").eq("status", "finished").order("finished_at", { ascending: false }).limit(60),
    supabase.from("documents").select("course_id, page_count").eq("status", "ready"),
    supabase.from("plan_sessions").select("course_id, minutes").eq("date", today).eq("status", "done"),
  ]);
  for (const r of [coursesR, topicsR, totalsR, examsR, docsR, todayR]) if (r.error) throw new Error(r.error.message);
  const courses = (coursesR.data ?? []) as Course[];
  const topics = (topicsR.data ?? []) as Pick<Topic, "id" | "course_id" | "name" | "mastery" | "attempts">[];
  const totals = new Map(((totalsR.data ?? []) as { course_id: string; minutes: number }[]).map((r) => [r.course_id, Number(r.minutes)]));
  const input: PlannerCourse[] = courses.map((c) => {
    const scores = (examsR.data ?? []).filter((e) => e.course_id === c.id && Number(e.max_score) > 0).slice(0, 3);
    const docPages = (docsR.data ?? []).filter((d) => d.course_id === c.id).reduce((s, d) => s + (d.page_count ?? 0), 0);
    return {
      id: c.id,
      name: c.name,
      examDate: c.exam_date,
      materialPages: c.material_pages ?? (docPages > 0 ? docPages : null),
      estimatedHours: c.estimated_hours ? Number(c.estimated_hours) : null,
      difficulty: c.difficulty,
      knowledgeLevel: c.knowledge_level,
      hoursPerWeek: Number(c.hours_per_week),
      studiedMinutes: totals.get(c.id) ?? 0,
      topics: topics.filter((t) => t.course_id === c.id),
      recentExamScore: scores.length ? scores.reduce((s, e) => s + Number(e.score) / Number(e.max_score), 0) / scores.length : null,
      usedToday: (todayR.data ?? []).filter((p) => p.course_id === c.id).reduce((s, p) => s + p.minutes, 0),
    };
  });
  return { today, studyDays: profileR.data?.study_days ?? [1, 2, 3, 4, 5, 6], courses: input };
}

/**
 * Herberekent de planning vanaf vandaag. Afgeronde en eerdere sessies blijven
 * staan (geschiedenis); toekomstige geplande sessies worden vervangen.
 */
export async function regeneratePlan(supabase: Supabase, userId: string): Promise<PlannerOutput> {
  const input = await buildPlannerInput(supabase, userId);
  const today = input.today;
  const out = generatePlan(input);
  const del = await supabase.from("plan_sessions").delete().gte("date", today).eq("status", "planned");
  if (del.error) throw new Error(del.error.message);
  if (out.sessions.length) {
    const rows = out.sessions.map((s) => ({ course_id: s.courseId, date: s.date, minutes: s.minutes, kind: s.kind, title: s.title, topic_id: s.topicId }));
    for (let i = 0; i < rows.length; i += 500) {
      const ins = await supabase.from("plan_sessions").insert(rows.slice(i, i + 500));
      if (ins.error) throw new Error(ins.error.message);
    }
  }
  await supabase.from("profiles").update({ plan_generated_on: today, plan_warnings: out.warnings }).eq("id", userId);
  return out;
}

/** Herplant automatisch één keer per dag (bij het eerste bezoek) of na wijzigingen. */
export async function ensurePlanFresh(supabase: Supabase, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("plan_generated_on").eq("id", userId).maybeSingle();
  if (data?.plan_generated_on === todayKey()) return false;
  const { count } = await supabase.from("courses").select("id", { count: "exact", head: true }).eq("archived", false);
  if (!count) return false;
  await regeneratePlan(supabase, userId);
  return true;
}

/** Markeert de planning als verouderd (bv. na een tentamen of gewijzigd vak). */
export async function invalidatePlan(supabase: Supabase, userId: string) {
  await supabase.from("profiles").update({ plan_generated_on: null }).eq("id", userId);
}
