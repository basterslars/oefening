"use client";

import { X } from "lucide-react";
import { forwardRef, useEffect } from "react";
import { PROVENANCE_LABELS, type Provenance } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "ai";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-accent text-white hover:bg-[#16302a] shadow-sm",
  secondary: "bg-white text-ink border border-line hover:bg-stone-50 shadow-sm",
  ghost: "text-ink hover:bg-stone-100",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  ai: "bg-ai text-white hover:bg-[#5a4189] shadow-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md"; icon?: React.ReactNode }
>(function Button({ variant = "secondary", size = "md", icon, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        BTN[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  active,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      {...rest}
      className={cx(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-40",
        active ? "bg-accent text-white" : "text-ink hover:bg-stone-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputBase =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";
const inputCls = `w-full ${inputBase}`;
/** Laat een expliciete breedte in className winnen van de standaard w-full */
const fieldCls = (className?: string) => cx(/(^|\s)w-/.test(className ?? "") ? inputBase : inputCls, className);

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={fieldCls(className)} />;
});

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(fieldCls(className), "pr-8")}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(fieldCls(className), "min-h-20")} />;
}

/** Numerieke invoer in meters die pas bij blur/enter doorgeeft (voorkomt springende waarden) */
export function MeterInput({
  value,
  onCommit,
  min = 0,
  step = 0.01,
  className,
  ...rest
}: { value: number; onCommit: (v: number) => void; min?: number; step?: number; className?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "min" | "step"
>) {
  const display = Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "";
  return (
    <div className={cx("relative", className)}>
      <input
        key={display}
        type="number"
        inputMode="decimal"
        defaultValue={display}
        min={min}
        step={step}
        {...rest}
        onBlur={(e) => {
          const v = parseFloat(e.currentTarget.value.replace(",", "."));
          if (Number.isFinite(v) && v >= min && Math.abs(v - value) > 1e-6) onCommit(v);
          else e.currentTarget.value = display;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          e.stopPropagation();
        }}
        className={cx(inputCls, "pr-8 tabular-nums")}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">m</span>
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "accent" | "ai" | "warn" | "ok"; children: React.ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-700",
    accent: "bg-accent-soft text-accent",
    ai: "bg-ai-soft text-ai",
    warn: "bg-amber-50 text-amber-800",
    ok: "bg-emerald-50 text-emerald-800",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function ProvenanceBadge({ source }: { source: Provenance }) {
  const tone = source === "ai_estimate" ? "ai" : source === "default" ? "warn" : source === "traced" ? "accent" : "ok";
  const title =
    source === "ai_estimate"
      ? "Geschat door AI op basis van beeldmateriaal. Niet gecontroleerd — verifieer deze maat."
      : source === "default"
        ? "Standaardwaarde; niet door u ingevoerd."
        : source === "traced"
          ? "Overgetrokken op een geschaalde plattegrond. Nauwkeurigheid hangt af van de schaalkalibratie."
          : "Door u ingevoerd of getekend.";
  return (
    <span title={title}>
      <Badge tone={tone}>{PROVENANCE_LABELS[source]}</Badge>
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("max-h-[90vh] w-full overflow-auto rounded-2xl bg-white shadow-lift", wide ? "max-w-4xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Sluiten" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-accent" : "bg-stone-300")}
      >
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-stone-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors",
            size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-white shadow-soft", className)}>{children}</div>;
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "ai" | "error"; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-stone-200 bg-stone-50 text-stone-700",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    ai: "border-violet-200 bg-ai-soft text-[#4a3570]",
    error: "border-red-200 bg-red-50 text-red-800",
  };
  return <div className={cx("rounded-xl border px-4 py-3 text-[13px] leading-relaxed", tones[tone], className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";
}
