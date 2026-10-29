import type { DesignContext } from "@/lib/ai/schemas";
import { errorResponse, requireUser } from "@/lib/ai/server/http";
import { getDesignProvider } from "@/lib/ai/server/providers";

export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const { context } = (await req.json()) as { context: DesignContext };
    if (!context?.prompt?.trim()) return Response.json({ error: "Geef een opdracht op." }, { status: 400 });
    context.variantCount = Math.min(Math.max(1, Math.round(context.variantCount || 1)), 3);
    const p = getDesignProvider();
    const result = await p.proposeDesign(context);
    return Response.json({ provider: p.id, model: p.model, result });
  } catch (e) {
    return errorResponse(e);
  }
}
