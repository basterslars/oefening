import { NextResponse } from "next/server";
import { apiUser, ApiError, must, route } from "@/lib/api";
import { buildReport } from "@/lib/exam";
import { recordTopicResult } from "@/lib/topics";
import { invalidatePlan } from "@/lib/plan-service";
import type { ExamQuestion } from "@/lib/types";

export const runtime = "nodejs";

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { supabase, user } = await apiUser();
  const exam = must(await supabase.from("exams").select("*").eq("id", id).maybeSingle(), "Tentamen");
  if (exam.status === "finished") return NextResponse.json({ report: exam.report });
  const finishedAt = new Date().toISOString();

  // Onbeantwoorde vragen: 0 punten; telt half mee voor beheersing (je wist het niet of kwam niet toe).
  const open = await supabase.from("exam_questions").select("id, topic_id").eq("exam_id", id).is("answered_at", null);
  for (const q of open.data ?? []) {
    await supabase.from("exam_questions").update({ points: 0, feedback: "Niet beantwoord.", answered_at: finishedAt }).eq("id", q.id);
    await recordTopicResult(supabase, q.topic_id, 0, 0.5);
  }
  const questions = must(await supabase.from("exam_questions").select("*").eq("exam_id", id).order("position"), "Vragen") as ExamQuestion[];
  // Lege antwoorden gelden niet als beantwoord in het rapport
  const report = buildReport(
    questions.map((q) => ({ ...q, answered_at: q.user_answer ? q.answered_at : null })),
    exam.started_at,
    finishedAt,
  );
  const upd = await supabase
    .from("exams")
    .update({ status: "finished", finished_at: finishedAt, score: report.score, max_score: report.maxScore, report })
    .eq("id", id);
  if (upd.error) throw new ApiError(upd.error.message, 500);
  const minutes = Math.min(600, Math.max(1, report.durationMinutes));
  await supabase.from("study_sessions").insert({ course_id: exam.course_id, activity: "exam", minutes, started_at: exam.started_at, ended_at: finishedAt, source_id: exam.id });
  // Resultaten veranderen de prioriteiten: planning bij volgend bezoek herberekenen
  await invalidatePlan(supabase, user.id);
  return NextResponse.json({ report });
});
