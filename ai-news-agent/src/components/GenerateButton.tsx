"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import type { RunRow } from "@/lib/types";

/** Start handmatig een nieuwe nieuwsbrief en volgt de voortgang via het run-log. */
export function GenerateButton({ hasToday, initialRunning }: { hasToday: boolean; initialRunning: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(initialRunning);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) poll();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function poll() {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const res = await fetch("/api/runs", { cache: "no-store" });
        const { runs } = (await res.json()) as { runs: RunRow[] };
        const run = runs[0];
        if (!run) return;
        setStatus(run.log.at(-1)?.message ?? "Bezig…");
        if (run.status !== "running") {
          clearInterval(timer.current!);
          setRunning(false);
          setFailed(run.status === "failed");
          setStatus(run.status === "failed" ? `Mislukt: ${run.error}` : "Klaar.");
          router.refresh();
        }
      } catch {
        // tijdelijke netwerkfout: volgende poll opnieuw
      }
    }, 2000);
  }

  async function start() {
    if (hasToday && !confirm("Er is al een nieuwsbrief voor vandaag. Een nieuwe versie maken? De vorige blijft in het archief.")) return;
    setRunning(true);
    setFailed(false);
    setStatus("Starten…");
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: hasToday }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRunning(false);
      setFailed(true);
      setStatus(body.error ?? "Starten mislukt");
      return;
    }
    poll();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={start}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60 dark:text-zinc-950"
      >
        {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {running ? "Bezig met genereren…" : hasToday ? "Opnieuw genereren" : "Genereer nieuwsbrief"}
      </button>
      {status && <p className={`max-w-md text-xs ${failed ? "text-red-600" : "text-muted"}`}>{status}</p>}
    </div>
  );
}
