import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { config } from "../config";

// Dunne laag om de Anthropic SDK. De pipeline praat alleen met `AiClient`, zodat
// tests een nep-client kunnen injecteren en een andere provider later één
// bestand is.

export interface SearchResult {
  url: string;
  title: string;
  pageAge: string | null;
}

export interface AiClient {
  model: string;
  json<T extends z.ZodType>(opts: { system: string; prompt: string; schema: T; maxTokens?: number }): Promise<z.infer<T>>;
  text(opts: { system: string; prompt: string; maxTokens?: number }): Promise<string>;
  webSearch(opts: { prompt: string; domains: string[]; maxUses: number }): Promise<{ text: string; results: SearchResult[] }>;
}

export class AiError extends Error {}

// Bij een weigering door de veiligheidsclassifiers laat de API het verzoek
// server-side opnieuw draaien op een aanbevolen fallback-model.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

function assertUsable(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === "refusal") {
    throw new AiError(`Claude weigerde het verzoek (${msg.stop_details?.category ?? "onbekende categorie"})`);
  }
  if (msg.stop_reason === "max_tokens") {
    throw new AiError("Antwoord afgekapt (max_tokens bereikt)");
  }
}

function textOf(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function createAnthropicClient(): AiClient | null {
  if (!config.anthropicKey) return null;
  const client = new Anthropic({ apiKey: config.anthropicKey, maxRetries: 3, timeout: 10 * 60_000 });
  const model = config.model;

  return {
    model,

    async json({ system, prompt, schema, maxTokens = 32_000 }) {
      // Streaming voorkomt HTTP-timeouts bij lange nieuwsbrieven.
      const stream = client.beta.messages.stream({
        model,
        max_tokens: maxTokens,
        ...FALLBACK,
        output_config: { effort: config.effort, format: betaZodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const msg = await stream.finalMessage();
      assertUsable(msg);
      let parsed: unknown;
      try {
        parsed = JSON.parse(textOf(msg));
      } catch {
        throw new AiError("Claude gaf geen geldige JSON terug");
      }
      const result = schema.safeParse(parsed);
      if (!result.success) throw new AiError(`AI-uitvoer klopt niet met het schema: ${result.error.message.slice(0, 300)}`);
      return result.data;
    },

    async text({ system, prompt, maxTokens = 16_000 }) {
      const stream = client.beta.messages.stream({
        model,
        max_tokens: maxTokens,
        ...FALLBACK,
        output_config: { effort: config.effort },
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const msg = await stream.finalMessage();
      assertUsable(msg);
      return textOf(msg);
    },

    async webSearch({ prompt, domains, maxUses }) {
      const user: Anthropic.Beta.BetaMessageParam = { role: "user", content: prompt };
      let messages: Anthropic.Beta.BetaMessageParam[] = [user];
      const assistantSoFar: Anthropic.Beta.BetaContentBlockParam[] = [];
      const results: SearchResult[] = [];
      let finalText = "";
      // Server tools kunnen pauzeren (stop_reason "pause_turn"); dan sturen we de
      // beurt terug zodat de server verdergaat. Maximaal 3 keer.
      for (let i = 0; i < 4; i++) {
        const msg = await client.beta.messages.create({
          model,
          max_tokens: 16_000,
          ...FALLBACK,
          output_config: { effort: "low" },
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxUses, allowed_domains: domains }],
          messages,
        });
        for (const block of msg.content) {
          if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const r of block.content) results.push({ url: r.url, title: r.title, pageAge: r.page_age ?? null });
          }
        }
        finalText += textOf(msg);
        if (msg.stop_reason !== "pause_turn") {
          assertUsable(msg);
          break;
        }
        assistantSoFar.push(...(msg.content as Anthropic.Beta.BetaContentBlockParam[]));
        messages = [user, { role: "assistant", content: assistantSoFar }];
      }
      return { text: finalText, results };
    },
  };
}
