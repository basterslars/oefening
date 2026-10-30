"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { COURSE_COLORS } from "@/lib/colors";
import type { Course } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const LEVELS = ["1 · Nog niets", "2 · Basis", "3 · Redelijk", "4 · Goed", "5 · Zeer goed"];
const DIFFICULTY = ["1 · Makkelijk", "2", "3 · Gemiddeld", "4", "5 · Zeer moeilijk"];

export function CourseForm({ course, onDone }: { course?: Course; onDone?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState(course?.color ?? "indigo");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = String(f.get(k) ?? "").trim().replace(",", ".");
      return v === "" ? null : Number(v);
    };
    const row = {
      name: String(f.get("name")).trim(),
      description: String(f.get("description") ?? "").trim() || null,
      color,
      exam_date: String(f.get("exam_date") || "") || null,
      material_pages: num("material_pages"),
      estimated_hours: num("estimated_hours"),
      difficulty: Number(f.get("difficulty")),
      knowledge_level: Number(f.get("knowledge_level")),
      hours_per_week: num("hours_per_week") ?? 0,
      updated_at: new Date().toISOString(),
    };
    if (!row.name) return setError("Geef het vak een naam.");
    if (row.hours_per_week < 0 || row.hours_per_week > 80) return setError("Uren per week moet tussen 0 en 80 liggen.");
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const res = course
      ? await supabase.from("courses").update(row).eq("id", course.id).select("id").single()
      : await supabase.from("courses").insert(row).select("id").single();
    if (res.error) {
      setBusy(false);
      return setError(res.error.message);
    }
    // Planning herberekenen bij het volgende bezoek
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) await supabase.from("profiles").update({ plan_generated_on: null }).eq("id", auth.user.id);
    setBusy(false);
    onDone?.();
    if (!course) router.push(`/courses/${res.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Naam van het vak" className="sm:col-span-2">
          <Input name="name" required maxLength={120} defaultValue={course?.name} placeholder="bijv. Financial Accounting" />
        </Field>
        <Field label="Kleur" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {Object.entries(COURSE_COLORS).map(([k, hex]) => (
              <button
                type="button"
                key={k}
                aria-label={k}
                onClick={() => setColor(k)}
                className={cn("size-7 rounded-full border-2", color === k ? "border-foreground" : "border-transparent")}
                style={{ background: hex }}
              />
            ))}
          </div>
        </Field>
        <Field label="Tentamendatum">
          <Input name="exam_date" type="date" defaultValue={course?.exam_date ?? ""} />
        </Field>
        <Field label="Beschikbaar per week (uren)">
          <Input name="hours_per_week" inputMode="decimal" defaultValue={course?.hours_per_week ?? 6} />
        </Field>
        <Field label="Hoeveelheid materiaal (pagina's)" hint="Leeg = tel pagina's van geüploade documenten">
          <Input name="material_pages" inputMode="numeric" defaultValue={course?.material_pages ?? ""} />
        </Field>
        <Field label="Of: geschatte studie-uren totaal" hint="Overschrijft de schatting op basis van pagina's">
          <Input name="estimated_hours" inputMode="decimal" defaultValue={course?.estimated_hours ?? ""} />
        </Field>
        <Field label="Moeilijkheidsgraad">
          <Select name="difficulty" defaultValue={course?.difficulty ?? 3}>
            {DIFFICULTY.map((l, i) => (
              <option key={i} value={i + 1}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Huidig kennisniveau (zelfinschatting)">
          <Select name="knowledge_level" defaultValue={course?.knowledge_level ?? 1}>
            {LEVELS.map((l, i) => (
              <option key={i} value={i + 1}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Omschrijving (optioneel)" className="sm:col-span-2">
          <Textarea name="description" maxLength={1000} defaultValue={course?.description ?? ""} rows={2} />
        </Field>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuleren
          </Button>
        )}
        <Button disabled={busy}>
          {busy && <Spinner />}
          {course ? "Opslaan" : "Vak aanmaken"}
        </Button>
      </div>
    </form>
  );
}
