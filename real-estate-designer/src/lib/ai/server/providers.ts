import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { CATALOG } from "../../catalog";
import {
  DesignProposalSchema,
  FloorPlanAnalysisSchema,
  PhotoAnalysisSchema,
  type AICapabilities,
  type DesignContext,
  type DesignProposal,
  type FloorPlanAnalysis,
  type PhotoAnalysis,
} from "../schemas";

/**
 * Adapter-architectuur voor AI-functionaliteit. Elke capaciteit heeft een
 * eigen interface; de implementatie wordt gekozen op basis van omgevings-
 * variabelen. Ontbreekt een sleutel, dan is de capaciteit 'niet beschikbaar'
 * en toont de UI dat — er worden nooit gesimuleerde resultaten teruggegeven.
 */

export interface ImageInput {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

export interface VisionProvider {
  id: string;
  model: string;
  analyzePhoto(img: ImageInput, hint: string): Promise<PhotoAnalysis>;
  analyzeFloorPlan(img: ImageInput, hint: string): Promise<FloorPlanAnalysis>;
}

export interface DesignProvider {
  id: string;
  model: string;
  proposeDesign(ctx: DesignContext): Promise<DesignProposal>;
}

export interface StagingProvider {
  id: string;
  model: string;
  /** Geeft een nieuwe afbeelding terug; de originele foto wordt niet gewijzigd */
  stage(img: Blob, prompt: string): Promise<{ data: ArrayBuffer; mime: string }>;
}

/** Externe 3D-/plattegrondreconstructie (bv. een gespecialiseerde scanservice) */
export interface ReconstructionProvider {
  id: string;
  reconstruct(files: Blob[], meta: Record<string, unknown>): Promise<unknown>;
}

export class AIUnavailableError extends Error {}
export class AIRefusalError extends Error {}

// ---------------------------------------------------------------- Claude

class ClaudeProvider implements VisionProvider, DesignProvider {
  id = "anthropic";
  private client: Anthropic;
  constructor(
    public model: string,
    private effort: "low" | "medium" | "high" | "xhigh" | "max",
  ) {
    this.client = new Anthropic();
  }

  private async parse<T extends z.ZodType>(schema: T, system: string, content: Anthropic.Beta.BetaContentBlockParam[]): Promise<z.infer<T>> {
    const res = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: this.effort, format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") throw new AIRefusalError("Het AI-model heeft dit verzoek geweigerd.");
    if (res.stop_reason === "max_tokens") throw new Error("Het antwoord van het AI-model was te lang en is afgebroken. Probeer een kleinere vraag.");
    if (!res.parsed_output) throw new Error("Het AI-model gaf geen geldig gestructureerd antwoord.");
    return res.parsed_output as z.infer<T>;
  }

  analyzePhoto(img: ImageInput, hint: string) {
    return this.parse(
      PhotoAnalysisSchema,
      `Je bent een ervaren taxateur en interieurarchitect. Je analyseert een foto van een ruimte in een woning voor vastgoedsoftware.
Wees eerlijk over onzekerheid: één foto geeft geen betrouwbare exacte afmetingen. Geef alleen een maatschatting als er een herkenbare referentie is (deur ±2,1 m hoog en ±0,83 m breed, stopcontact ±0,3 m boven de vloer, aanrecht ±0,9 m hoog, tegels) en noem die referentie in 'basis'. Gebruik null als je het niet kunt schatten. Antwoord in het Nederlands.`,
      [
        { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
        { type: "text", text: `Analyseer deze foto. ${hint}` },
      ],
    );
  }

  analyzeFloorPlan(img: ImageInput, hint: string) {
    return this.parse(
      FloorPlanAnalysisSchema,
      `Je herkent bouwkundige elementen op plattegronden van woningen. Geef muren, deuren, ramen en ruimtes in genormaliseerde beeldcoördinaten (0..1, oorsprong linksboven, x naar rechts, y naar beneden).
Neem maatvoeringen (bijv. "4.20" of "420") die op de tekening staan op in 'dimensions' met de eindpunten van de maatlijn, zodat de schaal bepaald kan worden. Verzin geen maten. Je coördinaten zijn benaderingen; vermeld onzekerheden in 'caveats'. Antwoord in het Nederlands.`,
      [
        { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
        { type: "text", text: `Analyseer deze plattegrond. ${hint}` },
      ],
    );
  }

  proposeDesign(ctx: DesignContext) {
    const catalog = CATALOG.map((c) => ({ id: c.id, name: c.name, category: c.category, w: c.size.w, d: c.size.d, h: c.size.h, layer: c.layer, finishes: c.finishes, tags: c.tags }));
    return this.parse(
      DesignProposalSchema,
      `Je bent een interieurontwerper die virtuele inrichtingsvoorstellen maakt voor makelaars. Je werkt met een 2D-plattegrond in meters (x naar rechts, y naar beneden) en een vaste meubelcatalogus.
Regels:
- Gebruik alleen catalogusitems (catalogId). Plaats meubels binnen de polygoon van de ruimte, niet door muren en niet over deuropeningen. Houd looproutes van ±0,8 m vrij.
- rotationDeg: 0 betekent dat de voorkant (zitkant) naar +y wijst; 90 = naar -x; 180 = naar -y; 270 = naar +x. Banken staan meestal met de rug tegen een muur.
- Wandobjecten (layer "wall") plaats je met hun achterkant tegen een muur.
- Respecteer wat de gebruiker wil behouden: verwijder alleen objecten (remove) als dat gevraagd of logisch is.
- Werk alleen in de geselecteerde ruimte als er een is geselecteerd, tenzij de vraag anders aangeeft.
- Lever precies het gevraagde aantal varianten (variantCount).
- Kleuren als hex. Beschrijf beperkingen eerlijk in 'limitations'. Antwoord in het Nederlands.`,
      [
        {
          type: "text",
          text: `Catalogus:\n${JSON.stringify(catalog)}\n\nWoning en huidige inrichting:\n${JSON.stringify({ ...ctx, prompt: undefined })}\n\nOpdracht van de gebruiker: ${ctx.prompt}`,
        },
      ],
    );
  }
}

// ---------------------------------------------------------------- Beeldgeneratie (staging)

/**
 * OpenAI-compatibel image-edit endpoint (bv. gpt-image-1). Configureerbaar via
 * IMAGE_API_URL zodat ook een compatibele self-hosted of andere dienst kan.
 */
class OpenAIImageProvider implements StagingProvider {
  id = "openai-images";
  constructor(
    public model: string,
    private apiKey: string,
    private url: string,
  ) {}

  async stage(img: Blob, prompt: string) {
    const form = new FormData();
    form.append("model", this.model);
    form.append("image", img, "room.png");
    form.append("prompt", prompt);
    form.append("n", "1");
    const res = await fetch(this.url, { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}` }, body: form });
    if (!res.ok) throw new Error(`Beeldgeneratie mislukt (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = json.data?.[0];
    if (first?.b64_json) return { data: Buffer.from(first.b64_json, "base64").buffer as ArrayBuffer, mime: "image/png" };
    if (first?.url) {
      const r = await fetch(first.url);
      return { data: await r.arrayBuffer(), mime: r.headers.get("content-type") ?? "image/png" };
    }
    throw new Error("Beeldgeneratie gaf geen afbeelding terug.");
  }
}

// ---------------------------------------------------------------- Externe reconstructie

/**
 * Generieke HTTP-adapter: stuurt bestanden naar RECONSTRUCTION_API_URL en
 * verwacht JSON terug in het FloorPlan-formaat van deze applicatie
 * (zie docs/architecture.md). Zo kan later een gespecialiseerde dienst worden
 * aangesloten zonder de rest van de app te wijzigen.
 */
class HttpReconstructionProvider implements ReconstructionProvider {
  id = "http";
  constructor(
    private url: string,
    private apiKey?: string,
  ) {}
  async reconstruct(files: Blob[], meta: Record<string, unknown>) {
    const form = new FormData();
    files.forEach((f, i) => form.append("files", f, `file-${i}`));
    form.append("meta", JSON.stringify(meta));
    const res = await fetch(this.url, { method: "POST", body: form, headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {} });
    if (!res.ok) throw new Error(`Reconstructieservice gaf fout ${res.status}`);
    return res.json();
  }
}

// ---------------------------------------------------------------- Registry

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

function claude() {
  if ((process.env.AI_PROVIDER ?? "anthropic") !== "anthropic") return null;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const effort = (EFFORTS as readonly string[]).includes(process.env.AI_EFFORT ?? "") ? (process.env.AI_EFFORT as (typeof EFFORTS)[number]) : "medium";
  return new ClaudeProvider(process.env.ANTHROPIC_MODEL || "claude-opus-5-5", effort);
}

export function getVisionProvider(): VisionProvider {
  const p = claude();
  if (!p) throw new AIUnavailableError("Beeldanalyse is niet geconfigureerd. Stel ANTHROPIC_API_KEY in (zie .env.example).");
  return p;
}

export function getDesignProvider(): DesignProvider {
  const p = claude();
  if (!p) throw new AIUnavailableError("De AI-ontwerpassistent is niet geconfigureerd. Stel ANTHROPIC_API_KEY in (zie .env.example).");
  return p;
}

export function getStagingProvider(): StagingProvider {
  if (process.env.IMAGE_PROVIDER === "openai" && process.env.IMAGE_API_KEY) {
    return new OpenAIImageProvider(process.env.IMAGE_MODEL || "gpt-image-1", process.env.IMAGE_API_KEY, process.env.IMAGE_API_URL || "https://api.openai.com/v1/images/edits");
  }
  throw new AIUnavailableError("AI-beeldgeneratie voor virtuele staging is niet geconfigureerd. Stel IMAGE_PROVIDER en IMAGE_API_KEY in (zie .env.example).");
}

export function getReconstructionProvider(): ReconstructionProvider {
  if (process.env.RECONSTRUCTION_API_URL) return new HttpReconstructionProvider(process.env.RECONSTRUCTION_API_URL, process.env.RECONSTRUCTION_API_KEY);
  throw new AIUnavailableError("Er is geen externe reconstructieservice geconfigureerd.");
}

export function capabilities(): AICapabilities {
  const c = claude();
  let staging: AICapabilities["staging"] = { available: false, provider: "none", model: null };
  try {
    const s = getStagingProvider();
    staging = { available: true, provider: s.id, model: s.model };
  } catch {}
  return {
    vision: { available: !!c, provider: c ? c.id : "none", model: c?.model ?? null },
    design: { available: !!c, provider: c ? c.id : "none", model: c?.model ?? null },
    staging,
    reconstruction: { available: !!process.env.RECONSTRUCTION_API_URL, provider: process.env.RECONSTRUCTION_API_URL ? "http" : "none" },
  };
}
