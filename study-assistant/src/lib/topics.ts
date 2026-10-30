import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import { updateMastery } from "@/lib/mastery";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 160);

/** Zorgt dat onderwerpen bestaan; geeft map lower(naam) → id. */
export async function ensureTopics(supabase: Supabase, courseId: string, names: string[], source: "ai" | "manual" = "ai") {
  const wanted = [...new Map(names.map(norm).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()];
  const load = async () => {
    const { data, error } = await supabase.from("topics").select("id, name").eq("course_id", courseId);
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map((t) => [t.name.toLowerCase(), t.id as string]));
  };
  let map = await load();
  const missing = wanted.filter((n) => !map.has(n.toLowerCase()));
  if (missing.length) {
    const { error } = await supabase.from("topics").insert(missing.map((name) => ({ course_id: courseId, name, source })));
    if (error && error.code !== "23505") throw new Error(error.message);
    map = await load();
  }
  return map;
}

/** Werkt beheersing van een onderwerp bij (score 0..1). */
export async function recordTopicResult(supabase: Supabase, topicId: string | null, score: number, weight = 1) {
  if (!topicId) return;
  const { data } = await supabase.from("topics").select("mastery, attempts, correct").eq("id", topicId).maybeSingle();
  if (!data) return;
  const next = updateMastery({ mastery: data.mastery, attempts: data.attempts, correct: Number(data.correct) }, score, weight);
  await supabase
    .from("topics")
    .update({ ...next, last_studied_at: new Date().toISOString() })
    .eq("id", topicId);
}
