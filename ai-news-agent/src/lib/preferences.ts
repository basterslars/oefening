import { CATEGORIES, CATEGORY_INTERESTS, type Category, type FeedbackAction, type Settings } from "./types";

// Persoonlijk leersysteem. Bewust transparant in plaats van een black box:
// elke like/opslag/favoriet/'niet interessant' telt op bij de categorie en de
// bronnen van dat item. De som wordt met tanh afgevlakt zodat één klik niet
// alles omgooit en tien klikken niet oneindig doortellen.

const ACTION_WEIGHT: Record<FeedbackAction, number> = { like: 1, save: 1, favorite: 2, dismiss: -2 };

export interface Signal {
  action: FeedbackAction;
  category: Category;
  sourceIds: string[];
  title: string;
}

export interface Preferences {
  /** Bijdrage aan de score per categorie (ongeveer -2.5 … +2.5). */
  categoryBoost: Record<Category, number>;
  /** Bijdrage aan de score per bron (ongeveer -1 … +2). */
  sourceBoost: Record<string, number>;
  /** Geleerde sommen, voor uitleg in de UI. */
  learnedCategory: Record<string, number>;
  learnedSource: Record<string, number>;
  signalCount: number;
}

export function computePreferences(settings: Settings, signals: Signal[]): Preferences {
  const learnedCategory: Record<string, number> = {};
  const learnedSource: Record<string, number> = {};
  for (const s of signals) {
    const w = ACTION_WEIGHT[s.action];
    learnedCategory[s.category] = (learnedCategory[s.category] ?? 0) + w;
    for (const id of s.sourceIds) learnedSource[id] = (learnedSource[id] ?? 0) + w;
  }

  const categoryBoost = {} as Record<Category, number>;
  for (const cat of Object.keys(CATEGORIES) as Category[]) {
    const interests = CATEGORY_INTERESTS[cat];
    // Interesseprioriteit 3 = neutraal, 5 = +1, 1 = -1.
    const interest = interests.length ? Math.max(...interests.map((i) => (settings.interests[i] - 3) * 0.5)) : 0;
    categoryBoost[cat] = round(interest + 1.5 * Math.tanh((learnedCategory[cat] ?? 0) / 4));
  }

  const sourceBoost: Record<string, number> = {};
  const ids = new Set([...Object.keys(learnedSource), ...settings.preferredSources]);
  for (const id of ids) {
    sourceBoost[id] = round((settings.preferredSources.includes(id) ? 1 : 0) + Math.tanh((learnedSource[id] ?? 0) / 4));
  }

  return { categoryBoost, sourceBoost, learnedCategory, learnedSource, signalCount: signals.length };
}

export function prefScorers(p: Preferences) {
  return {
    category: (c: Category) => p.categoryBoost[c] ?? 0,
    source: (id: string) => p.sourceBoost[id] ?? 0,
  };
}

/** Korte tekstuele samenvatting van het profiel voor de AI-prompt. */
export function describePreferences(p: Preferences, settings: Settings): string {
  const cats = (Object.entries(p.categoryBoost) as [Category, number][]).sort((a, b) => b[1] - a[1]);
  const liked = cats.filter(([, v]) => v > 0.25).map(([c]) => CATEGORIES[c]);
  const disliked = cats.filter(([, v]) => v < -0.25).map(([c]) => CATEGORIES[c]);
  const lines = [
    `Interesseprioriteiten (1-5): ${Object.entries(settings.interests).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
    liked.length ? `Meer van: ${liked.join(", ")}.` : "",
    disliked.length ? `Minder van: ${disliked.join(", ")}.` : "",
    `Gebaseerd op ${p.signalCount} feedbacksignalen.`,
  ];
  return lines.filter(Boolean).join(" ");
}

/** Favoriete onderwerpen voor het dashboard. */
export function topTopics(p: Preferences, n = 5): { category: Category; label: string; boost: number }[] {
  return (Object.entries(p.categoryBoost) as [Category, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([category, boost]) => ({ category, label: CATEGORIES[category], boost }));
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
