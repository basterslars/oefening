"use client";

import { useState } from "react";
import { INTERESTS, type Interest, type NewsletterLength, type Settings, type SourceDef } from "@/lib/types";

const TIER = { official: "Officieel", press: "Journalistiek", community: "Community" } as const;
const LENGTHS: { key: NewsletterLength; label: string }[] = [
  { key: "short", label: "Kort (5 headlines)" },
  { key: "normal", label: "Normaal (7)" },
  { key: "long", label: "Uitgebreid (10)" },
];

export function SettingsForm({ initial, sources, emailConfigured }: { initial: Settings; sources: Omit<SourceDef, "kind">[]; emailConfigured: boolean }) {
  const [s, setS] = useState<Settings>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Settings>) => { setS({ ...s, ...patch }); setState("idle"); };

  async function save() {
    setState("saving");
    setError(null);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { setS(body.settings); setState("saved"); }
    else { setState("error"); setError(body.error ?? "Opslaan mislukt"); }
  }

  const label = "text-xs font-medium uppercase tracking-wide text-muted";
  const input = "mt-1 rounded-md border border-line bg-bg px-3 py-1.5 text-sm";

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={label}>Tijdstip dagelijkse nieuwsbrief</span>
          <input type="time" value={s.deliveryTime} onChange={(e) => set({ deliveryTime: e.target.value })} className={`${input} block w-full`} />
        </label>
        <label className="block">
          <span className={label}>Tijdzone</span>
          <input value={s.timezone} onChange={(e) => set({ timezone: e.target.value })} className={`${input} block w-full`} />
        </label>
        <label className="block">
          <span className={label}>Nieuwsbrieflengte</span>
          <select value={s.length} onChange={(e) => set({ length: e.target.value as NewsletterLength })} className={`${input} block w-full`}>
            {LENGTHS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={label}>Periode (uren terug)</span>
          <input type="number" min={6} max={168} value={s.lookbackHours} onChange={(e) => set({ lookbackHours: Number(e.target.value) })} className={`${input} block w-full`} />
        </label>
      </section>

      <section>
        <h2 className="font-semibold">Interessegebieden</h2>
        <p className="text-sm text-muted">1 = liever niet, 3 = neutraal, 5 = altijd tonen. Je feedback (likes, opslaan, niet interessant) verfijnt dit automatisch.</p>
        <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {(Object.keys(INTERESTS) as Interest[]).map((k) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm">
              <span>{INTERESTS[k]}</span>
              <span className="flex items-center gap-2">
                <input type="range" min={1} max={5} value={s.interests[k]} onChange={(e) => set({ interests: { ...s.interests, [k]: Number(e.target.value) } })} />
                <span className="w-3 font-mono">{s.interests[k]}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Bronnen</h2>
        <p className="text-sm text-muted">Zet bronnen aan of uit. &lsquo;Voorkeur&rsquo; geeft een bron extra gewicht bij het rangschikken.</p>
        <div className="mt-3 divide-y divide-line rounded-lg border border-line">
          {sources.map((src) => (
            <div key={src.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input type="checkbox" checked={!!s.enabledSources[src.id]} onChange={(e) => set({ enabledSources: { ...s.enabledSources, [src.id]: e.target.checked } })} />
                <span className="font-medium">{src.name}</span>
                <span className="truncate text-xs text-muted">{src.description}</span>
              </label>
              <span className="text-xs text-muted">{TIER[src.tier]}</span>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={s.preferredSources.includes(src.id)}
                  onChange={(e) => set({ preferredSources: e.target.checked ? [...s.preferredSources, src.id] : s.preferredSources.filter((x) => x !== src.id) })}
                />
                voorkeur
              </label>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">E-mail</h2>
        {!emailConfigured && <p className="text-sm text-muted">Zet <code>RESEND_API_KEY</code> en <code>EMAIL_FROM</code> in de omgeving om e-mail te activeren.</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.email.enabled} disabled={!emailConfigured} onChange={(e) => set({ email: { ...s.email, enabled: e.target.checked } })} />
            Stuur de nieuwsbrief ook per e-mail
          </label>
          <input type="email" placeholder="jij@voorbeeld.nl" value={s.email.to} onChange={(e) => set({ email: { ...s.email, to: e.target.value } })} className={input} />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={state === "saving"} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:text-zinc-950">
          {state === "saving" ? "Opslaan…" : "Instellingen opslaan"}
        </button>
        {state === "saved" && <span className="text-sm text-emerald-600">Opgeslagen.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
