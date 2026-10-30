import Link from "next/link";
import { NewsletterView } from "@/components/NewsletterView";
import { Empty } from "@/components/ui";
import { Repo } from "@/lib/repo";
import { formatDateNl } from "@/lib/time";
import type { NewsletterRow } from "@/lib/types";

export function NewsletterPage({ row }: { row: NewsletterRow | null }) {
  const repo = new Repo();
  const settings = repo.getSettings();
  const archive = repo.listNewsletters(30);
  if (!row) {
    return <Empty>Nog geen nieuwsbrief. Genereer er een via het <Link href="/" className="text-accent underline">dashboard</Link>.</Empty>;
  }
  const c = row.content;
  const itemIds = [...c.headlines.map((h) => h.itemId), ...(c.tools ?? []).map((t) => t.itemId), ...(c.development?.updates ?? []).map((u) => u.itemId)];
  const feedback = repo.feedbackFor(itemIds);
  const opportunityIds = repo.opportunitiesForNewsletter(row.id).map((o) => o.id);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_200px]">
      <div className="min-w-0">
        <p className="text-sm text-muted">Nieuwsbrief #{row.id} · {c.mode === "ai" ? "AI-analyse" : "basismodus"}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{formatDateNl(c.date, settings.timezone)}</h1>
        <NewsletterView content={c} feedback={feedback} opportunityIds={opportunityIds} timezone={settings.timezone} />
      </div>
      <aside className="order-first min-w-0 lg:order-none">
        <h2 className="mb-2 text-sm font-medium text-muted">Archief</h2>
        <ul className="flex gap-2 overflow-x-auto text-sm lg:block lg:space-y-1">
          {archive.map((n) => (
            <li key={n.id} className="shrink-0">
              <Link href={`/newsletter/${n.id}`} className={`block rounded-md px-2 py-1 ${n.id === row.id ? "bg-accent-soft text-accent" : "hover:bg-panel"}`}>
                {n.date} <span className="text-xs text-muted">#{n.id}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
