import "server-only";
import { config, embeddingsEnabled } from "@/lib/config";

// Optionele semantische zoekfunctie. Anthropic biedt zelf geen embeddings-API en
// verwijst naar Voyage AI; zonder configuratie valt de app terug op full-text zoeken.

const BATCH = 64;

async function voyage(input: string[], inputType: "document" | "query"): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.embeddings.voyageApiKey}` },
    body: JSON.stringify({ input, model: config.embeddings.voyageModel, input_type: inputType, output_dimension: 1024 }),
  });
  if (!res.ok) throw new Error(`Embeddings-fout (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedDocuments(texts: string[]): Promise<number[][] | null> {
  if (!embeddingsEnabled() || texts.length === 0) return null;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) out.push(...(await voyage(texts.slice(i, i + BATCH), "document")));
  return out;
}

export async function embedQuery(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;
  try {
    return (await voyage([text], "query"))[0];
  } catch {
    return null; // zoeken werkt dan nog via full-text
  }
}

export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
