import Link from "next/link";
import { Layers, Play } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import type { Course, Flashcard, Topic } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { CourseDot } from "@/components/course-dot";
import { cn } from "@/lib/utils";
import { CardManager } from "./card-manager";

export const metadata = { title: "Flashcards" };

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const [coursesR, countsR] = await Promise.all([
    supabase.from("courses").select("id, name, color").eq("archived", false).order("name"),
    supabase.rpc("flashcard_counts"),
  ]);
  const courses = (coursesR.data ?? []) as Pick<Course, "id" | "name" | "color">[];
  const counts = new Map(((countsR.data ?? []) as { course_id: string; total: number; due: number; new_cards: number }[]).map((r) => [r.course_id, r]));
  const selected = courses.find((c) => c.id === sp.course) ?? null;
  let cards: Flashcard[] = [];
  let topics: Pick<Topic, "id" | "name">[] = [];
  let docs: { id: string; name: string }[] = [];
  if (selected) {
    const [cardsR, topicsR, docsR] = await Promise.all([
      supabase.from("flashcards").select("*").eq("course_id", selected.id).order("created_at", { ascending: false }).limit(1000),
      supabase.from("topics").select("id, name").eq("course_id", selected.id).order("name"),
      supabase.from("documents").select("id, name").eq("course_id", selected.id).eq("status", "ready").order("name"),
    ]);
    cards = (cardsR.data ?? []) as Flashcard[];
    topics = topicsR.data ?? [];
    docs = docsR.data ?? [];
  }
  const totalDue = [...counts.values()].reduce((s, c) => s + Number(c.due), 0);
  return (
    <div>
      <PageHeader
        title="Flashcards"
        description="Spaced repetition (FSRS): moeilijke kaarten komen vaker terug, beheerste kaarten minder vaak."
        actions={
          <Link href="/flashcards/review" className={cn(buttonVariants(), totalDue === 0 && "pointer-events-none opacity-50")}>
            <Play /> Alles herhalen ({totalDue})
          </Link>
        }
      />
      {courses.length === 0 ? (
        <EmptyState icon={<Layers />} title="Nog geen vakken">Maak eerst een vak aan.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => {
            const n = counts.get(c.id);
            return (
              <Card key={c.id} className={cn("p-4", selected?.id === c.id && "ring-2 ring-ring")}>
                <Link href={`/flashcards?course=${c.id}`} className="flex items-center gap-2 font-medium hover:underline">
                  <CourseDot color={c.color} /> {c.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Number(n?.total ?? 0)} kaarten · {Number(n?.due ?? 0)} te herhalen · {Number(n?.new_cards ?? 0)} nieuw
                </p>
                <div className="mt-3 flex gap-2">
                  <Link href={`/flashcards/review?course=${c.id}`} className={cn(buttonVariants({ size: "sm" }), !Number(n?.due) && "pointer-events-none opacity-50")}>
                    Oefenen
                  </Link>
                  <Link href={`/flashcards?course=${c.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    Beheren
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {selected && <CardManager key={selected.id} aiEnabled={config.ai.enabled} course={selected} cards={cards} topics={topics} documents={docs} />}
    </div>
  );
}
