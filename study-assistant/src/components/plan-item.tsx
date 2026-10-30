"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, SkipForward, Undo2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, formatMinutes } from "@/lib/utils";
import type { PlanSession } from "@/lib/types";
import { CourseDot } from "./course-dot";

const KIND_LABEL: Record<PlanSession["kind"], string> = {
  learn: "Leren",
  review: "Herhalen",
  practice: "Oefenen",
  final_review: "Eindherhaling",
};

/** Eén geplande sessie met afvinken (logt de studietijd) of overslaan. */
export function PlanItem({ session, courseName, courseColor, past = false }: { session: PlanSession; courseName: string; courseColor: string; past?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function setStatus(status: PlanSession["status"]) {
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const now = new Date();
    const { error } = await supabase
      .from("plan_sessions")
      .update({ status, completed_at: status === "done" ? now.toISOString() : null })
      .eq("id", session.id);
    if (!error && status === "done") {
      await supabase.from("study_sessions").insert({
        course_id: session.course_id,
        activity: "planner",
        minutes: session.minutes,
        source_id: session.id,
        started_at: new Date(now.getTime() - session.minutes * 60_000).toISOString(),
        ended_at: now.toISOString(),
      });
    }
    if (!error && session.status === "done" && status !== "done") {
      await supabase.from("study_sessions").delete().eq("source_id", session.id).eq("activity", "planner");
    }
    setBusy(false);
    if (error) setError(error.message);
    else router.refresh();
  }
  const done = session.status === "done";
  const skipped = session.status === "skipped";
  return (
    <div className={cn("flex items-start gap-3 rounded-lg px-2 py-2", busy && "opacity-60")}>
      <button
        aria-label={done ? "Markeer als niet gedaan" : "Markeer als gedaan"}
        disabled={busy}
        onClick={() => setStatus(done ? "planned" : "done")}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          done ? "border-success bg-success text-white" : "border-border hover:border-primary",
        )}
      >
        {done && <Check className="size-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", (done || skipped) && "text-muted-foreground line-through")}>{session.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CourseDot color={courseColor} /> {courseName}
          </span>
          <span>· {KIND_LABEL[session.kind]}</span>
          <span>· {formatMinutes(session.minutes)}</span>
          {past && session.status === "planned" && <span className="text-danger">· gemist</span>}
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      {!done && (
        <button
          aria-label={skipped ? "Terugzetten" : "Overslaan"}
          title={skipped ? "Terugzetten" : "Overslaan"}
          disabled={busy}
          onClick={() => setStatus(skipped ? "planned" : "skipped")}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          {skipped ? <Undo2 className="size-4" /> : <SkipForward className="size-4" />}
        </button>
      )}
    </div>
  );
}
