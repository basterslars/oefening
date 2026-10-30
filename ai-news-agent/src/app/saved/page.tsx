import Link from "next/link";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { Card, Empty, Pill, SourceLinks } from "@/components/ui";
import { Repo } from "@/lib/repo";
import { formatDateTimeNl } from "@/lib/time";
import { CATEGORIES, CATEGORY_KEYS, type FeedbackAction, type SourceRef } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS: { key: FeedbackAction | "any"; label: string }[] = [
  { key: "any", label: "Alles" },
  { key: "save", label: "Opgeslagen" },
  { key: "favorite", label: "Favorieten" },
  { key: "like", label: "Interessant" },
];
const KIND = { headline: "Nieuws", tool: "Tool", dev: "Development" } as const;

export default async function Saved({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; tab?: string }> }) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "any") as FeedbackAction | "any";
  const category = sp.category && (CATEGORY_KEYS as string[]).includes(sp.category) ? sp.category : undefined;
  const repo = new Repo();
  const tz = repo.getSettings().timezone;
  const items = repo.searchItems({ q: sp.q?.trim() || undefined, category, action: tab });

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, category, tab, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "any") p.set(k, v);
    return `/saved${p.size ? `?${p}` : ""}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Opgeslagen nieuws</h1>
      <div className="mt-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link key={t.key} href={href({ tab: t.key })} className={`rounded-md px-2.5 py-1 text-sm ${tab === t.key ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </div>
      <form className="mt-4 flex flex-wrap gap-2" action="/saved">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Zoek in titels en samenvattingen…" className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-1.5 text-sm" />
        <select name="category" defaultValue={category ?? ""} className="rounded-md border border-line bg-panel px-2 py-1.5 text-sm">
          <option value="">Alle categorieën</option>
          {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{CATEGORIES[c]}</option>)}
        </select>
        <button className="rounded-md bg-accent px-3 py-1.5 text-sm text-white dark:text-zinc-950">Zoeken</button>
      </form>

      <div className="mt-6 space-y-3">
        {items.length === 0 && <Empty>Niets gevonden. Gebruik de knoppen bij nieuwsitems om ze te liken, op te slaan of als favoriet te markeren.</Empty>}
        {items.map((it) => {
          const sources = ((it.data as { sources?: SourceRef[] }).sources ?? []) as SourceRef[];
          return (
            <Card key={it.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Pill>{KIND[it.kind]}</Pill>
                <Pill>{CATEGORIES[it.category] ?? it.category}</Pill>
                <span className="text-xs text-muted">{formatDateTimeNl(it.createdAt, tz)}</span>
                <Link href={`/newsletter/${it.newsletterId}`} className="ml-auto text-xs text-accent">nieuwsbrief #{it.newsletterId}</Link>
              </div>
              <h3 className="mt-2 font-semibold">{it.title}</h3>
              <p className="mt-1 text-sm leading-relaxed">{it.summary}</p>
              <SourceLinks sources={sources} timezone={tz} />
              <div className="mt-2 flex justify-end">
                <FeedbackButtons itemId={it.id} initial={it.feedback} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
