import { requireUser } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import { PageHeader } from "@/components/ui/misc";
import { ExamSetup } from "./exam-setup";

export const metadata = { title: "Nieuw oefententamen" };

export default async function NewExamPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const [coursesR, topicsR, docsR] = await Promise.all([
    supabase.from("courses").select("id, name").eq("archived", false).order("name"),
    supabase.from("topics").select("id, course_id, name, mastery, attempts").order("name"),
    supabase.from("documents").select("id, course_id, name").eq("status", "ready").order("name"),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nieuw oefententamen" description="Vragen worden gemaakt uit je eigen documenten; ook nieuwe toepassingsvragen en casussen." />
      <ExamSetup aiEnabled={config.ai.enabled} courses={coursesR.data ?? []} topics={topicsR.data ?? []} documents={docsR.data ?? []} initialCourseId={sp.course ?? null} />
    </div>
  );
}
