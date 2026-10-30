// Spaced repetition met FSRS (Free Spaced Repetition Scheduler, via ts-fsrs).
// FSRS modelleert per kaart stabiliteit en moeilijkheid en plant de volgende
// herhaling op het moment dat de kans op onthouden tot ~90% is gedaald. In de
// open-source srs-benchmark presteert FSRS beter dan het klassieke SM-2 (Anki).
import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";

const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true });

export type StoredCard = Record<string, unknown>;

function serialize(card: Card): StoredCard {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

function deserialize(stored: StoredCard | null | undefined, now: Date): Card {
  if (!stored) return createEmptyCard(now);
  const c = stored as unknown as Card & { due: string; last_review?: string | null };
  return {
    ...c,
    due: new Date(c.due),
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  } as Card;
}

export function newCardFields(now = new Date()) {
  const card = createEmptyCard(now);
  return { fsrs: serialize(card), due: card.due.toISOString(), state: card.state, reps: 0, lapses: 0 };
}

export interface ReviewResult {
  fsrs: StoredCard;
  due: string;
  state: number;
  reps: number;
  lapses: number;
  last_review: string;
  intervalDays: number;
}

/** Verwerkt een beoordeling (1 = opnieuw, 2 = moeilijk, 3 = goed, 4 = makkelijk). */
export function reviewCard(stored: StoredCard | null, rating: 1 | 2 | 3 | 4, now = new Date(), capDue?: Date): ReviewResult {
  const card = deserialize(stored, now);
  const { card: next } = scheduler.next(card, now, rating as Grade);
  // Ligt de volgende herhaling na het tentamen, haal hem dan naar voren.
  if (capDue && next.due > capDue && capDue > now) next.due = capDue;
  return {
    fsrs: serialize(next),
    due: next.due.toISOString(),
    state: next.state,
    reps: next.reps,
    lapses: next.lapses,
    last_review: now.toISOString(),
    intervalDays: (next.due.getTime() - now.getTime()) / 86_400_000,
  };
}

/** Voorbeeld van het volgende interval per knop, voor in de UI. */
export function previewIntervals(stored: StoredCard | null, now = new Date()): Record<1 | 2 | 3 | 4, string> {
  const card = deserialize(stored, now);
  const preview = scheduler.repeat(card, now);
  const fmt = (d: Date) => {
    const min = (d.getTime() - now.getTime()) / 60_000;
    if (min < 60) return `${Math.max(1, Math.round(min))} min`;
    if (min < 60 * 24) return `${Math.round(min / 60)} u`;
    const days = min / 1440;
    if (days < 31) return `${Math.round(days)} d`;
    return `${Math.round(days / 30)} mnd`;
  };
  return {
    1: fmt(preview[Rating.Again].card.due),
    2: fmt(preview[Rating.Hard].card.due),
    3: fmt(preview[Rating.Good].card.due),
    4: fmt(preview[Rating.Easy].card.due),
  };
}

/** Beheersingsniveau van een kaart, afgeleid van FSRS-toestand en stabiliteit. */
export function cardMastery(stored: StoredCard | null, state: number): { label: string; value: number } {
  if (state === State.New || !stored) return { label: "Nieuw", value: 0 };
  if (state === State.Learning || state === State.Relearning) return { label: "Lerend", value: 0.25 };
  const stability = Number((stored as { stability?: number }).stability ?? 0);
  const value = Math.min(1, 0.4 + 0.6 * Math.min(1, stability / 30));
  if (stability < 7) return { label: "Matig", value };
  if (stability < 21) return { label: "Goed", value };
  return { label: "Sterk", value };
}

/** Score 0..1 die een flashcard-beoordeling bijdraagt aan onderwerpsbeheersing. */
export const RATING_SCORE: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0.6, 3: 0.85, 4: 1 };
