"use client";

import { useState } from "react";
import { Bookmark, Loader2, Sparkles } from "lucide-react";
import type { OpportunityRow } from "@/lib/repo";
import { Card, Markdown, Score, SourceLinks } from "./ui";

export function OpportunityCard({ op, aiEnabled, timezone }: { op: OpportunityRow; aiEnabled: boolean; timezone: string }) {
  const [saved, setSaved] = useState(op.saved);
  const [notes, setNotes] = useState(op.notes);
  const [notesDirty, setNotesDirty] = useState(false);
  const [expansion, setExpansion] = useState(op.expansion);
  const [busy, setBusy] = useState<"save" | "notes" | "expand" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = op.data;

  async function patch(body: { saved?: boolean; notes?: string }) {
    const res = await fetch(`/api/opportunities/${op.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Opslaan mislukt");
  }

  async function run(kind: "save" | "notes" | "expand", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div id={`op-${op.id}`} className="flex scroll-mt-20 items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{op.date}</p>
          <h3 className="font-semibold">{d.title}</h3>
        </div>
        <button
          type="button"
          onClick={() => run("save", async () => { await patch({ saved: !saved }); setSaved(!saved); })}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm ${saved ? "bg-accent-soft text-accent" : "border border-line text-muted hover:text-ink"}`}
        >
          <Bookmark size={14} fill={saved ? "currentColor" : "none"} /> {saved ? "Opgeslagen" : "Opslaan"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        <Score label="Moeilijkheid" value={d.buildDifficulty} />
        <Score label="Potentieel" value={d.commercialPotential} />
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {([["Probleem", d.problem], ["Doelgroep", d.audience], ["AI-aanpak", d.aiApproach], ["Verkopen als", d.howToSell], ["Verdienmodel", d.revenueModel]] as const).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">{k}</dt>
            <dd className="leading-relaxed">{v}</dd>
          </div>
        ))}
      </dl>
      <SourceLinks sources={d.sources} timezone={timezone} />

      <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted">Notities</label>
      <textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
        rows={2}
        placeholder="Eigen gedachten, contacten, twijfels…"
        className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {notesDirty && (
          <button type="button" onClick={() => run("notes", async () => { await patch({ notes }); setNotesDirty(false); })} className="rounded-md border border-line px-2.5 py-1 text-sm">
            {busy === "notes" ? "Opslaan…" : "Notities opslaan"}
          </button>
        )}
        <button
          type="button"
          disabled={!aiEnabled || busy === "expand"}
          title={aiEnabled ? "" : "Vereist ANTHROPIC_API_KEY"}
          onClick={() =>
            run("expand", async () => {
              const res = await fetch(`/api/opportunities/${op.id}/expand`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes }) });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(body.error ?? "Uitwerken mislukt");
              setExpansion(body.expansion);
              setSaved(true);
            })
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-sm text-white disabled:opacity-50 dark:text-zinc-950"
        >
          {busy === "expand" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {expansion ? "Opnieuw uitwerken" : "Verder uitwerken met AI"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      {expansion && (
        <div className="mt-4 rounded-lg border border-line bg-bg p-4">
          <Markdown text={expansion} />
        </div>
      )}
    </Card>
  );
}
