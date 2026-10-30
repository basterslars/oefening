"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Flag } from "lucide-react";
import type { Exam, ExamQuestion, SourceRef } from "@/lib/types";
import { LETTERS, QUESTION_TYPE_LABELS } from "@/lib/exam";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Alert, Badge, Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { QuestionFeedback } from "./question-feedback";

interface Graded {
  points: number;
  max_points: number;
  feedback: string | null;
  correct_answer: string;
  explanation: string | null;
  sources: SourceRef[];
}

export function ExamRunner({ exam, questions }: { exam: Exam; questions: ExamQuestion[] }) {
  const router = useRouter();
  const firstOpen = questions.findIndex((q) => !q.answered_at);
  const [idx, setIdx] = useState(firstOpen >= 0 ? firstOpen : 0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(questions.map((q) => [q.id, q.user_answer ?? ""])));
  const [graded, setGraded] = useState<Record<string, Graded>>(() =>
    Object.fromEntries(
      questions.filter((q) => q.answered_at).map((q) => [q.id, { points: Number(q.points ?? 0), max_points: Number(q.max_points), feedback: q.feedback, correct_answer: q.correct_answer, explanation: q.explanation, sources: q.sources }]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deadline = exam.time_limit_minutes ? new Date(exam.started_at).getTime() + exam.time_limit_minutes * 60_000 : null;
  const [now, setNow] = useState(() => Date.now());
  const finished = useRef(false);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    setFinishing(true);
    const res = await fetch(`/api/exams/${exam.id}/finish`, { method: "POST" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Afronden mislukt.");
      finished.current = false;
      setFinishing(false);
      return;
    }
    router.refresh();
  }, [exam.id, router]);

  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline) finish();
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, finish]);

  const q = questions[idx];
  const g = graded[q.id];
  const answeredCount = Object.keys(graded).length;
  const remaining = deadline ? Math.max(0, deadline - now) : null;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/exams/${exam.id}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: q.id, answer: answers[q.id] ?? "" }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Nakijken mislukt.");
    setGraded((x) => ({ ...x, [q.id]: json }));
  }

  if (finishing)
    return (
      <div className="flex flex-col items-center py-20 text-sm text-muted-foreground">
        <Spinner className="mb-3 size-6 text-primary" /> Rapport wordt opgesteld…
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{exam.title}</h1>
          <p className="text-xs text-muted-foreground">
            {answeredCount} van {questions.length} beantwoord
          </p>
        </div>
        <div className="flex items-center gap-2">
          {remaining !== null && (
            <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium tabular-nums", remaining < 5 * 60_000 ? "bg-danger/10 text-danger" : "bg-muted")}>
              <Clock className="size-4" />
              {String(Math.floor(remaining / 60_000)).padStart(2, "0")}:{String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0")}
            </span>
          )}
          <Button
            variant={answeredCount === questions.length ? "default" : "outline"}
            onClick={() => {
              if (answeredCount < questions.length && !confirm(`${questions.length - answeredCount} vraag/vragen niet beantwoord (tellen als 0 punten). Toch afronden?`)) return;
              finish();
            }}
          >
            <Flag /> Afronden
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {questions.map((x, i) => {
          const gx = graded[x.id];
          const r = gx ? gx.points / gx.max_points : null;
          return (
            <button
              key={x.id}
              onClick={() => setIdx(i)}
              aria-label={`Vraag ${i + 1}`}
              className={cn(
                "size-8 rounded-md border text-xs font-medium tabular-nums",
                i === idx && "ring-2 ring-ring",
                r === null ? "border-border bg-card" : r >= 0.75 ? "border-success/50 bg-success/15" : r >= 0.4 ? "border-warning/50 bg-warning/20" : "border-danger/40 bg-danger/12",
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Badge tone="primary">{QUESTION_TYPE_LABELS[q.type]}</Badge>
          {q.topic_name && <Badge>{q.topic_name}</Badge>}
          <Badge>{["", "Basis", "Gemiddeld", "Moeilijk"][q.difficulty]}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">{Number(q.max_points)} pt</span>
        </div>
        <Markdown className="text-[15px]">{q.prompt}</Markdown>

        <div className="mt-4">
          {q.type === "mc" && q.options ? (
            <div className="space-y-2">
              {q.options.map((o, i) => {
                const letter = LETTERS[i];
                const chosen = (answers[q.id] ?? "") === letter;
                const isCorrect = g && g.correct_answer === letter;
                return (
                  <label
                    key={letter}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                      g ? (isCorrect ? "border-success/50 bg-success/8" : chosen ? "border-danger/40 bg-danger/5" : "border-border") : chosen ? "border-primary bg-accent/50" : "border-border hover:bg-muted/50",
                      g && "cursor-default",
                    )}
                  >
                    <input type="radio" name={q.id} className="mt-1" disabled={!!g} checked={chosen} onChange={() => setAnswers((a) => ({ ...a, [q.id]: letter }))} />
                    <span className="font-medium">{letter}.</span>
                    <span className="flex-1">
                      <Markdown>{o}</Markdown>
                    </span>
                    {g && isCorrect && <CheckCircle2 className="size-4 text-success" />}
                  </label>
                );
              })}
            </div>
          ) : (
            <Textarea
              rows={q.type === "case" ? 10 : 6}
              value={answers[q.id] ?? ""}
              disabled={!!g}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              placeholder={q.type === "calculation" ? "Geef je berekening en het eindantwoord…" : "Typ je antwoord…"}
            />
          )}
        </div>

        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
        {g ? (
          <QuestionFeedback points={g.points} maxPoints={g.max_points} feedback={g.feedback} correctAnswer={g.correct_answer} explanation={g.explanation} sources={g.sources} isMc={q.type === "mc"} options={q.options} />
        ) : (
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={busy || !(answers[q.id] ?? "").trim()}>
              {busy && <Spinner />} Antwoord nakijken
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <Button variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          <ChevronLeft /> Vorige
        </Button>
        <Button variant="ghost" disabled={idx === questions.length - 1} onClick={() => setIdx(idx + 1)}>
          Volgende <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
