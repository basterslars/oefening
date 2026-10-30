"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cardMastery, newCardFields } from "@/lib/srs";
import type { Course, Flashcard, Topic } from "@/lib/types";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Spinner } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

const TYPES = ["begrip", "definitie", "theorie", "formule", "overig"] as const;

function CardEditor({ courseId, topics, card, onDone }: { courseId: string; topics: Pick<Topic, "id" | "name">[]; card?: Flashcard; onDone: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      front: String(f.get("front")).trim(),
      back: String(f.get("back")).trim(),
      card_type: String(f.get("card_type")),
      difficulty: Number(f.get("difficulty")),
      topic_id: String(f.get("topic_id") || "") || null,
      updated_at: new Date().toISOString(),
    };
    if (!row.front || !row.back) return setError("Voor- en achterkant zijn verplicht.");
    setBusy(true);
    const supabase = supabaseBrowser();
    const res = card
      ? await supabase.from("flashcards").update(row).eq("id", card.id)
      : await supabase.from("flashcards").insert({ ...row, course_id: courseId, origin: "manual", ...newCardFields() });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    onDone();
    router.refresh();
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Voorkant (vraag)">
          <Textarea name="front" required maxLength={2000} defaultValue={card?.front} rows={3} />
        </Field>
        <Field label="Achterkant (antwoord)" hint="Markdown en LaTeX ($…$) toegestaan">
          <Textarea name="back" required maxLength={4000} defaultValue={card?.back} rows={3} />
        </Field>
        <Field label="Type">
          <Select name="card_type" defaultValue={card?.card_type ?? "begrip"}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Moeilijkheid">
          <Select name="difficulty" defaultValue={card?.difficulty ?? 2}>
            <option value={1}>Basis</option>
            <option value={2}>Gemiddeld</option>
            <option value={3}>Moeilijk</option>
          </Select>
        </Field>
        <Field label="Onderwerp" className="sm:col-span-2">
          <Select name="topic_id" defaultValue={card?.topic_id ?? ""}>
            <option value="">—</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuleren
        </Button>
        <Button disabled={busy}>{busy && <Spinner />} Opslaan</Button>
      </div>
    </form>
  );
}

export function CardManager({ aiEnabled, course, cards, topics, documents }: { aiEnabled: boolean; course: Pick<Course, "id" | "name">; cards: Flashcard[]; topics: Pick<Topic, "id" | "name">[]; documents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [genCount, setGenCount] = useState(15);
  const [genTopic, setGenTopic] = useState("");
  const [genDoc, setGenDoc] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const topicName = useMemo(() => new Map(topics.map((t) => [t.id, t.name])), [topics]);
  const filtered = cards.filter((c) => !q || `${c.front} ${c.back}`.toLowerCase().includes(q.toLowerCase()));

  async function generate() {
    setGenBusy(true);
    setMsg(null);
    const res = await fetch("/api/flashcards/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId: course.id, count: genCount, topicId: genTopic || null, documentIds: genDoc ? [genDoc] : [] }),
    });
    const json = await res.json().catch(() => ({}));
    setGenBusy(false);
    if (!res.ok) return setMsg({ tone: "danger", text: json.error ?? "Genereren mislukt." });
    setMsg({ tone: "success", text: json.created ? `${json.created} nieuwe kaarten aangemaakt.` : "Geen nieuwe kaarten: de belangrijkste begrippen hebben al een kaart." });
    router.refresh();
  }

  async function remove(c: Flashcard) {
    if (!confirm("Deze kaart verwijderen?")) return;
    await supabaseBrowser().from("flashcards").delete().eq("id", c.id);
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">{course.name}</h2>
      <Card className="p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-primary" /> Automatisch genereren uit je documenten
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Field label="Aantal">
            <Input type="number" min={3} max={40} value={genCount} onChange={(e) => setGenCount(Math.max(3, Math.min(40, Number(e.target.value) || 3)))} />
          </Field>
          <Field label="Onderwerp">
            <Select value={genTopic} onChange={(e) => setGenTopic(e.target.value)}>
              <option value="">Hele vak</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Document">
            <Select value={genDoc} onChange={(e) => setGenDoc(e.target.value)}>
              <option value="">Alle documenten</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button className="w-full" onClick={generate} disabled={genBusy || !aiEnabled || documents.length === 0}>
              {genBusy ? <Spinner /> : <Sparkles />} Genereren
            </Button>
          </div>
        </div>
        {!aiEnabled && <p className="mt-2 text-xs text-muted-foreground">AI niet geconfigureerd; je kunt wel zelf kaarten toevoegen.</p>}
        {documents.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Upload eerst documenten bij dit vak.</p>}
        {msg && <Alert tone={msg.tone} className="mt-3">{msg.text}</Alert>}
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Zoek in ${cards.length} kaarten…`} />
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus /> Kaart toevoegen
        </Button>
      </div>
      {adding && (
        <Card className="p-4">
          <CardEditor courseId={course.id} topics={topics} onDone={() => setAdding(false)} />
        </Card>
      )}
      <ul className="space-y-2">
        {filtered.map((c) => {
          const m = cardMastery(c.fsrs, c.state);
          return (
            <li key={c.id} className="rounded-xl border border-border bg-card p-4">
              {editing === c.id ? (
                <CardEditor courseId={course.id} topics={topics} card={c} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex gap-3">
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 sm:gap-4">
                    <Markdown className="font-medium">{c.front}</Markdown>
                    <Markdown className="text-muted-foreground">{c.back}</Markdown>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2">
                      <Badge tone={m.value >= 0.8 ? "success" : m.value >= 0.4 ? "warning" : m.value > 0 ? "danger" : "neutral"}>{m.label}</Badge>
                      <Badge>{c.card_type}</Badge>
                      <Badge>{["", "basis", "gemiddeld", "moeilijk"][c.difficulty]}</Badge>
                      {c.topic_id && topicName.get(c.topic_id) && <Badge tone="primary">{topicName.get(c.topic_id)}</Badge>}
                      <span>· volgende herhaling {formatDate(c.due)}</span>
                      {c.source_location && <span>· {c.source_location}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button aria-label="Bewerken" onClick={() => setEditing(c.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                      <Pencil className="size-4" />
                    </button>
                    <button aria-label="Verwijderen" onClick={() => remove(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-danger">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
