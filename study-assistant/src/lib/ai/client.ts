import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { config, type Effort } from "@/lib/config";
import type { Supabase } from "@/lib/supabase/server";

export class AiError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!config.ai.enabled) throw new AiError("AI is niet geconfigureerd: zet ANTHROPIC_API_KEY in .env.local.", 503);
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return client;
}

// Modellen die server-side refusal-fallbacks ondersteunen (fallbacks: "default").
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"];
// Oudere modellen accepteren geen effort-parameter.
const supportsEffort = (model: string) => !/(haiku-4|sonnet-4-5|claude-3)/.test(model);

function modelParams(model: string, effort: Effort) {
  const useFallback = config.ai.refusalFallbacks && FALLBACK_MODELS.includes(model);
  return {
    model,
    ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    effort: supportsEffort(model) ? effort : undefined,
  };
}

/** Controleert of AI beschikbaar is en of het dagbudget van de gebruiker niet op is. */
export async function assertAiAvailable(supabase: Supabase, userId: string) {
  if (!config.ai.enabled) throw new AiError("AI is niet geconfigureerd: zet ANTHROPIC_API_KEY in .env.local.", 503);
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("ai_usage")
    .select("input_tokens, output_tokens")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());
  if (error) throw new AiError("Kon AI-verbruik niet controleren.", 500);
  const used = (data ?? []).reduce((n, r) => n + r.input_tokens + r.output_tokens, 0);
  if (used >= config.ai.dailyTokenBudget) {
    throw new AiError(
      `Dagbudget voor AI bereikt (${used.toLocaleString("nl-NL")} van ${config.ai.dailyTokenBudget.toLocaleString("nl-NL")} tokens). Morgen weer beschikbaar, of verhoog AI_DAILY_TOKEN_BUDGET.`,
      429,
    );
  }
}

export async function logUsage(
  supabase: Supabase,
  feature: string,
  model: string,
  usage: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
) {
  await supabase.from("ai_usage").insert({
    feature,
    model,
    input_tokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
  });
}

export type SystemBlocks = Anthropic.Beta.BetaTextBlockParam[];

/** Stabiele systeemprompt met cache-breakpoint (goedkoper bij herhaald gebruik). */
export function cachedSystem(text: string): SystemBlocks {
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

function checkStop(stop: string | null | undefined) {
  if (stop === "refusal") throw new AiError("Het model weigerde deze aanvraag. Probeer het anders te formuleren.", 422);
  if (stop === "max_tokens") throw new AiError("Het antwoord was te lang en is afgebroken. Probeer minder vragen of kaarten tegelijk.", 422);
}

/** Gestructureerde uitvoer, gevalideerd tegen een Zod-schema. */
export async function generateStructured<S extends z.ZodType>(opts: {
  supabase: Supabase;
  feature: string;
  model: string;
  effort: Effort;
  system: SystemBlocks | string;
  prompt: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const { effort, ...p } = modelParams(opts.model, opts.effort);
  const response = await anthropic()
    .beta.messages.stream({
      ...p,
      max_tokens: opts.maxTokens ?? 32000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { ...(effort ? { effort } : {}), format: betaZodOutputFormat(opts.schema) },
    })
    .finalMessage()
    .catch(rethrow);
  await logUsage(opts.supabase, opts.feature, response.model, response.usage);
  checkStop(response.stop_reason);
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("Het AI-antwoord was geen geldige JSON. Probeer het opnieuw.", 502);
  }
  const result = opts.schema.safeParse(parsed);
  if (!result.success) throw new AiError("Het AI-antwoord had niet het verwachte formaat. Probeer het opnieuw.", 502);
  return result.data;
}

/** Streaming tekstantwoord (AI-docent). Roept onDone aan met het volledige bericht. */
export function streamChat(opts: {
  model: string;
  effort: Effort;
  system: SystemBlocks;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens?: number;
}) {
  const { effort, ...p } = modelParams(opts.model, opts.effort);
  return anthropic().beta.messages.stream({
    ...p,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: opts.messages,
    ...(effort ? { output_config: { effort } } : {}),
  });
}

function rethrow(e: unknown): never {
  throw toAiError(e);
}

export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError("Ongeldige ANTHROPIC_API_KEY.", 503);
  if (e instanceof Anthropic.RateLimitError) return new AiError("De AI-dienst is tijdelijk overbelast (rate limit). Probeer het zo opnieuw.", 429);
  if (e instanceof Anthropic.NotFoundError) return new AiError("Het geconfigureerde AI-model bestaat niet of is niet beschikbaar voor deze API-key.", 502);
  if (e instanceof Anthropic.BadRequestError) return new AiError(`De AI-aanvraag werd geweigerd: ${e.message}`, 502);
  if (e instanceof Anthropic.APIConnectionError) return new AiError("Geen verbinding met de AI-dienst.", 502);
  if (e instanceof Anthropic.APIError) return new AiError(`AI-fout (${e.status}).`, 502);
  return new AiError(e instanceof Error ? e.message : "Onbekende AI-fout.", 500);
}
