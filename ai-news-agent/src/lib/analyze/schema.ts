import { z } from "zod";
import { CATEGORY_KEYS } from "../types";

// Schema voor de AI-analyse. Belangrijk ontwerpprincipe: het model verwijst
// naar artikelen via hun `id` uit onze eigen database en schrijft zelf GEEN
// URL's of datums. Links en publicatiedatums komen altijd uit de feeds zelf;
// zo kan de nieuwsbrief geen verzonnen bronnen bevatten.
//
// Getalgrenzen (1-10) staan in de beschrijvingen en worden na afloop
// afgedwongen, omdat structured outputs niet alle JSON-schema-constraints
// ondersteunt.

const ids = z.array(z.string()).describe("id's van artikelen uit de kandidatenlijst");

export const AnalysisSchema = z.object({
  headlines: z
    .array(
      z.object({
        article_ids: ids.describe("Alle kandidaat-id's over dit verhaal (dubbele berichten samenvoegen)."),
        title: z.string().describe("Heldere Nederlandse kop, geen clickbait."),
        summary: z.string().describe("Samenvatting, maximaal 100 woorden."),
        what_happened: z.string().describe("Wat is er precies gebeurd? Feitelijk, 1-3 zinnen."),
        why_it_matters: z.string().describe("Waarom is dit belangrijk, specifiek voor de lezer?"),
        category: z.enum(CATEGORY_KEYS as [string, ...string[]]),
        status: z.enum(["confirmed", "rumor", "opinion"]).describe("confirmed = bevestigd door officiële bron of meerdere betrouwbare media; rumor = onbevestigd/lek; opinion = mening of voorspelling."),
        relevance: z.number().int().describe("Inhoudelijk belang 1-10."),
        note: z.string().nullable().describe("Kanttekening (bijv. 'alleen bron is Reddit', 'cijfers niet onafhankelijk geverifieerd'), anders null."),
      }),
    )
    .describe("De belangrijkste ontwikkelingen, gesorteerd op belang."),
  tools: z
    .array(
      z.object({
        name: z.string(),
        what_it_does: z.string(),
        problem_solved: z.string(),
        audience: z.string(),
        website: z.string().nullable().describe("Officiële website als je die zeker weet uit de artikelen, anders null."),
        pricing: z.string().describe("'Gratis', 'Betaald', 'Freemium', 'Open source' of 'Onbekend'."),
        article_ids: ids,
      }),
    )
    .describe("Precies 3 interessante AI-tools, bij voorkeur om software, agents of automatiseringen mee te bouwen."),
  opportunities: z
    .array(
      z.object({
        title: z.string(),
        problem: z.string(),
        audience: z.string(),
        ai_approach: z.string(),
        how_to_sell: z.string().describe("Als SaaS, automatisering of dienst."),
        revenue_model: z.string(),
        build_difficulty: z.number().int().describe("1-10"),
        commercial_potential: z.number().int().describe("1-10"),
        article_ids: ids.describe("Het nieuws waar deze kans uit voortkomt."),
      }),
    )
    .describe("Precies 2 concrete, niet-voor-de-hand-liggende zakelijke kansen die ontstaan door het nieuws van vandaag."),
  development: z.object({
    updates: z.array(
      z.object({
        title: z.string(),
        summary: z.string(),
        kind: z.enum(["claude_code", "coding_agent", "dev_tool", "mcp", "api_model", "github", "open_source"]),
        article_ids: ids,
      }),
    ),
    build_idea: z.object({
      title: z.string(),
      description: z.string(),
      steps: z.array(z.string()).describe("3-6 concrete bouwstappen met Claude Code."),
      why_now: z.string(),
    }),
  }),
  explained: z.object({
    topic: z.string(),
    explanation: z.string().describe("Begrijpelijke uitleg (150-300 woorden) voor iemand die technisch geïnteresseerd is maar geen expert."),
    analogy: z.string().nullable(),
  }),
  big_picture: z.object({
    key_development: z.string(),
    long_term: z.string(),
    takeaway: z.string(),
  }),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
