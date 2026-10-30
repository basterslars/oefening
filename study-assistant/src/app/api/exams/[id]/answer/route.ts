import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser, ApiError, must, parseBody, route } from "@/lib/api";
import { assertAiAvailable, cachedSystem, generateStructured } from "@/lib/ai/client";
import { GRADE_SYSTEM, gradeSchema } from "@/lib/ai/prompts";
import { config } from "@/lib/config";
import { gradeLocally, LETTERS } from "@/lib/exam";
import { recordTopicResult } from "@/lib/topics";
import type { ExamQuestion, SourceRef } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({ questionId: z.string().uuid(), answer: z.string().max(10000) });
const GRACE_MS = 2 * 60_000;

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  const { supabase, user } = await apiUser();
  const exam = must(await supabase.from("exams").select("id, status, started_at, time_limit_minutes").eq("id", id).maybeSingle(), "Tentamen");
  if (exam.status !== "in_progress") throw new ApiError("Dit tentamen is al afgerond.", 409);
  if (exam.time_limit_minutes && Date.now() > new Date(exam.started_at).getTime() + exam.time_limit_minutes * 60_000 + GRACE_MS) {
    throw new ApiError("De tijd is om. Rond het tentamen af om je rapport te zien.", 409);
  }
  const q = must(await supabase.from("exam_questions").select("*").eq("id", body.questionId).eq("exam_id", id).maybeSingle(), "Vraag") as ExamQuestion;
  if (q.answered_at) throw new ApiError("Deze vraag is al beantwoord.", 409);

  let grade = gradeLocally(q, body.answer);
  let misconception: string | null = null;
  if (!grade) {
    // Inhoudelijke beoordeling door het (goedkopere) nakijkmodel
    await assertAiAvailable(supabase, user.id);
    const sourceIds = (q.sources ?? []).map((s: SourceRef) => s.id);
    const { data: chunks } = sourceIds.length
      ? await supabase.from("document_chunks").select("content, location").in("id", sourceIds)
      : { data: [] as { content: string; location: string | null }[] };
    const r = await generateStructured({
      supabase,
      feature: "exam_grade",
      model: config.ai.modelFast,
      effort: config.ai.effortFast,
      system: cachedSystem(GRADE_SYSTEM),
      prompt: `<vraag punten="${q.max_points}" type="${q.type}">\n${q.prompt}\n</vraag>\n<modelantwoord>\n${q.correct_answer}\n</modelantwoord>\n<beoordelingsmodel>\n${q.rubric ?? "(geen; beoordeel naar het modelantwoord)"}\n</beoordelingsmodel>\n<bronnen>\n${(chunks ?? []).map((c) => `[${c.location ?? ""}] ${c.content}`).join("\n\n").slice(0, 8000)}\n</bronnen>\n<antwoord_student>\n${body.answer}\n</antwoord_student>\nGeef "points" tussen 0 en ${q.max_points} (halve punten toegestaan).`,
      schema: gradeSchema,
      maxTokens: 4000,
    });
    grade = { points: Math.round(Math.min(Number(q.max_points), Math.max(0, r.points)) * 2) / 2, feedback: r.feedback };
    misconception = r.misconception.trim() || null;
  } else if (q.type === "mc" && grade.points === 0 && q.options) {
    const chosen = LETTERS.indexOf(body.answer.trim().toUpperCase().charAt(0));
    if (chosen >= 0 && q.options[chosen]) misconception = `Koos "${q.options[chosen]}"`;
  }

  const answeredAt = new Date().toISOString();
  const upd = await supabase
    .from("exam_questions")
    .update({ user_answer: body.answer, points: grade.points, feedback: grade.feedback, misconception, answered_at: answeredAt })
    .eq("id", q.id)
    .is("answered_at", null);
  if (upd.error) throw new ApiError(upd.error.message, 500);
  await recordTopicResult(supabase, q.topic_id, grade.points / Number(q.max_points), 1);
  return NextResponse.json({
    points: grade.points,
    max_points: Number(q.max_points),
    feedback: grade.feedback,
    misconception,
    correct_answer: q.correct_answer,
    explanation: q.explanation,
    sources: q.sources,
  });
});
