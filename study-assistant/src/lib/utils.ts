import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Datum als YYYY-MM-DD in lokale tijd (geen UTC-verschuiving rond middernacht). */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** ISO-weekdag: 1 = maandag … 7 = zondag. */
export function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });

export function formatDate(key: string | Date): string {
  return dateFmt.format(typeof key === "string" ? parseDateKey(key.slice(0, 10)) : key);
}

export function formatLongDate(key: string | Date): string {
  return longFmt.format(typeof key === "string" ? parseDateKey(key.slice(0, 10)) : key);
}

export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} u ${rest} min` : `${h} u`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** YYYY-MM-DD van een moment in een bepaalde tijdzone (server draait vaak in UTC). */
export function dateKeyInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
