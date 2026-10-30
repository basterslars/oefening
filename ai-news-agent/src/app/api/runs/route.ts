import { NextResponse } from "next/server";
import { Repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ runs: new Repo().listRuns(5) });
}
