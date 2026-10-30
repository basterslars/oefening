import "server-only";

// Centrale server-configuratie. Geheime sleutels worden alleen hier (server-side)
// gelezen en nooit naar de browser gestuurd.

const bool = (v: string | undefined, dflt: boolean) => (v === undefined || v === "" ? dflt : /^(1|true|yes|on)$/i.test(v));
const int = (v: string | undefined, dflt: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : dflt;
};

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const effort = (v: string | undefined, dflt: Effort): Effort =>
  (["low", "medium", "high", "xhigh", "max"] as const).includes(v as Effort) ? (v as Effort) : dflt;

export const config = {
  timeZone: process.env.APP_TIMEZONE || "Europe/Amsterdam",
  ai: {
    enabled: Boolean(process.env.ANTHROPIC_API_KEY),
    // Hoofdmodel voor uitleg (AI-docent) en het genereren van tentamenvragen/flashcards.
    modelTutor: process.env.AI_MODEL_TUTOR || "claude-opus-5-5",
    modelGenerate: process.env.AI_MODEL_GENERATE || "claude-opus-5-5",
    // Goedkoper model voor bulktaken: documentanalyse en het nakijken van open vragen.
    modelFast: process.env.AI_MODEL_FAST || "claude-haiku-5-5",
    effortTutor: effort(process.env.AI_EFFORT_TUTOR, "medium"),
    effortGenerate: effort(process.env.AI_EFFORT_GENERATE, "medium"),
    effortFast: effort(process.env.AI_EFFORT_FAST, "low"),
    // Harde limiet op tokens (input + output) per gebruiker per dag, ter bescherming tegen kosten.
    dailyTokenBudget: int(process.env.AI_DAILY_TOKEN_BUDGET, 1_500_000),
    analyzeDocuments: bool(process.env.AI_ANALYZE_DOCUMENTS, true),
    refusalFallbacks: bool(process.env.AI_REFUSAL_FALLBACKS, true),
  },
  embeddings: {
    provider: (process.env.EMBEDDING_PROVIDER || "none") as "none" | "voyage",
    voyageApiKey: process.env.VOYAGE_API_KEY || "",
    voyageModel: process.env.VOYAGE_MODEL || "voyage-3.5",
  },
};

export function embeddingsEnabled() {
  return config.embeddings.provider === "voyage" && Boolean(config.embeddings.voyageApiKey);
}

/** Publieke samenvatting voor de UI (geen geheimen). */
export function publicAiStatus() {
  return {
    aiEnabled: config.ai.enabled,
    models: { tutor: config.ai.modelTutor, generate: config.ai.modelGenerate, fast: config.ai.modelFast },
    dailyTokenBudget: config.ai.dailyTokenBudget,
    analyzeDocuments: config.ai.analyzeDocuments,
    semanticSearch: embeddingsEnabled(),
  };
}

export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
