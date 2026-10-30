import { NextResponse } from "next/server";
import { apiUser, route } from "@/lib/api";
import { regeneratePlan } from "@/lib/plan-service";

export const runtime = "nodejs";

/** Herberekent de studieplanning (lokaal algoritme, geen AI-kosten). */
export const POST = route(async () => {
  const { supabase, user } = await apiUser();
  const out = await regeneratePlan(supabase, user.id);
  return NextResponse.json({ sessions: out.sessions.length, estimates: out.estimates, warnings: out.warnings });
});
