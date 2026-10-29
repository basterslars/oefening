import { errorResponse, requireUser } from "@/lib/ai/server/http";
import { getStagingProvider } from "@/lib/ai/server/providers";

export const maxDuration = 300;

/** Virtuele staging: genereert een nieuwe afbeelding op basis van de foto. De originele foto blijft ongewijzigd. */
export async function POST(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const image = form.get("image");
    const prompt = String(form.get("prompt") ?? "");
    if (!(image instanceof Blob)) return Response.json({ error: "Geen afbeelding ontvangen" }, { status: 400 });
    const p = getStagingProvider();
    const out = await p.stage(image, prompt);
    return new Response(out.data, { headers: { "content-type": out.mime, "x-provider": p.id, "x-model": p.model } });
  } catch (e) {
    return errorResponse(e);
  }
}
