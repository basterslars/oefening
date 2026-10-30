import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import type { SourceRef } from "@/lib/types";
import { buildTsQuery } from "@/lib/search-query";
import { embedQuery, toPgVector } from "@/lib/embeddings";

export interface RetrievedChunk {
  id: string;
  document_id: string;
  document_name: string;
  course_id: string;
  location: string | null;
  heading: string | null;
  content: string;
  score: number;
}

/** Hybride zoeken in eigen studiemateriaal (full-text + optioneel vector, RLS-beveiligd). */
export async function searchChunks(
  supabase: Supabase,
  query: string,
  opts: { courseId?: string | null; limit?: number; documentIds?: string[] | null } = {},
): Promise<RetrievedChunk[]> {
  const tsq = buildTsQuery(query);
  const embedding = await embedQuery(query);
  if (!tsq && !embedding) return [];
  const { data, error } = await supabase.rpc("search_chunks", {
    p_query: tsq,
    p_course_id: opts.courseId ?? null,
    p_embedding: embedding ? toPgVector(embedding) : null,
    p_limit: opts.limit ?? 8,
    p_document_ids: opts.documentIds?.length ? opts.documentIds : null,
  });
  if (error) throw new Error(`Zoeken mislukt: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}

/** Willekeurige, over documenten gespreide steekproef (voor vragen zonder zoekterm). */
export async function sampleChunks(
  supabase: Supabase,
  courseId: string,
  count: number,
  documentIds?: string[] | null,
): Promise<RetrievedChunk[]> {
  let q = supabase
    .from("document_chunks")
    .select("id, document_id, course_id, location, heading, content, chunk_index, documents(name)")
    .eq("course_id", courseId)
    .order("document_id")
    .order("chunk_index")
    .limit(2000);
  if (documentIds?.length) q = q.in("document_id", documentIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as (RetrievedChunk & { documents: { name: string } | null })[];
  if (rows.length <= count) return rows.map((r) => ({ ...r, document_name: r.documents?.name ?? "", score: 0 }));
  // Gelijkmatig verdeeld over het materiaal, met een willekeurige start.
  const step = rows.length / count;
  const offset = Math.random() * step;
  return Array.from({ length: count }, (_, i) => rows[Math.floor(offset + i * step)]).map((r) => ({
    ...r,
    document_name: r.documents?.name ?? "",
    score: 0,
  }));
}

/** Bronnen als genummerde blokken voor in een prompt + referenties voor de UI. */
export function formatSources(chunks: RetrievedChunk[], maxChars = 2200): { text: string; refs: SourceRef[] } {
  const refs: SourceRef[] = [];
  const blocks = chunks.map((c, i) => {
    const label = `B${i + 1}`;
    refs.push({ id: c.id, document_id: c.document_id, document_name: c.document_name, location: c.location, label, excerpt: c.content.slice(0, 280) });
    const where = [c.document_name, c.location].filter(Boolean).join(", ");
    return `<bron id="${label}" document="${escapeAttr(where)}">\n${c.content.slice(0, maxChars)}\n</bron>`;
  });
  return { text: blocks.join("\n\n"), refs };
}

function escapeAttr(s: string) {
  return s.replace(/"/g, "'").replace(/[<>]/g, "");
}
