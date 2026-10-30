"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Course } from "@/lib/types";
import { CourseForm } from "@/components/course-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";

export function CourseSettings({ course }: { course: Course }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    if (!confirm(`Vak "${course.name}" definitief verwijderen, inclusief documenten, flashcards, tentamens en voortgang?`)) return;
    const supabase = supabaseBrowser();
    // Eerst bestanden uit de opslag, daarna het vak (rijen verdwijnen via cascade)
    const { data: docs } = await supabase.from("documents").select("storage_path").eq("course_id", course.id);
    if (docs?.length) await supabase.storage.from("documents").remove(docs.map((d: { storage_path: string }) => d.storage_path));
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) return setError(error.message);
    router.push("/courses");
    router.refresh();
  }
  return (
    <div className="space-y-8">
      <CourseForm course={course} />
      <div className="rounded-xl border border-danger/30 p-4">
        <p className="text-sm font-medium">Vak verwijderen</p>
        <p className="mt-1 text-sm text-muted-foreground">Verwijdert alle documenten, fragmenten, onderwerpen, flashcards, tentamens en studietijd van dit vak.</p>
        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
        <Button variant="danger" size="sm" className="mt-3" onClick={remove}>
          <Trash2 /> Verwijderen
        </Button>
      </div>
    </div>
  );
}
