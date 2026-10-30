import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser, ApiError, must, parseBody, route } from "@/lib/api";
import { assertAiAvailable, cachedSystem, generateStructured } from "@/lib/ai/client";
import { FLASHCARD_SYSTEM, flashcardSchema, oneOf } from "@/lib/ai/prompts";
import { config } from "@/lib/config";
import { formatSources, sampleChunks, searchChunks } from "@/lib/search";
import { ensureTopics } from "@/lib/topics";
import { newCardFields } from "@/lib/srs";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  courseId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).max(50).default([]),
  topicId: z.string().uuid().nullish(),
  count: z.number().int().min(3).max(40).default(15),
});

export const POST = route(async (req: Request) => {
  const s = await parseBody(req, bodySchema);
  const { supabase, user } = await apiUser();
  await assertAiAvailable(supabase, user.id);
  const course = must(await supabase.from("courses").select("id, name").eq("id", s.courseId).maybeSingle(), "Vak");
  const { data: topics } = await supabase.from("topics").select("id, name").eq("course_id", s.courseId);
  const topic = s.topicId ? (topics ?? []).find((t) => t.id === s.topicId) : null;
  const want = Math.min(24, Math.max(8, Math.ceil(s.count * 0.8)));
  const chunks = topic
    ? await searchChunks(supabase, topic.name, { courseId: s.courseId, limit: want, documentIds: s.documentIds })
    : await sampleChunks(supabase, s.courseId, want, s.documentIds);
  if (chunks.length === 0) throw new ApiError("Geen verwerkt materiaal gevonden voor deze selectie.", 400);
  const { text, refs } = formatSources(chunks, 2000);
  const { data: existing } = await supabase.from("flashcards").select("front").eq("course_id", s.courseId).order("created_at", { ascending: false }).limit(300);
  const existingFronts = new Set((existing ?? []).map((c) => c.front.trim().toLowerCase()));

  const result = await generateStructured({
    supabase,
    feature: "flashcards_generate",
    model: config.ai.modelGenerate,
    effort: config.ai.effortGenerate,
    system: cachedSystem(FLASHCARD_SYSTEM),
    prompt: `Vak: ${course.name}\nMaak maximaal ${s.count} flashcards${topic ? ` over "${topic.name}"` : ""}.\nBestaande onderwerpnamen: ${(topics ?? []).map((t) => t.name).join("; ") || "(nog geen)"}\nBestaande kaarten (niet dupliceren):\n${[...existingFronts].slice(0, 150).map((f) => `- ${f}`).join("\n") || "(geen)"}\n\n<bronnen>\n${text}\n</bronnen>`,
    schema: flashcardSchema,
    maxTokens: 24000,
  });
  const cards = result.cards.filter((c) => c.front.trim() && c.back.trim() && !existingFronts.has(c.front.trim().toLowerCase())).slice(0, s.count);
  if (cards.length === 0) return NextResponse.json({ created: 0 });
  const topicMap = await ensureTopics(supabase, s.courseId, cards.map((c) => c.topic), "ai");
  const refByLabel = new Map(refs.map((r) => [r.label, r]));
  const now = new Date();
  const rows = cards.map((c) => {
    const ref = refByLabel.get(c.source_id.trim());
    return {
      course_id: s.courseId,
      topic_id: topicMap.get(c.topic.trim().replace(/\s+/g, " ").toLowerCase()) ?? null,
      document_id: ref?.document_id ?? null,
      front: c.front.trim().slice(0, 2000),
      back: c.back.trim().slice(0, 4000),
      card_type: oneOf(c.card_type, ["begrip", "definitie", "theorie", "formule", "overig"] as const, "overig"),
      difficulty: Math.min(3, Math.max(1, c.difficulty)),
      source_location: ref ? [ref.document_name, ref.location].filter(Boolean).join(", ") : null,
      origin: "ai",
      ...newCardFields(now),
    };
  });
  const ins = await supabase.from("flashcards").insert(rows);
  if (ins.error) throw new ApiError(ins.error.message, 500);
  return NextResponse.json({ created: rows.length });
});
