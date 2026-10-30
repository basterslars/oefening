"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { QuestionType } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/exam";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";
import { cn, pct } from "@/lib/utils";

interface TopicOpt { id: string; course_id: string; name: string; mastery: number; attempts: number }
interface DocOpt { id: string; course_id: string; name: string }

const TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-lg border px-2.5 py-1 text-xs", active ? "border-primary bg-accent font-medium text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted")}>
      {children}
    </button>
  );
}

export function ExamSetup({ aiEnabled, courses, topics, documents, initialCourseId }: { aiEnabled: boolean; courses: { id: string; name: string }[]; topics: TopicOpt[]; documents: DocOpt[]; initialCourseId: string | null }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(initialCourseId && courses.some((c) => c.id === initialCourseId) ? initialCourseId : (courses[0]?.id ?? ""));
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);
  const [types, setTypes] = useState<QuestionType[]>(["mc", "open", "application"]);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [timeLimit, setTimeLimit] = useState<string>("");
  const [focusWeak, setFocusWeak] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const courseTopics = topics.filter((t) => t.course_id === courseId);
  const courseDocs = documents.filter((d) => d.course_id === courseId);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        courseId,
        questionCount: count,
        difficulty,
        types,
        topicIds,
        documentIds,
        timeLimitMinutes: timeLimit ? Number(timeLimit) : null,
        focusWeakTopics: focusWeak,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(json.error ?? "Genereren mislukt.");
    }
    router.push(`/exams/${json.examId}`);
  }

  if (courses.length === 0) return <Alert tone="warning">Maak eerst een vak aan en upload materiaal.</Alert>;
  return (
    <Card className="space-y-5 p-5">
      {!aiEnabled && <Alert tone="warning">AI is niet geconfigureerd (ANTHROPIC_API_KEY). Oefententamens genereren is dan niet mogelijk.</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Vak" className="sm:col-span-3">
          <Select
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setTopicIds([]);
              setDocumentIds([]);
            }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Aantal vragen">
          <Input type="number" min={1} max={40} value={count} onChange={(e) => setCount(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} />
        </Field>
        <Field label="Moeilijkheidsgraad">
          <Select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value) as 1 | 2 | 3)}>
            <option value={1}>Basis</option>
            <option value={2}>Gemiddeld</option>
            <option value={3}>Moeilijk</option>
          </Select>
        </Field>
        <Field label="Tijdslimiet (minuten)" hint="Leeg = geen limiet">
          <Input type="number" min={1} max={600} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder="geen" />
        </Field>
      </div>
      <Field label="Vraagtypen">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <Chip key={t} active={types.includes(t)} onClick={() => setTypes(types.includes(t) && types.length === 1 ? types : toggle(types, t))}>
              {QUESTION_TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Onderwerpen" hint={courseTopics.length ? "Niets gekozen = het hele vak" : "Nog geen onderwerpen bekend; vragen worden over het hele materiaal verdeeld"}>
        <div className="flex flex-wrap gap-1.5">
          {courseTopics.map((t) => (
            <Chip key={t.id} active={topicIds.includes(t.id)} onClick={() => setTopicIds(toggle(topicIds, t.id))}>
              {t.name}
              {t.attempts > 0 && <span className="ml-1 opacity-60">{pct(t.mastery)}</span>}
            </Chip>
          ))}
        </div>
      </Field>
      {courseDocs.length > 1 && (
        <Field label="Documenten" hint="Niets gekozen = alle documenten">
          <div className="flex flex-wrap gap-1.5">
            {courseDocs.map((d) => (
              <Chip key={d.id} active={documentIds.includes(d.id)} onClick={() => setDocumentIds(toggle(documentIds, d.id))}>
                {d.name}
              </Chip>
            ))}
          </div>
        </Field>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={focusWeak} onChange={(e) => setFocusWeak(e.target.checked)} />
        <span>
          Adaptief: extra vragen over mijn zwakke onderwerpen
          <span className="block text-xs text-muted-foreground">Gebaseerd op eerdere resultaten (alleen als je geen onderwerpen kiest).</span>
        </span>
      </label>
      {courseDocs.length === 0 && <Alert tone="warning">Dit vak heeft nog geen verwerkte documenten.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center justify-end gap-3">
        {busy && <p className="text-xs text-muted-foreground">Vragen worden gemaakt uit je materiaal; dit kan een minuut duren…</p>}
        <Button size="lg" onClick={start} disabled={busy || !aiEnabled || !courseId || courseDocs.length === 0}>
          {busy ? <Spinner /> : <Sparkles />} Genereer en start
        </Button>
      </div>
    </Card>
  );
}
