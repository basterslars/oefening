import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AIRefusalError, AIUnavailableError } from "./providers";

/**
 * In cloudmodus mogen alleen ingelogde gebruikers de (betaalde) AI-endpoints
 * aanroepen. De client stuurt het Supabase-access-token mee als Bearer-token.
 * In lokale modus (geen Supabase) is er geen account; draai de app dan niet
 * publiek met een AI-sleutel (zie README).
 */
export async function requireUser(req: Request): Promise<Response | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Niet ingelogd" }, { status: 401 });
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });
  return null;
}

export function errorResponse(e: unknown) {
  if (e instanceof AIUnavailableError) return Response.json({ error: e.message, code: "not_configured" }, { status: 503 });
  if (e instanceof AIRefusalError) return Response.json({ error: e.message, code: "refusal" }, { status: 422 });
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[ai]", msg);
  return Response.json({ error: `AI-verzoek mislukt: ${msg}` }, { status: 502 });
}

export function parseDataUrl(dataUrl: string) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Ongeldige afbeelding");
  return { mediaType: m[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif", base64: m[2] };
}
