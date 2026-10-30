import { capabilities } from "@/lib/ai/server/providers";

export const dynamic = "force-dynamic";

/** Welke AI-capaciteiten zijn geconfigureerd (zonder geheimen prijs te geven) */
export async function GET() {
  return Response.json(capabilities());
}
