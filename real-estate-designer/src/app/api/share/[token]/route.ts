import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Leest een gedeeld project via een beveiligde link. Gebruikt de service-role-
 * sleutel uitsluitend server-side om (1) de link te valideren via de database-
 * functie resolve_share en (2) kortlevende ondertekende URL's voor de media te
 * maken. De sleutel komt nooit in de browser.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/share/[token]">) {
  const { token } = await ctx.params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return Response.json({ status: "not_configured" }, { status: 503 });
  const passcode = new URL(req.url).searchParams.get("passcode");
  const sb = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("resolve_share", { p_token: token, p_passcode: passcode });
  if (error) return Response.json({ status: "error" }, { status: 500 });
  if (data.status !== "ok") return Response.json({ status: data.status }, { status: data.status === "passcode_required" ? 401 : 404 });
  const media = (data.project.media ?? []) as { id: string }[];
  const paths = media.map((m) => `${data.storagePrefix}/${m.id}`);
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await sb.storage.from("project-media").createSignedUrls(paths, 60 * 60);
    signed?.forEach((s, i) => s.signedUrl && (urls[media[i].id] = s.signedUrl));
  }
  return Response.json({ status: "ok", project: data.project, mediaUrls: urls }, { headers: { "cache-control": "no-store" } });
}
