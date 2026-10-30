import { z } from "zod";
import { CATALOG } from "../catalog";

/**
 * Gestructureerde outputformaten van de AI-modules. Deze worden zowel als
 * output-schema naar het model gestuurd als gebruikt om de respons te valideren.
 */

const confidence = z.enum(["laag", "middel", "hoog"]);

export const PhotoAnalysisSchema = z.object({
  roomType: z.string().describe("Waarschijnlijk type ruimte, bv. woonkamer, keuken, slaapkamer"),
  roomTypeConfidence: confidence,
  furnishing: z.enum(["leeg", "gedeeltelijk", "gemeubileerd"]),
  features: z
    .array(
      z.object({
        type: z.enum(["deur", "raam", "openslaande_deuren", "radiator", "keuken", "trap", "schouw", "inbouwkast", "balkon", "anders"]),
        description: z.string(),
      }),
    )
    .describe("Zichtbare ruimtelijke kenmerken"),
  estimatedDimensions: z.object({
    widthM: z.number().nullable().describe("Geschatte breedte in meters, null als niet te schatten"),
    depthM: z.number().nullable(),
    ceilingHeightM: z.number().nullable(),
    basis: z.string().describe("Waarop de schatting is gebaseerd (bv. standaard deurhoogte 2,1 m als referentie)"),
    confidence,
  }),
  existingFurniture: z.array(z.string()),
  floorMaterial: z.string().nullable(),
  wallColorHex: z.string().nullable().describe("Dominante wandkleur als hex, bv. #f2efe9"),
  lightConditions: z.string(),
  stagingSuggestions: z.array(z.string()).describe("Korte suggesties om deze ruimte aantrekkelijker te presenteren"),
  caveats: z.array(z.string()).describe("Beperkingen van deze analyse"),
});
export type PhotoAnalysis = z.infer<typeof PhotoAnalysisSchema>;

const NormPoint = z.object({ x: z.number(), y: z.number() });

export const FloorPlanAnalysisSchema = z.object({
  walls: z
    .array(z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), exterior: z.boolean() }))
    .describe("Muursegmenten in genormaliseerde beeldcoördinaten (0..1, oorsprong linksboven)"),
  openings: z.array(
    z.object({
      type: z.enum(["door", "window"]),
      x: z.number().describe("Midden van de opening, genormaliseerd 0..1"),
      y: z.number(),
      widthNorm: z.number().describe("Breedte als fractie van de beeldbreedte"),
    }),
  ),
  rooms: z.array(
    z.object({
      name: z.string(),
      polygon: z.array(NormPoint),
      labelledAreaM2: z.number().nullable().describe("Oppervlakte als die op de tekening staat, anders null"),
    }),
  ),
  dimensions: z
    .array(z.object({ text: z.string(), meters: z.number(), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }))
    .describe("Maatvoeringen die op de tekening staan, met de genormaliseerde eindpunten van de maatlijn"),
  confidence,
  caveats: z.array(z.string()),
});
export type FloorPlanAnalysis = z.infer<typeof FloorPlanAnalysisSchema>;

const catalogIds = CATALOG.map((c) => c.id) as [string, ...string[]];
const floorIds = ["oak", "walnut", "herringbone", "concrete", "tiles_light", "tiles_dark", "marble", "carpet"] as const;
const finishIds = ["fabric", "leather", "wood", "metal", "matte", "gloss", "glass"] as const;

export const DesignProposalSchema = z.object({
  summary: z.string().describe("Korte samenvatting in het Nederlands"),
  variants: z.array(
    z.object({
      name: z.string(),
      style: z.string(),
      rationale: z.string(),
      roomFinishes: z.array(z.object({ roomId: z.string(), floor: z.enum(floorIds).nullable(), wallColor: z.string().nullable() })),
      remove: z.array(z.string()).describe("Id's van bestaande objecten die verwijderd moeten worden"),
      recolor: z.array(z.object({ itemId: z.string(), color: z.string(), finish: z.enum(finishIds).nullable() })),
      add: z.array(
        z.object({
          catalogId: z.enum(catalogIds),
          roomId: z.string(),
          x: z.number().describe("Middelpunt in meters (plattegrondcoördinaten)"),
          y: z.number(),
          rotationDeg: z.number().describe("0 = voorkant naar +y (naar beneden op de plattegrond); 90 = voorkant naar -x"),
          color: z.string(),
          finish: z.enum(finishIds),
          reason: z.string(),
        }),
      ),
    }),
  ),
  limitations: z.array(z.string()),
});
export type DesignProposal = z.infer<typeof DesignProposalSchema>;

// ---------- Capaciteiten (gedeeld met de client) ----------

export interface AICapabilities {
  vision: { available: boolean; provider: string; model: string | null };
  design: { available: boolean; provider: string; model: string | null };
  staging: { available: boolean; provider: string; model: string | null };
  reconstruction: { available: boolean; provider: string };
}

export interface DesignContext {
  prompt: string;
  variantCount: number;
  selectedRoomId: string | null;
  ceilingHeight: number;
  rooms: { id: string; name: string; areaM2: number; polygon: { x: number; y: number }[]; floor: string; wallColor: string }[];
  walls: { a: { x: number; y: number }; b: { x: number; y: number }; thickness: number }[];
  openings: { type: string; x: number; y: number; width: number }[];
  furniture: { id: string; catalogId: string; name: string; x: number; y: number; rotationDeg: number; w: number; d: number; roomId: string | null }[];
}
