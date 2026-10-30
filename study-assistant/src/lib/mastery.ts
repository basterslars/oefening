// Beheersing per onderwerp als exponentieel voortschrijdend gemiddelde (0..1).
// Eerste metingen tellen zwaar (er is nog weinig bewijs), latere minder, zodat
// één toevallige fout of gok de score niet domineert.

export interface MasteryState {
  mastery: number;
  attempts: number;
  correct: number;
}

/** weight: 1 = tentamenvraag, 0.5 = flashcard (zwakker bewijs van begrip). */
export function updateMastery(prev: MasteryState, score: number, weight = 1): MasteryState {
  const s = Math.min(1, Math.max(0, score));
  const alpha = Math.max(0.2, 1 / (prev.attempts + 1)) * weight;
  const mastery = prev.attempts === 0 && weight >= 1 ? s : prev.mastery + alpha * (s - prev.mastery);
  return {
    mastery: Math.round(Math.min(1, Math.max(0, mastery)) * 1000) / 1000,
    attempts: prev.attempts + 1,
    correct: Math.round((prev.correct + s) * 100) / 100,
  };
}

export const WEAK_THRESHOLD = 0.6;
export const MASTERED_THRESHOLD = 0.8;

export function masteryLabel(mastery: number, attempts: number): "onbekend" | "zwak" | "matig" | "beheerst" {
  if (attempts === 0) return "onbekend";
  if (mastery < WEAK_THRESHOLD) return "zwak";
  if (mastery < MASTERED_THRESHOLD) return "matig";
  return "beheerst";
}
