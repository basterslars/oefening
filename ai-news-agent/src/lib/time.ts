/** Lokale datum ("YYYY-MM-DD") en tijd ("HH:MM") in een IANA-tijdzone. */
export function localParts(timezone: string, at = new Date()): { date: string; time: string } {
  let tz = timezone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    tz = "Europe/Amsterdam";
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function formatDateNl(isoOrDate: string, timezone = "Europe/Amsterdam"): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? new Date(`${isoOrDate}T12:00:00Z`) : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  const s = new Intl.DateTimeFormat("nl-NL", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1); // "Vrijdag 30 oktober 2026"
}

export function formatDateTimeNl(iso: string | null, timezone = "Europe/Amsterdam"): string {
  if (!iso) return "datum onbekend";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}
