import type { SourceDef } from "../types";

// Alle nieuwsbronnen op één plek. Een nieuwe bron toevoegen = één regel hier
// (RSS/Atom) of een nieuwe collector in src/lib/sources/ met een eigen `kind`.
//
// Waar een bedrijf geen RSS-feed heeft (Anthropic, Meta AI, xAI, Perplexity)
// zoekt de agent via Claude's web search binnen hun eigen domein. Dat vereist
// een ANTHROPIC_API_KEY en kost per zoekopdracht geld (zie README).

export const SOURCES: SourceDef[] = [
  // ── Officiële kanalen ────────────────────────────────────────────────────
  { id: "openai", name: "OpenAI", kind: "rss", tier: "official", url: "https://openai.com/news/rss.xml", defaultEnabled: true, description: "Officieel nieuws van OpenAI" },
  { id: "deepmind", name: "Google DeepMind", kind: "rss", tier: "official", url: "https://deepmind.google/blog/rss.xml", defaultEnabled: true, description: "Blog van Google DeepMind" },
  { id: "google-ai", name: "Google AI (Gemini)", kind: "rss", tier: "official", url: "https://blog.google/technology/ai/rss/", defaultEnabled: true, description: "Google-blog over AI en Gemini" },
  { id: "microsoft-ai", name: "Microsoft AI", kind: "rss", tier: "official", url: "https://blogs.microsoft.com/ai/feed/", defaultEnabled: true, description: "Microsoft AI-blog" },
  { id: "nvidia", name: "NVIDIA", kind: "rss", tier: "official", url: "https://blogs.nvidia.com/feed/", needsAiFilter: true, defaultEnabled: true, description: "NVIDIA-blog (gefilterd op AI)" },
  { id: "huggingface", name: "Hugging Face", kind: "rss", tier: "official", url: "https://huggingface.co/blog/feed.xml", defaultEnabled: true, description: "Hugging Face-blog (open-source modellen)" },
  { id: "claude-code-releases", name: "Claude Code releases", kind: "rss", tier: "official", url: "https://github.com/anthropics/claude-code/releases.atom", defaultEnabled: true, description: "Nieuwe versies van Claude Code (GitHub)" },
  { id: "codex-releases", name: "OpenAI Codex releases", kind: "rss", tier: "official", url: "https://github.com/openai/codex/releases.atom", defaultEnabled: true, description: "Nieuwe versies van Codex CLI (GitHub)" },
  { id: "github-ai", name: "GitHub Blog (AI & ML)", kind: "rss", tier: "official", url: "https://github.blog/ai-and-ml/feed/", defaultEnabled: true, description: "Copilot, coding agents en AI bij GitHub" },
  {
    id: "web-labs", name: "Web search: Anthropic, Meta AI, xAI, Perplexity", kind: "websearch", tier: "official",
    domains: ["anthropic.com", "claude.com", "ai.meta.com", "about.fb.com", "x.ai", "perplexity.ai"],
    defaultEnabled: true, description: "Zoekt via Claude web search op bedrijven zonder RSS-feed (vereist API-key)",
  },

  // ── Journalistiek ────────────────────────────────────────────────────────
  { id: "techcrunch", name: "TechCrunch", kind: "rss", tier: "press", url: "https://techcrunch.com/category/artificial-intelligence/feed/", defaultEnabled: true, description: "TechCrunch, categorie AI" },
  { id: "verge", name: "The Verge", kind: "rss", tier: "press", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", defaultEnabled: true, description: "The Verge, categorie AI" },
  { id: "ars", name: "Ars Technica", kind: "rss", tier: "press", url: "https://arstechnica.com/ai/feed/", defaultEnabled: true, description: "Ars Technica, categorie AI" },
  { id: "mit-tr", name: "MIT Technology Review", kind: "rss", tier: "press", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", defaultEnabled: true, description: "MIT Technology Review, AI" },
  { id: "venturebeat", name: "VentureBeat AI", kind: "rss", tier: "press", url: "https://venturebeat.com/category/ai/feed/", defaultEnabled: true, description: "VentureBeat, AI (sterk op enterprise en funding)" },
  { id: "simonwillison", name: "Simon Willison", kind: "rss", tier: "press", url: "https://simonwillison.net/atom/everything/", needsAiFilter: true, defaultEnabled: true, description: "Onafhankelijke, technisch diepgaande blog over LLM's en coding agents" },

  // ── Community (vroeg, maar onbevestigd) ──────────────────────────────────
  { id: "hackernews", name: "Hacker News", kind: "hackernews", tier: "community", needsAiFilter: true, defaultEnabled: true, description: "Populaire AI-verhalen op Hacker News (≥ 100 punten)" },
  { id: "reddit-localllama", name: "r/LocalLLaMA", kind: "rss", tier: "community", url: "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day", defaultEnabled: true, description: "Open-source modellen en lokale AI" },
  { id: "reddit-claudeai", name: "r/ClaudeAI", kind: "rss", tier: "community", url: "https://www.reddit.com/r/ClaudeAI/top/.rss?t=day", defaultEnabled: true, description: "Claude en Claude Code" },
  { id: "reddit-singularity", name: "r/singularity", kind: "rss", tier: "community", url: "https://www.reddit.com/r/singularity/top/.rss?t=day", defaultEnabled: false, description: "Breed AI-nieuws, veel speculatie" },
  { id: "reddit-ml", name: "r/MachineLearning", kind: "rss", tier: "community", url: "https://www.reddit.com/r/MachineLearning/top/.rss?t=day", defaultEnabled: true, description: "Onderzoek en papers" },
];

export const TIER_LABELS = { official: "Officieel", press: "Journalistiek", community: "Community" } as const;

export function getSource(id: string): SourceDef | undefined {
  return SOURCES.find((s) => s.id === id);
}
