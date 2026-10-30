"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const DAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

export function PlannerControls({ studyDays, dailyGoal }: { studyDays: number[]; dailyGoal: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(studyDays);
  const [goal, setGoal] = useState(dailyGoal);
  const [error, setError] = useState<string | null>(null);

  async function replan() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/planner", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Herplannen mislukt.");
    router.refresh();
  }

  async function save() {
    if (days.length === 0) return setError("Kies minstens één studiedag.");
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ study_days: [...days].sort(), daily_goal_minutes: goal }).eq("id", data.user!.id);
    if (error) return setError(error.message);
    setOpen(false);
    await replan();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setOpen(!open)}>
          <Settings2 /> Studiedagen
        </Button>
        <Button onClick={replan} disabled={busy}>
          {busy ? <Spinner /> : <RefreshCw />} Herplan nu
        </Button>
      </div>
      {open && (
        <div className="w-full rounded-xl border border-border bg-card p-4 sm:w-80">
          <Field label="Studiedagen">
            <div className="flex gap-1">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(days.includes(i + 1) ? days.filter((x) => x !== i + 1) : [...days, i + 1])}
                  className={cn("size-8 rounded-md border text-xs", days.includes(i + 1) ? "border-primary bg-accent font-medium text-accent-foreground" : "border-border text-muted-foreground")}
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Dagelijks studiedoel (minuten)" className="mt-3">
            <Input type="number" min={0} max={960} value={goal} onChange={(e) => setGoal(Math.max(0, Math.min(960, Number(e.target.value) || 0)))} />
          </Field>
          <Button className="mt-3 w-full" onClick={save}>
            Opslaan en herplannen
          </Button>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
