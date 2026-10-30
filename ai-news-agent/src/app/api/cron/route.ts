import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { jsonError } from "@/lib/api";
import { defaultDeps, runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Voor externe schedulers (GitHub Actions, Vercel Cron, cron-job.org):
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://jouw-app/api/cron
// Maakt een nieuwsbrief als die er voor vandaag nog niet is (idempotent).
async function handle(req: Request) {
  const secret = config.cronSecret;
  if (!secret) return jsonError("CRON_SECRET is niet ingesteld; endpoint uitgeschakeld.", 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return jsonError("Niet geautoriseerd", 401);
  const result = await runPipeline({ trigger: "cron" }, await defaultDeps());
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}

export const GET = handle;
export const POST = handle;
