import Link from "next/link";
import { OpportunityCard } from "@/components/OpportunityCard";
import { Empty } from "@/components/ui";
import { aiAvailable } from "@/lib/config";
import { Repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function Opportunities({ searchParams }: { searchParams: Promise<{ saved?: string; q?: string }> }) {
  const sp = await searchParams;
  const savedOnly = sp.saved === "1";
  const repo = new Repo();
  const tz = repo.getSettings().timezone;
  const ops = repo.listOpportunities({ savedOnly, q: sp.q?.trim() || undefined });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">AI Opportunities</h1>
      <p className="mt-1 text-sm text-muted">Alle zakelijke kansen uit eerdere nieuwsbrieven. Sla ideeën op, maak notities en laat ze verder uitwerken.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/opportunities" className={`rounded-md px-2.5 py-1 text-sm ${!savedOnly ? "bg-accent-soft text-accent" : "text-muted"}`}>Alle</Link>
        <Link href="/opportunities?saved=1" className={`rounded-md px-2.5 py-1 text-sm ${savedOnly ? "bg-accent-soft text-accent" : "text-muted"}`}>Opgeslagen</Link>
        <form action="/opportunities" className="ml-auto flex gap-2">
          {savedOnly && <input type="hidden" name="saved" value="1" />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Zoeken…" className="rounded-md border border-line bg-panel px-3 py-1 text-sm" />
        </form>
      </div>
      <div className="mt-6 space-y-4">
        {ops.length === 0 && <Empty>{savedOnly ? "Nog geen opgeslagen kansen." : "Nog geen kansen. Ze verschijnen zodra een nieuwsbrief met AI-analyse is gemaakt."}</Empty>}
        {ops.map((op) => <OpportunityCard key={op.id} op={op} aiEnabled={aiAvailable()} timezone={tz} />)}
      </div>
    </div>
  );
}
