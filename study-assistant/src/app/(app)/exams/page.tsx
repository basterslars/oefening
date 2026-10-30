import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import type { Exam } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { CourseDot } from "@/components/course-dot";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Oefententamens" };

export default async function ExamsPage() {
  const { supabase } = await requireUser();
  const [examsR, coursesR] = await Promise.all([
    supabase.from("exams").select("id, course_id, title, status, score, max_score, created_at, finished_at, settings").order("created_at", { ascending: false }).limit(100),
    supabase.from("courses").select("id, name, color"),
  ]);
  const exams = (examsR.data ?? []) as Exam[];
  const courses = new Map((coursesR.data ?? []).map((c) => [c.id, c]));
  return (
    <div>
      <PageHeader
        title="Oefententamens"
        description="Gegenereerd uit je eigen materiaal, direct nagekeken, met rapport en studieadvies."
        actions={
          <Link href="/exams/new" className={buttonVariants()}>
            <Plus /> Nieuw oefententamen
          </Link>
        }
      />
      {exams.length === 0 ? (
        <EmptyState icon={<ClipboardCheck />} title="Nog geen oefententamens" action={<Link href="/exams/new" className={buttonVariants({ variant: "outline" })}>Start je eerste oefententamen</Link>}>
          Kies een vak, vraagtypen en moeilijkheid. Je krijgt na elke vraag feedback en aan het eind een rapport.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {exams.map((e) => {
            const c = courses.get(e.course_id);
            const p = e.status === "finished" && e.max_score ? (Number(e.score) / Number(e.max_score)) * 100 : null;
            return (
              <li key={e.id}>
                <Link href={`/exams/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <CourseDot color={c?.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(e.created_at)} · {e.settings?.questionCount ?? "?"} vragen
                    </p>
                  </div>
                  {p === null ? (
                    <Badge tone="primary">Bezig</Badge>
                  ) : (
                    <Badge tone={p >= 80 ? "success" : p >= 55 ? "warning" : "danger"}>{Math.round(p)}%</Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
