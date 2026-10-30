import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser, ApiError, must, parseBody, route } from "@/lib/api";
import { RATING_SCORE, reviewCard } from "@/lib/srs";
import { recordTopicResult } from "@/lib/topics";
import { accumulateStudy } from "@/lib/study-time";
import type { Flashcard } from "@/lib/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  elapsedMs: z.number().int().min(0).max(3_600_000).default(0),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { rating, elapsedMs } = await parseBody(req, bodySchema);
  const { supabase } = await apiUser();
  const card = must(await supabase.from("flashcards").select("*, courses(exam_date)").eq("id", id).maybeSingle(), "Kaart") as Flashcard & { courses: { exam_date: string | null } | null };
  const now = new Date();
  // Herhalingen niet na de tentamendatum inplannen: uiterlijk de ochtend ervoor
  const exam = card.courses?.exam_date ? new Date(`${card.courses.exam_date}T06:00:00`) : undefined;
  const cap = exam ? new Date(exam.getTime() - 24 * 3_600_000) : undefined;
  const r = reviewCard(card.fsrs, rating, now, cap);
  const upd = await supabase
    .from("flashcards")
    .update({ fsrs: r.fsrs, due: r.due, state: r.state, reps: r.reps, lapses: r.lapses, last_review: r.last_review, updated_at: now.toISOString() })
    .eq("id", id);
  if (upd.error) throw new ApiError(upd.error.message, 500);
  await supabase.from("flashcard_reviews").insert({ card_id: id, rating, state_before: card.state, elapsed_ms: elapsedMs });
  await recordTopicResult(supabase, card.topic_id, RATING_SCORE[rating], 0.5);
  await accumulateStudy(supabase, { activity: "flashcards", courseId: card.course_id, firstMinutes: Math.max(0.5, Math.min(1, elapsedMs / 60_000)), maxStepMinutes: 1.5 });
  return NextResponse.json({ due: r.due, intervalDays: r.intervalDays, state: r.state, fsrs: r.fsrs });
});
