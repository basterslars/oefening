import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import type { Course, Exam, PlanSession, Profile, Topic } from "@/lib/types";
import { config, todayKey } from "@/lib/config";
import { addDays, parseDateKey, toDateKey } from "@/lib/utils";
import { WEAK_THRESHOLD } from "@/lib/mastery";
import type { CoachCourse, CoachInput } from "@/lib/coach";

export interface CourseStats extends CoachCourse {
  totalMinutes: number;
  documentCount: number;
  pages: number;
  cardsTotal: number;
}

export interface DailyRow {
  day: string;
  course_id: string | null;
  activity: string;
  minutes: number;
}

export interface Overview {
  today: string;
  profile: Profile;
  courses: Course[];
  topics: Topic[];
  stats: Map<string, CourseStats>;
  plan: PlanSession[];
  exams: Pick<Exam, "id" | "course_id" | "title" | "score" | "max_score" | "finished_at" | "status" | "created_at">[];
  daily: DailyRow[];
  totals: { minutes: number; questionsAnswered: number; reviews: number; avgExamPct: number | null };
  coach: CoachInput;
}

/** Laadt alle gegevens voor dashboard, coach en voortgang in één keer. */
export async function loadOverview(supabase: Supabase, userId: string): Promise<Overview> {
  const today = todayKey();
  const t = parseDateKey(today);
  const since = toDateKey(addDays(t, -90));
  const [profileR, coursesR, topicsR, docsR, totalsR, dailyR, planR, examsR, cardsR, qCountR, rCountR] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("courses").select("*").eq("archived", false).order("exam_date", { ascending: true, nullsFirst: false }),
    supabase.from("topics").select("*").order("name"),
    supabase.from("documents").select("course_id, page_count, status"),
    supabase.rpc("study_totals"),
    supabase.rpc("study_daily", { p_since: since, p_tz: config.timeZone }),
    supabase.from("plan_sessions").select("*").gte("date", toDateKey(addDays(t, -14))).lte("date", toDateKey(addDays(t, 21))).order("date"),
    supabase.from("exams").select("id, course_id, title, score, max_score, finished_at, status, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.rpc("flashcard_counts"),
    supabase.from("exam_questions").select("id", { count: "exact", head: true }).not("answered_at", "is", null),
    supabase.from("flashcard_reviews").select("id", { count: "exact", head: true }),
  ]);
  for (const r of [coursesR, topicsR, docsR, totalsR, dailyR, planR, examsR, cardsR]) if (r.error) throw new Error(r.error.message);
  const profile: Profile = profileR.data ?? { id: userId, display_name: null, study_level: "bachelor", study_days: [1, 2, 3, 4, 5, 6], daily_goal_minutes: 120, plan_generated_on: null, plan_warnings: [] };
  const courses = (coursesR.data ?? []) as Course[];
  const topics = (topicsR.data ?? []) as Topic[];
  const plan = (planR.data ?? []) as PlanSession[];
  const exams = (examsR.data ?? []) as Overview["exams"];
  const daily = ((dailyR.data ?? []) as DailyRow[]).map((d) => ({ ...d, day: String(d.day).slice(0, 10), minutes: Number(d.minutes) }));
  const totalsByCourse = new Map(((totalsR.data ?? []) as { course_id: string | null; minutes: number }[]).map((r) => [r.course_id, Number(r.minutes)]));
  const cards = new Map(((cardsR.data ?? []) as { course_id: string; total: number; due: number }[]).map((r) => [r.course_id, r]));

  const d7 = toDateKey(addDays(t, -6));
  const d14 = toDateKey(addDays(t, -13));
  const stats = new Map<string, CourseStats>();
  for (const c of courses) {
    const ct = topics.filter((x) => x.course_id === c.id);
    const tested = ct.filter((x) => x.attempts > 0);
    const finished = exams.filter((e) => e.course_id === c.id && e.status === "finished" && e.max_score);
    const docs = (docsR.data ?? []).filter((d) => d.course_id === c.id);
    stats.set(c.id, {
      id: c.id,
      name: c.name,
      examDate: c.exam_date,
      topicCount: ct.length,
      testedCount: tested.length,
      coverageMastery: ct.length ? ct.reduce((s, x) => s + (x.attempts > 0 ? x.mastery : 0), 0) / ct.length : 0,
      minutesLast7: daily.filter((d) => d.course_id === c.id && d.day >= d7).reduce((s, d) => s + d.minutes, 0),
      hoursPerWeek: Number(c.hours_per_week),
      backlogMinutes: plan.filter((p) => p.course_id === c.id && p.date < today && p.status === "planned").reduce((s, p) => s + p.minutes, 0),
      dueCards: Number(cards.get(c.id)?.due ?? 0),
      lastExamPct: finished[0] ? (Number(finished[0].score) / Number(finished[0].max_score)) * 100 : null,
      totalMinutes: totalsByCourse.get(c.id) ?? 0,
      documentCount: docs.length,
      pages: docs.reduce((s, d) => s + (d.page_count ?? 0), 0),
      cardsTotal: Number(cards.get(c.id)?.total ?? 0),
    });
  }
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const weakTopics = topics
    .filter((x) => x.attempts > 0 && x.mastery < WEAK_THRESHOLD && courseName.has(x.course_id))
    .sort((a, b) => a.mastery - b.mastery)
    .map((x) => ({ courseId: x.course_id, courseName: courseName.get(x.course_id)!, topicId: x.id, name: x.name, mastery: x.mastery }));
  const finishedExams = exams.filter((e) => e.status === "finished" && e.max_score);
  const examScores = finishedExams.map((e) => ({ courseName: courseName.get(e.course_id) ?? "", pct: (Number(e.score) / Number(e.max_score)) * 100, date: e.finished_at ?? e.created_at }));
  const dayMinutes = (from: string, to: string) => daily.filter((d) => d.day >= from && d.day <= to).reduce((s, d) => s + d.minutes, 0);
  const coach: CoachInput = {
    today,
    courses: [...stats.values()],
    weakTopics,
    todaySessions: plan.filter((p) => p.date === today).map((p) => ({ id: p.id, courseId: p.course_id, title: p.title, minutes: p.minutes, status: p.status })),
    todayMinutes: dayMinutes(today, today),
    dailyGoalMinutes: profile.daily_goal_minutes,
    minutesLast7: dayMinutes(d7, today),
    minutesPrev7: dayMinutes(d14, toDateKey(addDays(t, -7))),
    studyDaysLast7: new Set(daily.filter((d) => d.day >= d7).map((d) => d.day)).size,
    examScores,
    dueCardsTotal: [...cards.values()].reduce((s, c) => s + Number(c.due), 0),
    infeasibleCourses: (profile.plan_warnings ?? []).filter((w) => w.type === "infeasible").map((w) => w.courseName),
  };
  return {
    today,
    profile,
    courses,
    topics,
    stats,
    plan,
    exams,
    daily,
    totals: {
      minutes: [...totalsByCourse.values()].reduce((s, m) => s + m, 0),
      questionsAnswered: qCountR.count ?? 0,
      reviews: rCountR.count ?? 0,
      avgExamPct: examScores.length ? examScores.reduce((s, e) => s + e.pct, 0) / examScores.length : null,
    },
    coach,
  };
}
