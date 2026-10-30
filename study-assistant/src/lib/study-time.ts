import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types";

const IDLE_MS = 15 * 60_000;

/**
 * Telt actieve studietijd op in één doorlopende sessie per activiteit. Een gat
 * van meer dan 15 minuten start een nieuwe sessie; per stap tellen we maximaal
 * `maxStepMinutes`, zodat een openstaand tabblad geen studietijd oplevert.
 */
export async function accumulateStudy(
  supabase: Supabase,
  opts: { activity: Activity; courseId: string | null; sourceId?: string | null; firstMinutes: number; maxStepMinutes: number },
) {
  const now = new Date();
  let q = supabase
    .from("study_sessions")
    .select("id, minutes, ended_at")
    .eq("activity", opts.activity)
    .gte("ended_at", new Date(now.getTime() - IDLE_MS).toISOString())
    .order("ended_at", { ascending: false })
    .limit(1);
  q = opts.sourceId ? q.eq("source_id", opts.sourceId) : opts.courseId ? q.eq("course_id", opts.courseId) : q.is("course_id", null);
  const { data } = await q.maybeSingle();
  if (data) {
    const gapMin = (now.getTime() - new Date(data.ended_at).getTime()) / 60_000;
    const add = Math.min(opts.maxStepMinutes, Math.max(0, gapMin));
    await supabase
      .from("study_sessions")
      .update({ minutes: Math.min(720, Math.round((Number(data.minutes) + add) * 10) / 10), ended_at: now.toISOString() })
      .eq("id", data.id);
  } else {
    await supabase.from("study_sessions").insert({
      activity: opts.activity,
      course_id: opts.courseId,
      source_id: opts.sourceId ?? null,
      minutes: opts.firstMinutes,
      started_at: now.toISOString(),
      ended_at: now.toISOString(),
    });
  }
}
