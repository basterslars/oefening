import { NextResponse } from "next/server";
import { apiUser, ApiError, route } from "@/lib/api";
import { assertAiAvailable, logUsage, streamChat, cachedSystem } from "@/lib/ai/client";
import { COACH_SYSTEM } from "@/lib/ai/prompts";
import { config } from "@/lib/config";
import { loadOverview } from "@/lib/overview";
import { coursePriorities } from "@/lib/coach";
import { formatMinutes } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Kritische AI-evaluatie van de voortgang, op basis van de objectieve cijfers. */
export const POST = route(async () => {
  const { supabase, user } = await apiUser();
  await assertAiAvailable(supabase, user.id);
  const ov = await loadOverview(supabase, user.id);
  if (ov.courses.length === 0) throw new ApiError("Voeg eerst een vak toe.", 400);
  const stats = {
    vandaag: ov.today,
    studiefase: ov.profile.study_level,
    dagdoel_minuten: ov.profile.daily_goal_minutes,
    studietijd: {
      laatste_7_dagen: formatMinutes(ov.coach.minutesLast7),
      week_daarvoor: formatMinutes(ov.coach.minutesPrev7),
      studiedagen_laatste_7: ov.coach.studyDaysLast7,
      totaal: formatMinutes(ov.totals.minutes),
    },
    vakken: ov.coach.courses.map((c) => ({
      naam: c.name,
      tentamendatum: c.examDate,
      onderwerpen: c.topicCount,
      getoetst: c.testedCount,
      beheersing_pct: Math.round(c.coverageMastery * 100),
      minuten_laatste_7_dagen: Math.round(c.minutesLast7),
      geplande_uren_per_week: c.hoursPerWeek,
      achterstand_minuten: c.backlogMinutes,
      flashcards_te_herhalen: c.dueCards,
      laatste_oefententamen_pct: c.lastExamPct === null ? null : Math.round(c.lastExamPct),
    })),
    onderwerpen: ov.topics
      .filter((t) => t.attempts > 0)
      .map((t) => ({ vak: ov.courses.find((c) => c.id === t.course_id)?.name, naam: t.name, beheersing_pct: Math.round(t.mastery * 100), metingen: t.attempts }))
      .slice(0, 60),
    ongetoetste_onderwerpen: ov.topics.filter((t) => t.attempts === 0).length,
    oefententamens: ov.coach.examScores.slice(0, 10).map((e) => ({ vak: e.courseName, pct: Math.round(e.pct), datum: e.date.slice(0, 10) })),
    beantwoorde_oefenvragen: ov.totals.questionsAnswered,
    flashcard_herhalingen: ov.totals.reviews,
    planning_waarschuwingen: ov.profile.plan_warnings.map((w) => w.message),
    prioriteit_volgens_regels: coursePriorities(ov.coach).map((p) => `${p.courseName}: ${p.reason}`),
  };
  const s = streamChat({
    model: config.ai.modelTutor,
    effort: config.ai.effortTutor,
    system: cachedSystem(COACH_SYSTEM),
    messages: [{ role: "user", content: `Studiegegevens:\n${JSON.stringify(stats, null, 1)}` }],
    maxTokens: 8000,
  });
  const final = await s.finalMessage();
  await logUsage(supabase, "coach_review", final.model, final.usage);
  if (final.stop_reason === "refusal") throw new ApiError("Het model kon geen evaluatie maken. Probeer het later opnieuw.", 422);
  const content = final.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const { data, error } = await supabase.from("coach_reviews").insert({ content, stats }).select("id, content, created_at").single();
  if (error) throw new ApiError(error.message, 500);
  return NextResponse.json(data);
});
