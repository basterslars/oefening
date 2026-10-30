import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { apiUser, ApiError, parseBody, route } from "@/lib/api";
import { assertAiAvailable, cachedSystem, logUsage, streamChat, toAiError } from "@/lib/ai/client";
import { STUDY_LEVEL_LABEL, tutorSystemPrompt } from "@/lib/ai/prompts";
import { config } from "@/lib/config";
import { formatSources, searchChunks } from "@/lib/search";
import { accumulateStudy } from "@/lib/study-time";
import { masteryLabel } from "@/lib/mastery";
import type { TutorMode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  sessionId: z.string().uuid().nullish(),
  courseId: z.string().uuid().nullish(),
  mode: z.enum(["explain", "exam", "practice", "quick"]),
  message: z.string().trim().min(1).max(8000),
});

const HISTORY_MESSAGES = 20;

/**
 * Stuurt NDJSON-regels terug:
 *  {"type":"meta","sessionId","sources"} → {"type":"text","text"}* → {"type":"done"} | {"type":"error","error"}
 */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, bodySchema);
  const { supabase, user } = await apiUser();
  await assertAiAvailable(supabase, user.id);
  const mode = body.mode as TutorMode;

  // Sessie ophalen of aanmaken
  let sessionId = body.sessionId ?? null;
  let courseId = body.courseId ?? null;
  if (sessionId) {
    const { data } = await supabase.from("chat_sessions").select("id, course_id").eq("id", sessionId).maybeSingle();
    if (!data) throw new ApiError("Gesprek niet gevonden.", 404);
    courseId = data.course_id;
    await supabase.from("chat_sessions").update({ mode, updated_at: new Date().toISOString() }).eq("id", sessionId);
  } else {
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({ course_id: courseId, mode, title: body.message.replace(/\s+/g, " ").slice(0, 80) })
      .select("id")
      .single();
    if (error) throw new ApiError(error.message, 500);
    sessionId = data.id as string;
  }

  const [historyR, courseR, profileR, topicsR] = await Promise.all([
    supabase.from("chat_messages").select("role, content").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(HISTORY_MESSAGES),
    courseId ? supabase.from("courses").select("name, knowledge_level").eq("id", courseId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("study_level").eq("id", user.id).maybeSingle(),
    courseId ? supabase.from("topics").select("name, mastery, attempts").eq("course_id", courseId) : Promise.resolve({ data: [] }),
  ]);
  const history = (historyR.data ?? []).reverse();
  await supabase.from("chat_messages").insert({ session_id: sessionId, role: "user", content: body.message });

  // Bronnen: zoek op de vraag, bij korte vervolgvragen aangevuld met de vorige vraag
  const prevUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const query = body.message.length < 60 ? `${body.message} ${prevUser}` : body.message;
  const chunks = await searchChunks(supabase, query, { courseId, limit: mode === "quick" ? 5 : 8 });
  const { text: sourceText, refs } = formatSources(chunks);

  const topics = (topicsR.data ?? []) as { name: string; mastery: number; attempts: number }[];
  const weak = topics.filter((t) => masteryLabel(t.mastery, t.attempts) === "zwak").map((t) => `${t.name} (${Math.round(t.mastery * 100)}%)`);
  const strong = topics.filter((t) => masteryLabel(t.mastery, t.attempts) === "beheerst").map((t) => t.name);
  const context = [
    courseR.data ? `Vak: ${courseR.data.name}` : "Vak: alle vakken",
    `Studiefase: ${STUDY_LEVEL_LABEL[profileR.data?.study_level ?? "bachelor"]}`,
    courseR.data ? `Zelfinschatting kennisniveau: ${courseR.data.knowledge_level}/5` : null,
    weak.length ? `Zwakke onderwerpen (gemeten): ${weak.slice(0, 8).join(", ")}` : null,
    strong.length ? `Beheerste onderwerpen: ${strong.slice(0, 8).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const userTurn = `<context>\n${context}\n</context>\n\n${
    sourceText ? `<bronnen>\n${sourceText}\n</bronnen>` : "<bronnen>Geen relevante fragmenten gevonden in het geüploade materiaal.</bronnen>"
  }\n\nBericht van de student:\n${body.message}`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userTurn },
  ];
  // De API vereist dat het gesprek met een gebruikersbericht begint.
  while (messages.length && messages[0].role !== "user") messages.shift();

  const model = config.ai.modelTutor;
  const effort = mode === "quick" ? "low" : config.ai.effortTutor;
  const encoder = new TextEncoder();
  const line = (o: unknown) => encoder.encode(JSON.stringify(o) + "\n");
  const sid = sessionId;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(line({ type: "meta", sessionId: sid, sources: refs }));
      let full = "";
      try {
        const s = streamChat({ model, effort, system: cachedSystem(tutorSystemPrompt(mode)), messages });
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            full += ev.delta.text;
            controller.enqueue(line({ type: "text", text: ev.delta.text }));
          }
        }
        const final = await s.finalMessage();
        await logUsage(supabase, `tutor_${mode}`, final.model, final.usage);
        if (final.stop_reason === "refusal") {
          full += "\n\n_(Het model heeft dit antwoord afgebroken. Formuleer de vraag anders.)_";
          controller.enqueue(line({ type: "text", text: "\n\n_(Het model heeft dit antwoord afgebroken. Formuleer de vraag anders.)_" }));
        }
        if (final.stop_reason === "max_tokens") {
          controller.enqueue(line({ type: "text", text: "\n\n_(Antwoord afgekapt wegens lengte.)_" }));
        }
        await supabase.from("chat_messages").insert({ session_id: sid, role: "assistant", content: full || "(leeg antwoord)", sources: refs });
        await supabase.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sid);
        await accumulateStudy(supabase, { activity: "tutor", courseId, sourceId: sid, firstMinutes: 2, maxStepMinutes: 5 });
        controller.enqueue(line({ type: "done" }));
      } catch (e) {
        const err = toAiError(e);
        if (full) await supabase.from("chat_messages").insert({ session_id: sid, role: "assistant", content: full + "\n\n_(onderbroken)_", sources: refs });
        controller.enqueue(line({ type: "error", error: err.message }));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});
