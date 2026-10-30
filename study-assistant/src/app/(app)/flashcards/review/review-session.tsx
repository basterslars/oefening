"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { previewIntervals } from "@/lib/srs";
import type { Flashcard } from "@/lib/types";
import { Markdown } from "@/components/markdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const RATINGS = [
  { r: 1 as const, label: "Opnieuw", key: "1", cls: "border-danger/40 hover:bg-danger/10" },
  { r: 2 as const, label: "Moeilijk", key: "2", cls: "border-warning/50 hover:bg-warning/10" },
  { r: 3 as const, label: "Goed", key: "3", cls: "border-success/40 hover:bg-success/10" },
  { r: 4 as const, label: "Makkelijk", key: "4", cls: "border-primary/40 hover:bg-accent" },
];

type ReviewCard = Flashcard & { courses: { name: string } | null };

export function ReviewSession({ cards, courseId }: { cards: ReviewCard[]; courseId: string | null }) {
  const router = useRouter();
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [stats, setStats] = useState({ 1: 0, 2: 0, 3: 0, 4: 0 } as Record<1 | 2 | 3 | 4, number>);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(0);
  const card = queue[0];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [card?.id]);

  async function rate(r: 1 | 2 | 3 | 4) {
    if (!card || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/flashcards/${card.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: r, elapsedMs: Math.min(3_600_000, Date.now() - shownAt.current) }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Opslaan mislukt.");
    setStats((s) => ({ ...s, [r]: s[r] + 1 }));
    setFlipped(false);
    // Kaarten die binnen 20 minuten terug moeten komen, gaan achteraan de wachtrij
    const dueSoon = new Date(json.due).getTime() - Date.now() < 20 * 60_000;
    setQueue((q) => (dueSoon ? [...q.slice(1), { ...card, fsrs: json.fsrs, state: json.state }] : q.slice(1)));
    if (!dueSoon) setDone((d) => d + 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as 1 | 2 | 3 | 4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) {
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h1 className="mt-4 text-xl font-semibold">{total ? "Sessie afgerond" : "Niets te herhalen"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total
            ? `${total} beoordelingen: ${stats[1]}× opnieuw, ${stats[2]}× moeilijk, ${stats[3]}× goed, ${stats[4]}× makkelijk.`
            : "Alle kaarten zijn bijgewerkt. Kom terug wanneer er weer kaarten klaarstaan."}
        </p>
        {total > 0 && stats[1] / total > 0.3 && <Alert tone="warning" className="mt-4 text-left">Meer dan 30% moest opnieuw. Bestudeer deze onderwerpen eerst inhoudelijk (bijv. met de AI-docent) voordat je verder stampt.</Alert>}
        <div className="mt-6 flex justify-center gap-2">
          <Link href={courseId ? `/flashcards?course=${courseId}` : "/flashcards"} className={buttonVariants({ variant: "outline" })}>
            Naar flashcards
          </Link>
          <Button onClick={() => router.refresh()}>
            <RotateCcw /> Opnieuw laden
          </Button>
        </div>
      </div>
    );
  }

  // Intervallen hangen af van "nu": pas na het draaien (alleen in de browser) berekenen
  const intervals = flipped ? previewIntervals(card.fsrs) : null;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {done} gedaan · {queue.length} te gaan
        </span>
        <span className="flex items-center gap-1.5">
          {card.state === 0 && <Badge tone="primary">nieuw</Badge>}
          {card.courses?.name}
        </span>
      </div>
      <Progress value={done / Math.max(1, done + queue.length)} className="mb-6" />

      <div className="flip">
        <button
          type="button"
          onClick={() => setFlipped(!flipped)}
          className={cn("flip-inner relative grid min-h-72 w-full text-left", flipped && "flipped")}
          aria-label={flipped ? "Toon voorkant" : "Toon antwoord"}
        >
          <div className="flip-face col-start-1 row-start-1 flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
            <span className="text-xs text-muted-foreground">Vraag</span>
            <div className="flex flex-1 items-center justify-center py-6 text-center">
              <Markdown className="text-lg">{card.front}</Markdown>
            </div>
            <span className="text-center text-xs text-muted-foreground">Tik of druk op spatie om te draaien</span>
          </div>
          <div className="flip-face flip-back col-start-1 row-start-1 flex flex-col rounded-2xl border border-primary/30 bg-card p-6 shadow-sm">
            <span className="text-xs text-muted-foreground">Antwoord</span>
            <div className="flex flex-1 items-center justify-center py-6 text-center">
              <Markdown className="text-base">{card.back}</Markdown>
            </div>
            {card.source_location && <span className="text-center text-xs text-muted-foreground">Bron: {card.source_location}</span>}
          </div>
        </button>
      </div>

      {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
      <div className={cn("mt-6 grid grid-cols-4 gap-2 transition-opacity", !flipped && "pointer-events-none opacity-30")}>
        {RATINGS.map((x) => (
          <button key={x.r} disabled={busy || !flipped} onClick={() => rate(x.r)} className={cn("rounded-xl border bg-card px-2 py-3 text-center", x.cls)}>
            <span className="block text-sm font-medium">{x.label}</span>
            <span className="block text-[11px] text-muted-foreground">{intervals?.[x.r] ?? "\u00a0"}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 hidden text-center text-[11px] text-muted-foreground sm:block">Sneltoetsen: spatie = draaien, 1–4 = beoordelen</p>
    </div>
  );
}
