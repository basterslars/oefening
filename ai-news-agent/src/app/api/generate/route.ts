import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { defaultDeps, runPipeline } from "@/lib/pipeline";

// Handmatig een nieuwsbrief genereren. De run kan minuten duren, dus we starten
// hem op de achtergrond en de UI volgt de voortgang via /api/runs.
export async function POST(req: Request) {
  const body = (await readJson(req)) as { force?: boolean } | null;
  const deps = await defaultDeps();
  if (deps.repo.listRuns(1)[0]?.status === "running") {
    return NextResponse.json({ error: "Er loopt al een generatie." }, { status: 409 });
  }
  void runPipeline({ trigger: "manual", force: body?.force === true }, deps).catch((err) => console.error("[news-agent] generatie mislukt:", err));
  return NextResponse.json({ started: true }, { status: 202 });
}
