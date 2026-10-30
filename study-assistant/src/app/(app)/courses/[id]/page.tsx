import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, Layers, MessageSquareText } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { todayKey } from "@/lib/config";
import type { Course, DocumentRow, Topic } from "@/lib/types";
import { cn, daysBetween, formatDate, formatMinutes, parseDateKey, pct } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Stat } from "@/components/ui/misc";
import { CourseDot } from "@/components/course-dot";
import { KnowledgeSearch } from "@/components/knowledge-search";
import { DocumentManager } from "./documents";
import { TopicManager } from "./topics";
import { CourseSettings } from "./settings";

const TABS = [
  { id: "documents", label: "Documenten" },
  { id: "topics", label: "Onderwerpen" },
  { id: "search", label: "Kennisbank" },
  { id: "settings", label: "Instellingen" },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("courses").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Vak" };
}

export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const tab = (await searchParams).tab ?? "documents";
  const { supabase, user } = await requireUser();
  const [courseR, docsR, topicsR, totalsR, cardsR] = await Promise.all([
    supabase.from("courses").select("*").eq("id", id).maybeSingle(),
    supabase.from("documents").select("*").eq("course_id", id).order("created_at", { ascending: false }),
    supabase.from("topics").select("*").eq("course_id", id).order("name"),
    supabase.rpc("study_totals"),
    supabase.rpc("flashcard_counts"),
  ]);
  if (!courseR.data) notFound();
  const course = courseR.data as Course;
  const docs = (docsR.data ?? []) as DocumentRow[];
  const topics = (topicsR.data ?? []) as Topic[];
  const minutes = Number(((totalsR.data ?? []) as { course_id: string; minutes: number }[]).find((r) => r.course_id === id)?.minutes ?? 0);
  const cards = ((cardsR.data ?? []) as { course_id: string; total: number; due: number }[]).find((r) => r.course_id === id);
  const mastery = topics.length ? topics.reduce((s, t) => s + (t.attempts ? t.mastery : 0), 0) / topics.length : 0;
  const days = course.exam_date ? daysBetween(parseDateKey(todayKey()), parseDateKey(course.exam_date)) : null;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/courses" className="text-xs text-muted-foreground hover:underline">
            ← Vakken
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <CourseDot color={course.color} className="size-3" />
            <span className="truncate">{course.name}</span>
          </h1>
          {course.description && <p className="mt-1 text-sm text-muted-foreground">{course.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/tutor?course=${id}`} className={buttonVariants()}>
            <MessageSquareText /> Vraag de docent
          </Link>
          <Link href={`/exams/new?course=${id}`} className={buttonVariants({ variant: "outline" })}>
            <ClipboardCheck /> Oefententamen
          </Link>
          <Link href={`/flashcards?course=${id}`} className={buttonVariants({ variant: "outline" })}>
            <Layers /> Flashcards
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tentamen" value={course.exam_date ? formatDate(course.exam_date) : "—"} sub={days === null ? "geen datum" : days >= 0 ? `over ${days} dagen` : "geweest"} />
        <Stat label="Beheersing" value={pct(mastery)} sub={`${topics.filter((t) => t.attempts).length}/${topics.length} onderwerpen getoetst`} />
        <Stat label="Gestudeerd" value={formatMinutes(minutes)} sub={`${course.hours_per_week} u/week gepland`} />
        <Stat label="Flashcards" value={Number(cards?.total ?? 0)} sub={`${Number(cards?.due ?? 0)} te herhalen`} />
      </div>

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/courses/${id}?tab=${t.id}`}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
            {t.id === "documents" && docs.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{docs.length}</span>}
            {t.id === "topics" && topics.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{topics.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "documents" && <DocumentManager courseId={id} userId={user.id} documents={docs} />}
      {tab === "topics" && <TopicManager courseId={id} topics={topics} />}
      {tab === "search" && <KnowledgeSearch courseId={id} />}
      {tab === "settings" && <CourseSettings course={course} />}
    </div>
  );
}
