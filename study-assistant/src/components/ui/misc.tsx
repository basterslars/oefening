import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-accent text-accent-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-[color-mix(in_oklch,var(--warning)_60%,var(--foreground))]",
  danger: "bg-danger/12 text-danger",
};

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", tones[tone], className)} {...props} />;
}

export function masteryTone(mastery: number, attempts = 1): Tone {
  if (attempts === 0) return "neutral";
  if (mastery < 0.6) return "danger";
  if (mastery < 0.8) return "warning";
  return "success";
}

export function Progress({ value, tone = "primary", className }: { value: number; tone?: Tone; className?: string }) {
  const color = { neutral: "bg-muted-foreground/40", primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({ tone = "neutral", title, children, className }: { tone?: Tone; title?: string; children?: React.ReactNode; className?: string }) {
  const border = { neutral: "border-border", primary: "border-primary/30", success: "border-success/40", warning: "border-warning/50", danger: "border-danger/40" }[tone];
  const bg = { neutral: "bg-muted/50", primary: "bg-accent/50", success: "bg-success/8", warning: "bg-warning/10", danger: "bg-danger/8" }[tone];
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", border, bg, className)} role={tone === "danger" ? "alert" : undefined}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn("text-muted-foreground", title && "mt-0.5")}>{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden />;
}
