import { NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/analyze/ai-client";
import { EXPAND_SYSTEM, buildExpandPrompt } from "@/lib/analyze/prompt";
import { jsonError, readJson } from "@/lib/api";
import { Repo } from "@/lib/repo";

export const maxDuration = 300;

/** Laat Claude een opgeslagen kans uitwerken tot een concreet plan. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const repo = new Repo();
  const op = repo.getOpportunity(id);
  if (!op) return jsonError("Kans niet gevonden", 404);
  const ai = createAnthropicClient();
  if (!ai) return jsonError("Vereist ANTHROPIC_API_KEY", 503);
  const body = (await readJson(req)) as { notes?: string } | null;
  const notes = typeof body?.notes === "string" ? body.notes : op.notes;
  try {
    const expansion = await ai.text({ system: EXPAND_SYSTEM, prompt: buildExpandPrompt(op.data, notes) });
    repo.updateOpportunity(id, { expansion, notes, saved: true });
    return NextResponse.json({ expansion });
  } catch (err) {
    console.error("[news-agent] uitwerken mislukt:", err);
    return jsonError(err instanceof Error ? err.message : "Uitwerken mislukt", 502);
  }
}
