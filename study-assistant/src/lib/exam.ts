// Beoordeling van objectieve vragen (lokaal, zonder API) en het tentamenrapport.
import type { ExamQuestion, ExamReport } from "./types";
import { WEAK_THRESHOLD } from "./mastery";

export const QUESTION_TYPE_LABELS: Record<ExamQuestion["type"], string> = {
  mc: "Meerkeuze",
  open: "Open vraag",
  case: "Casus",
  calculation: "Rekenvraag",
  concept: "Begripsvraag",
  application: "Toepassingsvraag",
};

export const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Haalt een getal uit tekst: "€ 1.250,50", "12.5%", "-3,2" → number. */
export function parseNumber(s: string): number | null {
  const m = s.replace(/\s/g, "").match(/-?[\d.,]+/);
  if (!m) return null;
  let t = m[0];
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Laatste scheidingsteken is het decimaalteken
    t = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "1,5" → decimaal; "1,250" (precies 3 cijfers na enkele komma) → duizendtal
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) && t.split(",").length > 2 ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if ((t.match(/\./g) ?? []).length > 1) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function numbersMatch(expected: string, given: string, relTol = 0.01): boolean {
  const a = parseNumber(expected);
  const b = parseNumber(given);
  if (a === null || b === null) return false;
  if (a === 0) return Math.abs(b) < 1e-6;
  return Math.abs(a - b) / Math.abs(a) <= relTol;
}

export interface LocalGrade {
  points: number;
  feedback: string;
}

/**
 * Lokale beoordeling: meerkeuze altijd; rekenvragen als het eindantwoord numeriek
 * klopt. Retourneert null als een inhoudelijke (AI-)beoordeling nodig is.
 */
export function gradeLocally(q: Pick<ExamQuestion, "type" | "correct_answer" | "max_points" | "options">, answer: string): LocalGrade | null {
  const given = answer.trim();
  if (!given) return { points: 0, feedback: "Geen antwoord gegeven." };
  if (q.type === "mc") {
    const correct = q.correct_answer.trim().toUpperCase().charAt(0);
    const chosen = given.toUpperCase().charAt(0);
    const ok = chosen === correct;
    return {
      points: ok ? q.max_points : 0,
      feedback: ok ? "Juist." : `Onjuist. Het juiste antwoord is ${correct}${q.options?.[LETTERS.indexOf(correct)] ? `: ${q.options[LETTERS.indexOf(correct)]}` : ""}.`,
    };
  }
  if (q.type === "calculation" && numbersMatch(q.correct_answer, given)) {
    return { points: q.max_points, feedback: "Eindantwoord klopt (binnen 1% afwijking)." };
  }
  return null;
}

/** Bouwt het tentamenrapport uit de beoordeelde vragen (volledig lokaal). */
export function buildReport(questions: ExamQuestion[], startedAt: string, finishedAt: string): ExamReport {
  const maxScore = questions.reduce((s, q) => s + Number(q.max_points), 0);
  const score = questions.reduce((s, q) => s + Number(q.points ?? 0), 0);
  const answered = questions.filter((q) => q.answered_at && (q.user_answer ?? "").trim() !== "").length;
  const groups = new Map<string, { topicId: string | null; score: number; max: number }>();
  for (const q of questions) {
    const key = q.topic_name?.trim() || "Algemeen";
    const g = groups.get(key) ?? { topicId: q.topic_id, score: 0, max: 0 };
    g.score += Number(q.points ?? 0);
    g.max += Number(q.max_points);
    groups.set(key, g);
  }
  const perTopic = [...groups.entries()]
    .map(([topic, g]) => ({ topic, topicId: g.topicId, score: g.score, max: g.max, pct: g.max ? g.score / g.max : 0 }))
    .sort((a, b) => a.pct - b.pct);
  const mistakes = questions
    .filter((q) => Number(q.points ?? 0) < Number(q.max_points) * 0.75)
    .map((q) => ({
      position: q.position,
      topic: q.topic_name ?? "Algemeen",
      issue: q.misconception?.trim() || (!q.user_answer?.trim() ? "Niet beantwoord." : (q.feedback ?? "Onvolledig of onjuist antwoord.")),
    }));
  const weakTopics = perTopic.filter((t) => t.pct < WEAK_THRESHOLD).map((t) => t.topic);
  const pctScore = maxScore ? score / maxScore : 0;
  const seen = new Set<string>();
  const studySources: ExamReport["studySources"] = [];
  for (const q of questions) {
    if (Number(q.points ?? 0) >= Number(q.max_points) * 0.75) continue;
    for (const s of q.sources ?? []) {
      const key = `${s.document_name}|${s.location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      studySources.push({ document_name: s.document_name, location: s.location, topic: q.topic_name ?? "Algemeen" });
    }
  }
  const advice: string[] = [];
  if (answered < questions.length) advice.push(`${questions.length - answered} vraag/vragen onbeantwoord. Werk aan tempo: oefen met tijdslimiet.`);
  for (const t of perTopic.filter((t) => t.pct < WEAK_THRESHOLD).slice(0, 4)) {
    advice.push(`${t.topic}: ${Math.round(t.pct * 100)}%. Bestudeer de bronnen hieronder opnieuw en maak daarna gerichte oefenvragen over dit onderwerp.`);
  }
  const typeStats = new Map<string, { s: number; m: number }>();
  for (const q of questions) {
    const t = typeStats.get(q.type) ?? { s: 0, m: 0 };
    t.s += Number(q.points ?? 0);
    t.m += Number(q.max_points);
    typeStats.set(q.type, t);
  }
  for (const [type, t] of typeStats) {
    if (t.m > 0 && t.s / t.m < 0.5 && typeStats.size > 1) {
      advice.push(`Zwak op ${QUESTION_TYPE_LABELS[type as ExamQuestion["type"]].toLowerCase()}en (${Math.round((t.s / t.m) * 100)}%). Oefen dit vraagtype apart.`);
    }
  }
  if (pctScore >= 0.8 && advice.length === 0) advice.push("Sterk resultaat. Verhoog de moeilijkheidsgraad of oefen met toepassingsvragen om te checken of dit standhoudt.");
  const verdict =
    pctScore >= 0.8
      ? "Goed beheerst op dit niveau."
      : pctScore >= 0.55
        ? "Net voldoende tot redelijk, maar kwetsbaar: kleine tegenvallers op het echte tentamen kunnen je onder de grens brengen."
        : "Onvoldoende. Dit niveau is nog niet tentamenklaar; herstudeer de zwakke onderwerpen voordat je opnieuw oefent.";
  const durationMinutes = Math.max(0, (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000);
  return {
    scorePct: Math.round(pctScore * 1000) / 10,
    score: Math.round(score * 100) / 100,
    maxScore,
    answered,
    total: questions.length,
    durationMinutes: Math.round(durationMinutes),
    perTopic,
    mistakes,
    weakTopics,
    advice,
    studySources: studySources.slice(0, 12),
    verdict,
  };
}
