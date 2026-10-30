"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquareText, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { masteryLabel } from "@/lib/mastery";
import type { Topic } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert, Badge, EmptyState, masteryTone, Progress } from "@/components/ui/misc";
import { formatDate, pct } from "@/lib/utils";

export function TopicManager({ courseId, topics }: { courseId: string; topics: Topic[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const { error } = await supabaseBrowser().from("topics").insert({ course_id: courseId, name: n, source: "manual" });
    if (error) setError(error.code === "23505" ? "Dit onderwerp bestaat al." : error.message);
    else {
      setName("");
      setError(null);
      router.refresh();
    }
  }

  async function remove(t: Topic) {
    if (!confirm(`Onderwerp "${t.name}" verwijderen? De beheersingsgegevens gaan verloren.`)) return;
    const { error } = await supabaseBrowser().from("topics").delete().eq("id", t.id);
    if (error) setError(error.message);
    router.refresh();
  }

  const sorted = [...topics].sort((a, b) => (a.attempts === 0 ? 1 : 0) - (b.attempts === 0 ? 1 : 0) || a.mastery - b.mastery);
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="Onderwerp of hoofdstuk toevoegen, bijv. ‘H3 Kostprijscalculatie’" />
        <Button variant="outline">
          <Plus /> Toevoegen
        </Button>
      </form>
      {error && <Alert tone="danger">{error}</Alert>}
      {topics.length === 0 ? (
        <EmptyState title="Nog geen onderwerpen">
          Onderwerpen worden automatisch herkend bij het verwerken van documenten (met AI), of voeg ze hier zelf toe. Ze vormen de basis voor beheersing per hoofdstuk en voor de planner.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {sorted.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <Badge tone={masteryTone(t.mastery, t.attempts)}>{masteryLabel(t.mastery, t.attempts)}</Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <Progress className="max-w-60" value={t.attempts ? t.mastery : 0} tone={masteryTone(t.mastery, t.attempts)} />
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {t.attempts ? `${pct(t.mastery)} · ${t.attempts} metingen` : "niet getoetst"}
                    {t.last_studied_at ? ` · ${formatDate(t.last_studied_at)}` : ""}
                  </span>
                </div>
              </div>
              <Link href={`/tutor?course=${courseId}&mode=practice&topic=${encodeURIComponent(t.name)}`} title="Oefenen met AI-docent" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                <MessageSquareText className="size-4" />
              </Link>
              <button title="Verwijderen" aria-label="Verwijderen" onClick={() => remove(t)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
