import Link from "next/link";
import { FileText, MessageSquareText, RotateCcw } from "lucide-react";
import type { Exam, ExamQuestion } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/exam";
import { Markdown } from "@/components/markdown";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, masteryTone, Progress, Stat } from "@/components/ui/misc";
import { cn, formatMinutes } from "@/lib/utils";
import { QuestionFeedback } from "./question-feedback";

export function ExamReportView({ exam, questions }: { exam: Exam; questions: ExamQuestion[] }) {
  const r = exam.report!;
  const tone = r.scorePct >= 80 ? "text-success" : r.scorePct >= 55 ? "text-warning" : "text-danger";
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/exams" className="text-xs text-muted-foreground hover:underline">
            ← Oefententamens
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Tentamenrapport</h1>
          <p className="text-sm text-muted-foreground">{exam.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/exams/new?course=${exam.course_id}`} className={buttonVariants({ variant: "outline" })}>
            <RotateCcw /> Nieuw tentamen
          </Link>
          {r.weakTopics[0] && (
            <Link href={`/tutor?course=${exam.course_id}&mode=explain&topic=${encodeURIComponent(r.weakTopics[0])}`} className={buttonVariants()}>
              <MessageSquareText /> Uitleg over {r.weakTopics[0]}
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Totaalscore" value={<span className={tone}>{r.scorePct}%</span>} sub={`${r.score} / ${r.maxScore} punten`} />
        <Stat label="Beantwoord" value={`${r.answered}/${r.total}`} />
        <Stat label="Tijd" value={formatMinutes(r.durationMinutes)} sub={exam.time_limit_minutes ? `limiet ${exam.time_limit_minutes} min` : "geen limiet"} />
        <Stat label="Onvoldoende beheerst" value={r.weakTopics.length} sub="onderwerpen < 60%" />
      </div>

      <Card className={cn("border-l-4 p-4", r.scorePct >= 80 ? "border-l-success" : r.scorePct >= 55 ? "border-l-warning" : "border-l-danger")}>
        <p className="text-sm font-medium">Oordeel</p>
        <p className="mt-1 text-sm text-muted-foreground">{r.verdict}</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score per onderwerp</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {r.perTopic.map((t) => (
              <div key={t.topic}>
                <div className="flex justify-between text-sm">
                  <span className="truncate">{t.topic}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(t.pct * 100)}% · {t.score}/{t.max}
                  </span>
                </div>
                <Progress className="mt-1" value={t.pct} tone={masteryTone(t.pct)} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Advies: wat opnieuw bestuderen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {r.advice.length ? (
              <ul className="list-disc space-y-1.5 pl-5">
                {r.advice.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Geen specifieke adviezen.</p>
            )}
            {r.studySources.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Relevante bronnen</p>
                <ul className="space-y-1">
                  {r.studySources.map((s) => (
                    <li key={`${s.document_name}${s.location}`} className="flex items-center gap-2 text-xs">
                      <FileText className="size-3.5 text-muted-foreground" />
                      <span>
                        {s.document_name}
                        {s.location ? `, ${s.location}` : ""}
                      </span>
                      <Badge>{s.topic}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {r.mistakes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Gemaakte fouten</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {r.mistakes.map((m) => (
                <li key={m.position} className="flex gap-3">
                  <span className="w-6 shrink-0 text-muted-foreground tabular-nums">{m.position}.</span>
                  <span>
                    <span className="font-medium">{m.topic}: </span>
                    <span className="text-muted-foreground">{m.issue}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold">Alle vragen</h2>
        <div className="space-y-3">
          {questions.map((q) => (
            <details key={q.id} className="group rounded-xl border border-border bg-card p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                <span className="w-6 tabular-nums text-muted-foreground">{q.position}.</span>
                <Badge tone="primary">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                <span className="min-w-0 flex-1 truncate">{q.prompt.replace(/\\([%$_&#])/g, "$1").replace(/[#*_$`\\]/g, "").slice(0, 120)}</span>
                <Badge tone={masteryTone(Number(q.points ?? 0) / Number(q.max_points))}>
                  {Number(q.points ?? 0)}/{Number(q.max_points)}
                </Badge>
              </summary>
              <div className="mt-3 border-t border-border pt-3">
                <Markdown>{q.prompt}</Markdown>
                {q.options && (
                  <ol className="mt-2 space-y-0.5 text-sm">
                    {q.options.map((o, i) => (
                      <li key={i} className={cn("[&_p]:inline", "ABCDEF"[i] === q.correct_answer && "font-medium text-success")}>
                        {"ABCDEF"[i]}. <Markdown className="inline">{o}</Markdown>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-3 text-xs font-medium text-muted-foreground">Jouw antwoord</p>
                <p className="whitespace-pre-wrap text-sm">{q.user_answer || "—"}</p>
                <QuestionFeedback points={Number(q.points ?? 0)} maxPoints={Number(q.max_points)} feedback={q.feedback} correctAnswer={q.correct_answer} explanation={q.explanation} sources={q.sources ?? []} isMc={q.type === "mc"} options={q.options} />
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
