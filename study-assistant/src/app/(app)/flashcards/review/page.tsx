import { requireUser } from "@/lib/supabase/server";
import type { Flashcard } from "@/lib/types";
import { ReviewSession } from "./review-session";

export const metadata = { title: "Flashcards herhalen" };

const NEW_PER_SESSION = 20;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const now = new Date().toISOString();
  let reviewQ = supabase.from("flashcards").select("*, courses(name)").lte("due", now).gt("state", 0).order("due").limit(200);
  let newQ = supabase.from("flashcards").select("*, courses(name)").eq("state", 0).lte("due", now).order("created_at").limit(NEW_PER_SESSION);
  if (sp.course) {
    reviewQ = reviewQ.eq("course_id", sp.course);
    newQ = newQ.eq("course_id", sp.course);
  }
  const [reviewR, newR] = await Promise.all([reviewQ, newQ]);
  // Eerst openstaande herhalingen (vergeetcurve), dan een beperkt aantal nieuwe kaarten
  const cards = [...(reviewR.data ?? []), ...(newR.data ?? [])] as (Flashcard & { courses: { name: string } | null })[];
  return <ReviewSession cards={cards} courseId={sp.course ?? null} />;
}
