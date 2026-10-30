import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { loadOverview } from "@/lib/overview";
import { daysBetween, formatDate, formatMinutes, parseDateKey, pct } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EmptyState, masteryTone, PageHeader, Progress } from "@/components/ui/misc";
import { CourseDot } from "@/components/course-dot";
import { NewCourse } from "./new-course";

export const metadata = { title: "Vakken" };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const ov = await loadOverview(supabase, user.id);
  const t = parseDateKey(ov.today);
  return (
    <div>
      <PageHeader title="Vakken" description="Elk vak is een eigen studiemap met documenten, onderwerpen en voortgang." actions={<NewCourse initiallyOpen={sp.new === "1" || ov.courses.length === 0} />} />
      {ov.courses.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="Nog geen vakken">
          Maak een vak aan, bijvoorbeeld Financial Accounting of Statistics.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ov.courses.map((c) => {
            const s = ov.stats.get(c.id)!;
            const days = c.exam_date ? daysBetween(t, parseDateKey(c.exam_date)) : null;
            return (
              <Link key={c.id} href={`/courses/${c.id}`}>
                <Card className="h-full p-5 transition-colors hover:bg-muted/40">
                  <div className="flex items-center gap-2">
                    <CourseDot color={c.color} className="size-3" />
                    <h2 className="truncate font-medium">{c.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.exam_date ? `Tentamen ${formatDate(c.exam_date)}${days !== null && days >= 0 ? ` · over ${days} dagen` : " · geweest"}` : "Geen tentamendatum"}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Beheersing</span>
                    <span className="tabular-nums">{pct(s.coverageMastery)}</span>
                  </div>
                  <Progress className="mt-1" value={s.coverageMastery} tone={s.topicCount ? masteryTone(s.coverageMastery) : "neutral"} />
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Documenten</dt>
                      <dd className="text-sm font-medium tabular-nums">{s.documentCount}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Flashcards</dt>
                      <dd className="text-sm font-medium tabular-nums">{s.cardsTotal}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Gestudeerd</dt>
                      <dd className="text-sm font-medium tabular-nums">{formatMinutes(s.totalMinutes)}</dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
