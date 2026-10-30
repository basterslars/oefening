import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser, ApiError, must, parseBody, route } from "@/lib/api";
import { assertAiAvailable, cachedSystem, generateStructured } from "@/lib/ai/client";
import { EXAM_SYSTEM, examSchema } from "@/lib/ai/prompts";

const QUESTION_TYPES = ["mc", "open", "case", "calculation", "concept", "application"] as const;
import { config } from "@/lib/config";
import { formatSources, sampleChunks, searchChunks, type RetrievedChunk } from "@/lib/search";
import { ensureTopics } from "@/lib/topics";
import { LETTERS, QUESTION_TYPE_LABELS } from "@/lib/exam";
import type { QuestionType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  courseId: z.string().uuid(),
  questionCount: z.number().int().min(1).max(40),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  types: z.array(z.enum(["mc", "open", "case", "calculation", "concept", "application"])).min(1),
  topicIds: z.array(z.string().uuid()).max(30).default([]),
  documentIds: z.array(z.string().uuid()).max(50).default([]),
  timeLimitMinutes: z.number().int().min(1).max(600).nullable(),
  focusWeakTopics: z.boolean().default(true),
});

const DIFFICULTY_LABEL = { 1: "basis (reproductie en begrip)", 2: "gemiddeld (toepassing)", 3: "moeilijk (analyse en complexe toepassing)" };

/** Verdeelt het aantal vragen zo gelijk mogelijk over de gekozen typen. */
function distribution(types: QuestionType[], n: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) out[types[i % types.length]] = (out[types[i % types.length]] ?? 0) + 1;
  return out;
}

export const POST = route(async (req: Request) => {
  const s = await parseBody(req, bodySchema);
  const { supabase, user } = await apiUser();
  await assertAiAvailable(supabase, user.id);
  const course = must(await supabase.from("courses").select("id, name").eq("id", s.courseId).maybeSingle(), "Vak");
  const { data: topics } = await supabase.from("topics").select("id, name, mastery, attempts").eq("course_id", s.courseId);
  const allTopics = topics ?? [];

  // Bronfragmenten verzamelen: gekozen onderwerpen, zwakke onderwerpen, aangevuld met een spreiding over het materiaal
  const target = Math.min(36, Math.max(10, s.questionCount * 3));
  const picked = new Map<string, RetrievedChunk>();
  const add = (list: RetrievedChunk[]) => list.forEach((c) => picked.size < target && picked.set(c.id, c));
  const focusTopics = allTopics.filter((t) => s.topicIds.includes(t.id));
  const weakTopics = s.focusWeakTopics && focusTopics.length === 0
    ? allTopics.filter((t) => t.attempts > 0 && t.mastery < 0.6).sort((a, b) => a.mastery - b.mastery).slice(0, 4)
    : [];
  for (const t of [...focusTopics, ...weakTopics]) {
    add(await searchChunks(supabase, t.name, { courseId: s.courseId, limit: focusTopics.length ? 8 : 4, documentIds: s.documentIds }));
  }
  if (focusTopics.length === 0 || picked.size < 6) add(await sampleChunks(supabase, s.courseId, target, s.documentIds));
  if (picked.size === 0) throw new ApiError("Er is nog geen verwerkt studiemateriaal voor dit vak (of de selectie). Upload eerst documenten.", 400);
  const chunks = [...picked.values()];
  const { text: sourceText, refs } = formatSources(chunks, 1800);

  const dist = distribution(s.types as QuestionType[], s.questionCount);
  const prompt = `Vak: ${course.name}
Maak precies ${s.questionCount} vragen met deze verdeling: ${Object.entries(dist).map(([t, n]) => `${n}× ${t} (${QUESTION_TYPE_LABELS[t as QuestionType]})`).join(", ")}.
Moeilijkheidsgraad: ${DIFFICULTY_LABEL[s.difficulty]}. Varieer binnen dit niveau.
${focusTopics.length ? `Beperk je tot deze onderwerpen: ${focusTopics.map((t) => t.name).join("; ")}.` : ""}
${weakTopics.length ? `De student is zwak in: ${weakTopics.map((t) => t.name).join("; ")}. Laat ongeveer de helft van de vragen hierover gaan.` : ""}
Bestaande onderwerpnamen: ${allTopics.map((t) => t.name).join("; ") || "(nog geen)"}
Punten: meerkeuze 1 punt; begripsvragen 2; open, reken- en toepassingsvragen 2–4; casussen 4–6 (afhankelijk van het aantal deelstappen).
Voor niet-meerkeuzevragen: "options" is een lege lijst.

<bronnen>
${sourceText}
</bronnen>`;

  const result = await generateStructured({
    supabase,
    feature: "exam_generate",
    model: config.ai.modelGenerate,
    effort: config.ai.effortGenerate,
    system: cachedSystem(EXAM_SYSTEM),
    prompt,
    schema: examSchema,
    maxTokens: 48000,
  });

  const valid = result.questions
    .map((q) => ({ ...q, type: q.type.trim().toLowerCase() }))
    .filter((q) => (QUESTION_TYPES as readonly string[]).includes(q.type))
    .filter((q) => {
    if (!q.prompt.trim() || !q.correct_answer.trim()) return false;
    if (q.type === "mc") return q.options.length >= 3 && q.options.length <= 6 && LETTERS.slice(0, q.options.length).includes(q.correct_answer.trim().charAt(0).toUpperCase());
    return true;
  });
  if (valid.length === 0) throw new ApiError("Er konden geen bruikbare vragen worden gegenereerd. Probeer het opnieuw of kies ander materiaal.", 502);

  const topicMap = await ensureTopics(supabase, s.courseId, valid.map((q) => q.topic), "ai");
  const refByLabel = new Map(refs.map((r) => [r.label, r]));
  const { data: exam, error } = await supabase
    .from("exams")
    .insert({
      course_id: s.courseId,
      title: `${course.name} — ${focusTopics.length ? focusTopics.map((t) => t.name).slice(0, 3).join(", ") : "oefententamen"}`,
      settings: s,
      time_limit_minutes: s.timeLimitMinutes,
    })
    .select("id")
    .single();
  if (error) throw new ApiError(error.message, 500);
  const rows = valid.slice(0, s.questionCount).map((q, i) => ({
    exam_id: exam.id,
    position: i + 1,
    type: q.type,
    topic_id: topicMap.get(q.topic.trim().replace(/\s+/g, " ").toLowerCase()) ?? null,
    topic_name: q.topic.trim(),
    difficulty: Math.min(3, Math.max(1, Math.round(q.difficulty))),
    prompt: q.prompt.trim(),
    options: q.type === "mc" ? q.options.map((o) => o.replace(/^[A-F][).:]\s+/, "").trim()) : null,
    correct_answer: q.type === "mc" ? q.correct_answer.trim().charAt(0).toUpperCase() : q.correct_answer.trim(),
    explanation: q.explanation,
    rubric: q.rubric || null,
    sources: q.source_ids.map((id) => refByLabel.get(id.trim())).filter(Boolean),
    max_points: q.type === "mc" ? 1 : Math.min(10, Math.max(1, q.max_points || 2)),
  }));
  const ins = await supabase.from("exam_questions").insert(rows);
  if (ins.error) {
    await supabase.from("exams").delete().eq("id", exam.id);
    throw new ApiError(ins.error.message, 500);
  }
  return NextResponse.json({ examId: exam.id, generated: rows.length, requested: s.questionCount });
});
