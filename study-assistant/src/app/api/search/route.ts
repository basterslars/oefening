import { NextResponse } from "next/server";
import { apiUser, ApiError, route } from "@/lib/api";
import { searchChunks } from "@/lib/search";

export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  const { supabase } = await apiUser();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 300);
  const course = url.searchParams.get("course");
  if (q.length < 2) throw new ApiError("Zoekterm te kort.", 400);
  const results = await searchChunks(supabase, q, { courseId: course || null, limit: 20 });
  return NextResponse.json({ results });
});
