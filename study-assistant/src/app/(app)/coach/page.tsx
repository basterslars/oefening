import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import { ensurePlanFresh } from "@/lib/plan-service";
import { loadOverview } from "@/lib/overview";
import { buildInsights, coursePriorities, dailyGoals, type InsightLevel } from "@/lib/coach";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { cn, formatDate } from "@/lib/utils";
import { CoachReviewButton } from "./coach-review";

export const metadata = { title: "Studiecoach" };

const ICON: Record<InsightLevel, React.ReactNode> = {
  urgent: <AlertOctagon className="size-4 text-danger" />,
  warning: <AlertTriangle className="size-4 text-warning" />,
  info: <Info className="size-4 text-muted-foreground" />,
  positive: <CheckCircle2 className="size-4 text-success" />,
};
const LEVEL_LABEL: Record<InsightLevel, string> = { urgent: "Urgent", warning: "Let op", info: "Info", positive: "Goed" };

export default async function CoachPage() {
  const { supabase, user } = await requireUser();
  await ensurePlanFresh(supabase, user.id);
  const ov = await loadOverview(supabase, user.id);
  const insights = buildInsights(ov.coach);
  const priorities = coursePriorities(ov.coach);
  const goals = dailyGoals(ov.coach);
  const { data: reviews } = await supabase.from("coach_reviews").select("id, content, created_at").order("created_at", { ascending: false }).limit(3);
  if (ov.courses.length === 0) return <EmptyState title="Nog geen vakken">De coach heeft vakken, tentamendata en resultaten nodig om je te adviseren.</EmptyState>;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Studiecoach"
        description="Eerlijke signalen op basis van je cijfers. De regels hieronder kosten niets; de AI-evaluatie gebruikt tokens."
        actions={<CoachReviewButton disabled={!config.ai.enabled} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Signalen</CardTitle>
            </CardHeader>
            <CardContent>
              {insights.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen bijzonderheden. Dat betekent niet automatisch dat je op schema ligt: zonder oefententamens is je beheersing onbekend.</p>
              ) : (
                <ul className="space-y-3">
                  {insights.map((i) => (
                    <li key={i.title} className="flex gap-3">
                      <span className="mt-0.5" title={LEVEL_LABEL[i.level]}>
                        {ICON[i.level]}
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium">
                          <span className="sr-only">{LEVEL_LABEL[i.level]}: </span>
                          {i.title}
                        </p>
                        <p className="text-muted-foreground">{i.detail}</p>
                      </div>
                      {i.href && (
                        <Link href={i.href} className="shrink-0 text-xs font-medium text-primary hover:underline">
                          {i.action ?? "Bekijk"}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Kritische evaluatie (AI)</CardTitle>
                <CardDescription>Op basis van je objectieve studiegegevens</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {!reviews?.length ? (
                <p className="text-sm text-muted-foreground">Nog geen evaluatie. Klik op “Evalueer mijn voortgang”.</p>
              ) : (
                <div className="space-y-6">
                  {reviews.map((r, i) => (
                    <div key={r.id} className={cn(i > 0 && "border-t border-border pt-4 opacity-70")}>
                      <p className="mb-2 text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                      <Markdown>{r.content}</Markdown>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Prioriteit</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {priorities.map((p, i) => (
                  <li key={p.courseId} className="flex gap-3 text-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{i + 1}</span>
                    <div className="min-w-0">
                      <Link href={`/courses/${p.courseId}`} className="font-medium hover:underline">
                        {p.courseName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{p.reason}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Doelen voor vandaag</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {goals.map((g) => (
                  <li key={g.label}>
                    <Link href={g.href} className={cn("hover:underline", g.done && "text-muted-foreground line-through")}>
                      {g.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
