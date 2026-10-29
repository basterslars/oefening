import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { DesignProposalSchema, FloorPlanAnalysisSchema, PhotoAnalysisSchema } from "@/lib/ai/schemas";

/** Verzamelt alle sleutels in een JSON-schema (recursief) */
function keysOf(o: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(o)) o.forEach((x) => keysOf(x, acc));
  else if (o && typeof o === "object")
    for (const [k, v] of Object.entries(o)) {
      acc.add(k);
      keysOf(v, acc);
    }
  return acc;
}

describe("AI-outputschema's", () => {
  for (const [name, schema] of Object.entries({ PhotoAnalysisSchema, FloorPlanAnalysisSchema, DesignProposalSchema })) {
    it(`${name} levert een strikt object-schema op`, () => {
      const fmt = betaZodOutputFormat(schema) as unknown as { type: string; schema: Record<string, unknown> };
      expect(fmt.type).toBe("json_schema");
      expect(fmt.schema.type).toBe("object");
      expect(fmt.schema.additionalProperties).toBe(false);
      // Geen numerieke/lengte-beperkingen die structured outputs niet afdwingt
      const keys = keysOf(fmt.schema);
      for (const k of ["minimum", "maximum", "minLength", "maxLength", "pattern"]) expect(keys.has(k)).toBe(false);
    });
  }
});
