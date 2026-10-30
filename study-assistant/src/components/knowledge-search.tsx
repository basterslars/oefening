"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert, Badge, Spinner } from "@/components/ui/misc";

interface Result {
  id: string;
  document_name: string;
  location: string | null;
  heading: string | null;
  content: string;
}

function highlight(text: string, q: string) {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  const re = new RegExp(`(${words.join("|")})`, "giu");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded bg-warning/30 px-0.5 text-foreground">{part}</mark> : part));
}

/** Doorzoek het eigen studiemateriaal (kennisbank). */
export function KnowledgeSearch({ courseId }: { courseId?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}${courseId ? `&course=${courseId}` : ""}`);
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Zoeken mislukt.");
    setResults(json.results);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek een begrip, formule of onderwerp…" maxLength={300} />
        <Button disabled={busy}>{busy ? <Spinner /> : <Search />} Zoeken</Button>
      </form>
      {error && <Alert tone="danger">{error}</Alert>}
      {results && results.length === 0 && <p className="text-sm text-muted-foreground">Niets gevonden in je materiaal.</p>}
      {results && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-medium">{r.document_name}</span>
                {r.location && <Badge>{r.location}</Badge>}
              </div>
              <p className="line-clamp-6 whitespace-pre-line text-sm text-muted-foreground">{highlight(r.content, q)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
