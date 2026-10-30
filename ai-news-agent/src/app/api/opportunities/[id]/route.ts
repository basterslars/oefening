import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { Repo } from "@/lib/repo";

const Body = z.object({ saved: z.boolean().optional(), notes: z.string().max(10_000).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError("Ongeldige invoer");
  const repo = new Repo();
  if (!repo.getOpportunity(id)) return jsonError("Kans niet gevonden", 404);
  repo.updateOpportunity(id, parsed.data);
  return NextResponse.json({ opportunity: repo.getOpportunity(id) });
}
