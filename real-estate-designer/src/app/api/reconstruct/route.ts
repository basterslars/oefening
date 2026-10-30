import { errorResponse, requireUser } from "@/lib/ai/server/http";
import { getReconstructionProvider } from "@/lib/ai/server/providers";

export const maxDuration = 300;

/** Doorgeefluik naar een optionele externe 3D-/plattegrondreconstructieservice */
export async function POST(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof Blob);
    const meta = JSON.parse(String(form.get("meta") ?? "{}"));
    const p = getReconstructionProvider();
    return Response.json({ provider: p.id, result: await p.reconstruct(files, meta) });
  } catch (e) {
    return errorResponse(e);
  }
}
