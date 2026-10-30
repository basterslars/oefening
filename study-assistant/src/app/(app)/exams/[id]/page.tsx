import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import type { Exam, ExamQuestion } from "@/lib/types";
import { ExamRunner } from "./exam-runner";
import { ExamReportView } from "./exam-report";

export const metadata = { title: "Oefententamen" };

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [examR, qR] = await Promise.all([
    supabase.from("exams").select("*").eq("id", id).maybeSingle(),
    supabase.from("exam_questions").select("*").eq("exam_id", id).order("position"),
  ]);
  if (!examR.data) notFound();
  const exam = examR.data as Exam;
  const questions = (qR.data ?? []) as ExamQuestion[];
  if (exam.status === "finished" && exam.report) return <ExamReportView exam={exam} questions={questions} />;
  // Antwoorden van nog niet beantwoorde vragen niet naar de browser sturen
  const safe = questions.map((q) => (q.answered_at ? q : { ...q, correct_answer: "", explanation: null, rubric: null }));
  return <ExamRunner exam={exam} questions={safe} />;
}
