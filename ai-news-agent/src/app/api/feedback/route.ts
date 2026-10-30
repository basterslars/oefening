import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { Repo } from "@/lib/repo";
import { FEEDBACK_ACTIONS } from "@/lib/types";

const Body = z.object({ itemId: z.string().min(1), action: z.enum(FEEDBACK_ACTIONS), on: z.boolean() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError("Ongeldige feedback");
  const repo = new Repo();
  if (!repo.getItem(parsed.data.itemId)) return jsonError("Item niet gevonden", 404);
  repo.setFeedback(parsed.data.itemId, parsed.data.action, parsed.data.on);
  return NextResponse.json({ ok: true, feedback: repo.getItem(parsed.data.itemId)!.feedback });
}
