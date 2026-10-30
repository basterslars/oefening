import type { ReactNode } from "react";
import type { NewsStatus, SourceRef } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-panel p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ letter, title, subtitle }: { letter?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-3 mt-10 flex items-baseline gap-3">
      {letter && <span className="font-mono text-xs text-accent">{letter}</span>}
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle && <span className="text-sm text-muted">{subtitle}</span>}
    </div>
  );
}

const STATUS_STYLE: Record<NewsStatus, string> = {
  confirmed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rumor: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  opinion: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  unverified: "bg-zinc-500/10 text-muted",
};

export function StatusBadge({ status }: { status: NewsStatus }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">{children}</span>;
}

export function Score({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={`${label}: ${value}/10`}>
      {label}
      <span className="inline-flex gap-0.5" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < value ? "bg-accent" : "bg-line"}`} />
        ))}
      </span>
      <span className="font-mono text-ink">{value}</span>
    </span>
  );
}

const TIER_LABEL = { official: "officieel", press: "media", community: "community" } as const;

export function SourceLinks({ sources, timezone }: { sources: SourceRef[]; timezone?: string }) {
  if (!sources.length) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {sources.map((s) => (
        <li key={s.articleId} className="flex flex-wrap items-baseline gap-x-2">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            {s.name}
          </a>
          <span className="text-xs text-muted">
            {TIER_LABEL[s.tier]} · {s.publishedAt ? new Date(s.publishedAt).toLocaleString("nl-NL", { timeZone: timezone ?? "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "datum onbekend"}
          </span>
          <span className="block w-full min-w-0 truncate text-xs text-muted sm:w-auto sm:flex-1" title={s.title}>
            — {s.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}

/** Minimale Markdown-weergave (koppen, lijsten, vet) voor uitgewerkte kansen. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={blocks.length}>{list.items.map((t, i) => <li key={i}>{inline(t)}</li>)}</Tag>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) blocks.push(h[1].length <= 2 ? <h2 key={blocks.length}>{inline(h[2])}</h2> : <h3 key={blocks.length}>{inline(h[2])}</h3>);
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="prose-plan text-sm">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}
