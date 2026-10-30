import { NextResponse } from "next/server";
import { apiUser, ApiError, must, route } from "@/lib/api";
import { extractDocument } from "@/lib/docs/extract";
import { chunkSegments, countWords } from "@/lib/docs/text";
import { categorize, extractKeyTerms, headingTopics } from "@/lib/docs/analyze";
import { embedDocuments, toPgVector } from "@/lib/embeddings";
import { assertAiAvailable, generateStructured, cachedSystem } from "@/lib/ai/client";
import { ANALYZE_SYSTEM, analyzeSchema, oneOf } from "@/lib/ai/prompts";
import { CATEGORIES } from "@/lib/docs/analyze";
import { config } from "@/lib/config";
import { ensureTopics } from "@/lib/topics";
import { invalidatePlan } from "@/lib/plan-service";
import { errorMessage } from "@/lib/utils";
import type { DocumentRow, KeyTerm } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const ANALYSIS_CHAR_BUDGET = 60_000;

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { supabase, user } = await apiUser();
  const doc = must(await supabase.from("documents").select("*").eq("id", id).maybeSingle(), "Document") as DocumentRow;
  // Opnieuw verwerken is idempotent: bestaande fragmenten worden vervangen.
  await supabase.from("documents").update({ status: "processing", error: null }).eq("id", id);
  try {
    const file = await supabase.storage.from("documents").download(doc.storage_path);
    if (file.error || !file.data) throw new ApiError("Bestand niet gevonden in opslag.", 404);
    const buf = new Uint8Array(await file.data.arrayBuffer());
    const { segments, pageCount, warnings } = await extractDocument(buf, doc.file_type);
    const chunks = chunkSegments(segments);
    if (chunks.length === 0) throw new ApiError(warnings[0] ?? "Er kon geen tekst uit dit bestand worden gehaald.", 422);

    // Fragmenten (opnieuw) opslaan, optioneel met embeddings
    await supabase.from("document_chunks").delete().eq("document_id", id);
    let embeddings: number[][] | null = null;
    try {
      embeddings = await embedDocuments(chunks.map((c) => [c.heading, c.content].filter(Boolean).join("\n")));
    } catch (e) {
      warnings.push(`Semantische index niet aangemaakt: ${errorMessage(e)}`);
    }
    const rows = chunks.map((c, i) => ({
      course_id: doc.course_id,
      document_id: id,
      chunk_index: c.index,
      location: c.location,
      heading: c.heading,
      content: c.content,
      embedding: embeddings ? toPgVector(embeddings[i]) : null,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const ins = await supabase.from("document_chunks").insert(rows.slice(i, i + 200));
      if (ins.error) throw new ApiError(`Opslaan van fragmenten mislukt: ${ins.error.message}`, 500);
    }

    // Lokale analyse (gratis), daarna optioneel verrijkt door AI
    const fullText = chunks.map((c) => c.content).join("\n\n");
    let category: string = categorize(doc.name, doc.file_type, fullText);
    let keyTerms: KeyTerm[] = extractKeyTerms(segments);
    let topics = headingTopics(segments);
    let summary: string | null = null;
    let analyzedBy: "local" | "ai" = "local";
    if (config.ai.enabled && config.ai.analyzeDocuments) {
      try {
        await assertAiAvailable(supabase, user.id);
        const { data: existing } = await supabase.from("topics").select("name").eq("course_id", doc.course_id);
        // Bij grote documenten: gelijkmatige steekproef van fragmenten binnen het budget
        const per = Math.max(1, Math.ceil(fullText.length / ANALYSIS_CHAR_BUDGET));
        const sample = chunks
          .filter((_, i) => i % per === 0)
          .map((c) => `[${c.location ?? ""}] ${c.content}`)
          .join("\n\n")
          .slice(0, ANALYSIS_CHAR_BUDGET);
        const coverage = per > 1 ? `\n(Let op: dit is een steekproef van ongeveer 1 op ${per} fragmenten uit een lang document.)` : "";
        const result = await generateStructured({
          supabase,
          feature: "document_analysis",
          model: config.ai.modelFast,
          effort: config.ai.effortFast,
          system: cachedSystem(ANALYZE_SYSTEM),
          prompt: `Bestandsnaam: ${doc.name}\nBestaande onderwerpen in dit vak: ${(existing ?? []).map((t) => t.name).join("; ") || "(nog geen)"}${coverage}\n\n<document>\n${sample}\n</document>`,
          schema: analyzeSchema,
          maxTokens: 8000,
        });
        summary = result.summary;
        category = oneOf(result.category, CATEGORIES, category as (typeof CATEGORIES)[number]);
        topics = result.topics.slice(0, 12);
        const aiTerms = result.key_terms.map((k) => ({ term: k.term, definition: k.definition || undefined }));
        const seen = new Set(aiTerms.map((k) => k.term.toLowerCase()));
        keyTerms = [...aiTerms, ...keyTerms.filter((k) => !seen.has(k.term.toLowerCase()))].slice(0, 40);
        analyzedBy = "ai";
        await ensureTopics(supabase, doc.course_id, topics, "ai");
      } catch (e) {
        warnings.push(`AI-analyse overgeslagen: ${errorMessage(e)}`);
      }
    }
    const words = countWords(fullText);
    await supabase
      .from("documents")
      .update({
        status: "ready",
        error: warnings.length ? warnings.join(" ") : null,
        page_count: pageCount,
        word_count: words,
        chunk_count: chunks.length,
        summary,
        key_terms: keyTerms,
        topics,
        category,
        analyzed_by: analyzedBy,
        processed_at: new Date().toISOString(),
      })
      .eq("id", id);
    await invalidatePlan(supabase, user.id);
    return NextResponse.json({ ok: true, chunks: chunks.length, words, pages: pageCount, warnings, analyzedBy });
  } catch (e) {
    await supabase.from("documents").update({ status: "error", error: errorMessage(e).slice(0, 500) }).eq("id", id);
    throw e instanceof ApiError ? e : new ApiError(`Verwerken mislukt: ${errorMessage(e)}`, 500);
  }
});
