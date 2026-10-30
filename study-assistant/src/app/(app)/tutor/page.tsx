import { requireUser } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import type { ChatMessage, ChatSession, Course, TutorMode } from "@/lib/types";
import { TutorChat } from "./tutor-chat";

export const metadata = { title: "AI-docent" };

const MODES: TutorMode[] = ["explain", "exam", "practice", "quick"];

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ session?: string; course?: string; mode?: string; topic?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const [coursesR, sessionsR] = await Promise.all([
    supabase.from("courses").select("id, name, color").eq("archived", false).order("name"),
    supabase.from("chat_sessions").select("id, course_id, mode, title, updated_at").order("updated_at", { ascending: false }).limit(40),
  ]);
  let messages: ChatMessage[] = [];
  let active: ChatSession | null = null;
  if (sp.session) {
    active = ((sessionsR.data ?? []) as ChatSession[]).find((s) => s.id === sp.session) ?? null;
    if (!active) {
      const { data } = await supabase.from("chat_sessions").select("id, course_id, mode, title, updated_at").eq("id", sp.session).maybeSingle();
      active = data as ChatSession | null;
    }
    if (active) {
      const { data } = await supabase.from("chat_messages").select("*").eq("session_id", active.id).order("created_at").limit(200);
      messages = (data ?? []) as ChatMessage[];
    }
  }
  const mode = (MODES.includes(sp.mode as TutorMode) ? sp.mode : active?.mode ?? "explain") as TutorMode;
  return (
    <TutorChat
      key={active?.id ?? "new"}
      aiEnabled={config.ai.enabled}
      courses={(coursesR.data ?? []) as Pick<Course, "id" | "name" | "color">[]}
      sessions={(sessionsR.data ?? []) as ChatSession[]}
      session={active}
      initialMessages={messages}
      initialCourseId={active?.course_id ?? sp.course ?? null}
      initialMode={mode}
      initialInput={sp.topic ? (mode === "practice" ? `Ik wil oefenen met: ${sp.topic}` : `Leg uit: ${sp.topic}`) : ""}
    />
  );
}
