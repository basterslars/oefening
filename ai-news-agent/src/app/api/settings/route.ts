import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { Repo } from "@/lib/repo";
import { SOURCES } from "@/lib/sources/registry";
import { INTEREST_KEYS } from "@/lib/types";

const sourceIds = new Set(SOURCES.map((s) => s.id));

const SettingsSchema = z.object({
  deliveryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Tijd moet HH:MM zijn"),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Onbekende tijdzone (gebruik bijv. Europe/Amsterdam)"),
  length: z.enum(["short", "normal", "long"]),
  lookbackHours: z.number().int().min(6).max(168),
  interests: z.object(Object.fromEntries(INTEREST_KEYS.map((k) => [k, z.number().int().min(1).max(5)]))),
  enabledSources: z.record(z.string(), z.boolean()),
  preferredSources: z.array(z.string()),
  email: z.object({ enabled: z.boolean(), to: z.union([z.literal(""), z.email("Ongeldig e-mailadres")]) }),
});

export async function GET() {
  return NextResponse.json({ settings: new Repo().getSettings() });
}

export async function PUT(req: Request) {
  const parsed = SettingsSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Ongeldige instellingen");
  const repo = new Repo();
  const s = parsed.data;
  const settings = {
    ...repo.getSettings(),
    ...s,
    interests: s.interests as ReturnType<Repo["getSettings"]>["interests"],
    enabledSources: Object.fromEntries(Object.entries(s.enabledSources).filter(([id]) => sourceIds.has(id))),
    preferredSources: s.preferredSources.filter((id) => sourceIds.has(id)),
  };
  repo.saveSettings(settings);
  return NextResponse.json({ settings: repo.getSettings() });
}
