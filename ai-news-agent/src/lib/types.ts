// Domeinmodel van de AI News Agent. Alles wat in de database als JSON wordt
// opgeslagen of tussen server en client gaat, staat hier beschreven.

export const CATEGORIES = {
  models: "Modellen & updates",
  assistants: "Claude, ChatGPT & Gemini",
  agents: "AI-agents",
  coding: "Coding agents & dev tools",
  tools: "AI-tools & software",
  business: "AI in bedrijven & automatisering",
  startups: "Startups & businessmodellen",
  funding: "Investeringen & overnames",
  research: "Onderzoek & doorbraken",
  industry: "Toepassingen (vastgoed, finance, marketing)",
  policy: "Beleid & regelgeving",
  other: "Overig",
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export const INTERESTS = {
  ai_business: "AI-business",
  ai_agents: "AI-agents",
  claude_code: "Claude Code",
  ai_automation: "AI-automatisering",
  software_dev: "Softwareontwikkeling",
  ai_startups: "AI-startups",
  ai_investments: "AI-investeringen",
  new_tools: "Nieuwe AI-tools",
} as const;
export type Interest = keyof typeof INTERESTS;
export const INTEREST_KEYS = Object.keys(INTERESTS) as Interest[];

/** Welke interessegebieden een categorie raakt (voor personalisatie). */
export const CATEGORY_INTERESTS: Record<Category, Interest[]> = {
  models: [],
  assistants: [],
  agents: ["ai_agents"],
  coding: ["claude_code", "software_dev"],
  tools: ["new_tools"],
  business: ["ai_business", "ai_automation"],
  startups: ["ai_startups", "ai_business"],
  funding: ["ai_investments"],
  research: [],
  industry: ["ai_business", "ai_automation"],
  policy: [],
  other: [],
};

/**
 * Betrouwbaarheid van een bron:
 * - official: eigen kanaal van het bedrijf (bevestigt eigen nieuws)
 * - press: gerenommeerde tech-journalistiek met redactie
 * - community: Reddit, Hacker News e.d. (vaak vroeg, maar onbevestigd)
 */
export type SourceTier = "official" | "press" | "community";

export type SourceKind = "rss" | "hackernews" | "websearch";

export interface SourceDef {
  id: string;
  name: string;
  kind: SourceKind;
  tier: SourceTier;
  url?: string;
  /** Algemene feeds (bijv. Hacker News) bevatten ook niet-AI-nieuws. */
  needsAiFilter?: boolean;
  /** Voor web search: domeinen waarbinnen gezocht wordt. */
  domains?: string[];
  defaultEnabled: boolean;
  description: string;
}

/** Een artikel zoals een collector het aanlevert, vóór opslag. */
export interface RawArticle {
  url: string;
  title: string;
  sourceId: string;
  sourceName: string;
  tier: SourceTier;
  publishedAt: string | null; // ISO
  excerpt: string;
  /** Engagement (HN-punten, Reddit-score) als die bekend is. */
  engagement?: number;
}

export interface Article extends RawArticle {
  id: string;
  fetchedAt: string;
  usedInNewsletter: number | null;
}

export type NewsStatus = "confirmed" | "rumor" | "opinion" | "unverified";
export const STATUS_LABELS: Record<NewsStatus, string> = {
  confirmed: "Bevestigd",
  rumor: "Gerucht",
  opinion: "Opinie / voorspelling",
  unverified: "Niet geanalyseerd",
};

export interface SourceRef {
  articleId: string;
  sourceId: string;
  name: string;
  url: string;
  title: string;
  publishedAt: string | null;
  tier: SourceTier;
}

export interface Headline {
  itemId: string;
  title: string;
  summary: string;
  whatHappened: string | null;
  whyItMatters: string | null;
  category: Category;
  status: NewsStatus;
  relevance: number; // 1-10, inhoudelijk belang
  personalScore: number; // relevance + persoonlijke voorkeur, bepaalt volgorde
  publishedAt: string | null;
  sources: SourceRef[];
  note: string | null;
}

export interface ToolPick {
  itemId: string;
  name: string;
  whatItDoes: string;
  problemSolved: string;
  audience: string;
  website: string | null;
  websiteVerified: boolean;
  pricing: string;
  sources: SourceRef[];
}

export interface Opportunity {
  title: string;
  problem: string;
  audience: string;
  aiApproach: string;
  howToSell: string;
  revenueModel: string;
  buildDifficulty: number;
  commercialPotential: number;
  sources: SourceRef[];
}

export interface DevUpdate {
  itemId: string;
  title: string;
  summary: string;
  kind: string;
  sources: SourceRef[];
}

export interface BuildIdea {
  title: string;
  description: string;
  steps: string[];
  whyNow: string;
}

export interface NewsletterContent {
  date: string; // YYYY-MM-DD (lokale datum)
  mode: "ai" | "basic";
  generatedAt: string;
  model: string | null;
  headlines: Headline[];
  tools: ToolPick[] | null;
  opportunities: Opportunity[] | null;
  development: { updates: DevUpdate[]; buildIdea: BuildIdea | null } | null;
  explained: { topic: string; explanation: string; analogy: string | null } | null;
  bigPicture: { keyDevelopment: string; longTerm: string; takeaway: string } | null;
  stats: { collected: number; candidates: number; sourcesOk: number; sourcesFailed: number };
  warnings: string[];
}

export interface NewsletterRow {
  id: number;
  date: string;
  createdAt: string;
  mode: "ai" | "basic";
  content: NewsletterContent;
}

export type FeedbackAction = "like" | "save" | "favorite" | "dismiss";
export const FEEDBACK_ACTIONS: FeedbackAction[] = ["like", "save", "favorite", "dismiss"];

export type NewsletterLength = "short" | "normal" | "long";
export const LENGTH_HEADLINES: Record<NewsletterLength, number> = { short: 5, normal: 7, long: 10 };

export interface Settings {
  deliveryTime: string; // "HH:MM"
  timezone: string;
  length: NewsletterLength;
  lookbackHours: number;
  interests: Record<Interest, number>; // prioriteit 1-5
  enabledSources: Record<string, boolean>;
  preferredSources: string[];
  email: { enabled: boolean; to: string };
}

export interface RunLogEntry {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface RunRow {
  id: number;
  trigger: "schedule" | "manual" | "cron" | "cli";
  status: "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  newsletterId: number | null;
  error: string | null;
  log: RunLogEntry[];
}
