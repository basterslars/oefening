// Eenvoudige, toegankelijke grafieken in HTML/SVG (geen chart-bibliotheek nodig).
// Eén reeks per grafiek in de primaire kleur; waarden staan in tooltips en labels.
import { cn } from "@/lib/utils";

export function BarChart({ data, format, height = 160, className }: { data: { label: string; value: number; sub?: string }[]; format: (v: number) => string; height?: number; className?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn("w-full", className)}>
      <div className="relative flex items-end gap-1.5 border-b border-border" style={{ height }}>
        {[0.5, 1].map((g) => (
          <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70" style={{ bottom: `${g * 100}%` }}>
            <span className="absolute -top-2 right-0 bg-card pl-1 text-[10px] text-muted-foreground">{format(max * g)}</span>
          </div>
        ))}
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-10 rounded-t-[4px] bg-primary/85 transition-colors group-hover:bg-primary"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md group-hover:block">
              <span className="font-medium">{format(d.value)}</span>
              <span className="text-muted-foreground"> · {d.sub ?? d.label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {data.map((d) => (
          <span key={d.label} className="flex-1 truncate text-center text-[10px] text-muted-foreground">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Scores in de tijd (0–100%) met een referentielijn (bijv. 55% = voldoende). */
export function ScoreLine({ points, reference = 55, height = 160 }: { points: { label: string; value: number; title: string }[]; reference?: number; height?: number }) {
  const w = 600;
  const pad = 8;
  const x = (i: number) => (points.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (points.length - 1));
  const y = (v: number) => height - pad - (v / 100) * (height - 2 * pad);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img" aria-label="Tentamenscores in de tijd">
        <line x1={0} x2={w} y1={y(reference)} y2={y(reference)} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map((p, i) => (
        <div key={i} className="group absolute -translate-x-1/2 translate-y-1/2" style={{ left: `${(x(i) / w) * 100}%`, bottom: `${((height - y(p.value)) / height) * 100}%` }}>
          <div className="size-3 rounded-full border-2 border-card bg-primary" />
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md group-hover:block">
            <span className="font-medium">{Math.round(p.value)}%</span> <span className="text-muted-foreground">· {p.title}</span>
          </div>
        </div>
      ))}
      <span className="absolute right-0 text-[10px] text-muted-foreground" style={{ bottom: `${((height - y(reference)) / height) * 100}%` }}>
        {reference}%
      </span>
    </div>
  );
}
