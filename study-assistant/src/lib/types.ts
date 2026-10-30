// Gedeelde domeintypen. Database-rijen volgen supabase/migrations/*.sql.

export type FileType = "pdf" | "docx" | "pptx" | "xlsx" | "txt" | "md" | "csv";
export type DocumentStatus = "uploaded" | "processing" | "ready" | "error";
export type TutorMode = "explain" | "exam" | "practice" | "quick";
export type QuestionType = "mc" | "open" | "case" | "calculation" | "concept" | "application";
export type PlanKind = "learn" | "review" | "practice" | "final_review";
export type Activity = "tutor" | "exam" | "flashcards" | "reading" | "planner" | "other";

export interface Profile {
  id: string;
  display_name: string | null;
  study_level: "hbo" | "bachelor" | "premaster" | "master";
  study_days: number[];
  daily_goal_minutes: number;
  plan_generated_on: string | null;
  plan_warnings: PlanWarning[];
}

export interface Course {
  id: string;
  name: string;
  description: string | null;
  color: string;
  exam_date: string | null;
  material_pages: number | null;
  estimated_hours: number | null;
  difficulty: number;
  knowledge_level: number;
  hours_per_week: number;
  archived: boolean;
  created_at: string;
}

export interface KeyTerm {
  term: string;
  definition?: string;
}

export interface DocumentRow {
  id: string;
  course_id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  file_type: FileType;
  category: string;
  status: DocumentStatus;
  error: string | null;
  page_count: number | null;
  word_count: number | null;
  chunk_count: number | null;
  summary: string | null;
  key_terms: KeyTerm[];
  topics: string[];
  analyzed_by: "local" | "ai" | null;
  created_at: string;
  processed_at: string | null;
}

export interface Topic {
  id: string;
  course_id: string;
  name: string;
  mastery: number;
  attempts: number;
  correct: number;
  last_studied_at: string | null;
  source: "ai" | "manual";
}

export interface SourceRef {
  id: string; // chunk-id
  document_id: string;
  document_name: string;
  location: string | null;
  label?: string; // bv. "B1"
  excerpt?: string;
}

export interface ChatSession {
  id: string;
  course_id: string | null;
  mode: TutorMode;
  title: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceRef[];
  created_at: string;
}

export interface ExamSettings {
  questionCount: number;
  difficulty: 1 | 2 | 3;
  types: QuestionType[];
  topicIds: string[];
  documentIds: string[];
  timeLimitMinutes: number | null;
  focusWeakTopics: boolean;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  position: number;
  type: QuestionType;
  topic_id: string | null;
  topic_name: string | null;
  difficulty: number;
  prompt: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  rubric: string | null;
  sources: SourceRef[];
  max_points: number;
  user_answer: string | null;
  points: number | null;
  feedback: string | null;
  misconception: string | null;
  answered_at: string | null;
}

export interface ExamReport {
  scorePct: number;
  score: number;
  maxScore: number;
  answered: number;
  total: number;
  durationMinutes: number;
  perTopic: { topic: string; topicId: string | null; score: number; max: number; pct: number }[];
  mistakes: { position: number; topic: string; issue: string }[];
  weakTopics: string[];
  advice: string[];
  studySources: { document_name: string; location: string | null; topic: string }[];
  verdict: string;
}

export interface Exam {
  id: string;
  course_id: string;
  title: string;
  settings: ExamSettings;
  status: "in_progress" | "finished";
  time_limit_minutes: number | null;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
  report: ExamReport | null;
  created_at: string;
}

export interface Flashcard {
  id: string;
  course_id: string;
  topic_id: string | null;
  document_id: string | null;
  front: string;
  back: string;
  card_type: "begrip" | "definitie" | "theorie" | "formule" | "overig";
  difficulty: number;
  source_location: string | null;
  origin: "ai" | "manual";
  fsrs: Record<string, unknown> | null;
  due: string;
  state: number;
  reps: number;
  lapses: number;
  last_review: string | null;
}

export interface StudySession {
  id: string;
  course_id: string | null;
  activity: Activity;
  minutes: number;
  started_at: string;
  ended_at: string;
}

export interface PlanSession {
  id: string;
  course_id: string;
  date: string;
  minutes: number;
  kind: PlanKind;
  title: string;
  topic_id: string | null;
  status: "planned" | "done" | "skipped";
  completed_at: string | null;
}

export interface PlanWarning {
  courseId: string;
  courseName: string;
  type: "infeasible" | "no_exam_date" | "exam_passed" | "behind";
  message: string;
}
