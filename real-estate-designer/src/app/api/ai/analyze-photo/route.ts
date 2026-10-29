import { errorResponse, parseDataUrl, requireUser } from "@/lib/ai/server/http";
import { getVisionProvider } from "@/lib/ai/server/providers";

export const maxDuration = 120;

export async function POST(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const { image, hint } = (await req.json()) as { image: string; hint?: string };
    const p = getVisionProvider();
    const result = await p.analyzePhoto(parseDataUrl(image), hint ?? "");
    return Response.json({ provider: p.id, model: p.model, result });
  } catch (e) {
    return errorResponse(e);
  }
}
