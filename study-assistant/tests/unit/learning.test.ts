import { describe, expect, it } from "vitest";
import { cardMastery, newCardFields, previewIntervals, reviewCard } from "@/lib/srs";
import { updateMastery, masteryLabel } from "@/lib/mastery";
import { buildReport, gradeLocally, numbersMatch, parseNumber } from "@/lib/exam";
import type { ExamQuestion } from "@/lib/types";

describe("FSRS", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  it("plant 'opnieuw' korter dan 'makkelijk'", () => {
    const c = newCardFields(now);
    const again = reviewCard(c.fsrs, 1, now);
    const easy = reviewCard(c.fsrs, 4, now);
    expect(new Date(again.due).getTime()).toBeLessThan(new Date(easy.due).getTime());
    expect(easy.reps).toBe(1);
  });
  it("intervallen groeien bij herhaald 'goed'", () => {
    let state = newCardFields(now).fsrs;
    let t = now;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = reviewCard(state, 3, t);
      intervals.push(r.intervalDays);
      state = r.fsrs;
      t = new Date(r.due);
    }
    expect(intervals[4]).toBeGreaterThan(intervals[2]);
    expect(cardMastery(state, 2).value).toBeGreaterThan(0.4);
  });
  it("haalt de herhaling naar vóór het tentamen", () => {
    const c = newCardFields(now);
    const cap = new Date("2026-11-02T08:00:00Z");
    let r = reviewCard(c.fsrs, 4, now, cap);
    r = reviewCard(r.fsrs, 4, new Date(r.due), new Date("2026-11-03T08:00:00Z"));
    expect(new Date(r.due).getTime()).toBeLessThanOrEqual(new Date("2026-11-03T08:00:00Z").getTime());
  });
  it("geeft intervalvoorbeelden", () => {
    const p = previewIntervals(null, now);
    expect(Object.keys(p)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("beheersing", () => {
  it("eerste tentamenmeting telt volledig, daarna voortschrijdend", () => {
    let m = updateMastery({ mastery: 0, attempts: 0, correct: 0 }, 1);
    expect(m.mastery).toBe(1);
    m = updateMastery(m, 0);
    expect(m.mastery).toBeCloseTo(0.5);
    expect(masteryLabel(m.mastery, m.attempts)).toBe("zwak");
    expect(masteryLabel(0, 0)).toBe("onbekend");
  });
  it("flashcards wegen minder zwaar", () => {
    const m = updateMastery({ mastery: 0, attempts: 0, correct: 0 }, 1, 0.5);
    expect(m.mastery).toBeCloseTo(0.5);
  });
});

describe("tentamenbeoordeling", () => {
  it("leest getallen in NL- en EN-notatie", () => {
    expect(parseNumber("€ 1.250,50")).toBe(1250.5);
    expect(parseNumber("1,250,000")).toBe(1250000);
    expect(parseNumber("12.5%")).toBe(12.5);
    expect(parseNumber("-3,2")).toBe(-3.2);
    expect(parseNumber("geen")).toBeNull();
    expect(numbersMatch("WACC = 8,4%", "8.43")).toBe(true);
    expect(numbersMatch("100", "103")).toBe(false);
  });
  it("beoordeelt meerkeuze lokaal en laat open vragen aan AI", () => {
    const mc = { type: "mc" as const, correct_answer: "B", max_points: 1, options: ["x", "y", "z", "w"] };
    expect(gradeLocally(mc, "B")!.points).toBe(1);
    expect(gradeLocally(mc, "A")!.feedback).toContain("B: y");
    expect(gradeLocally({ type: "open", correct_answer: "...", max_points: 2, options: null }, "mijn antwoord")).toBeNull();
    expect(gradeLocally({ type: "open", correct_answer: "...", max_points: 2, options: null }, "  ")!.points).toBe(0);
  });
  it("bouwt een rapport met zwakke onderwerpen en studiebronnen", () => {
    const q = (pos: number, topic: string, points: number, answered = true): ExamQuestion => ({
      id: String(pos), exam_id: "e", position: pos, type: pos % 2 ? "mc" : "open", topic_id: null, topic_name: topic, difficulty: 2,
      prompt: "?", options: null, correct_answer: "A", explanation: null, rubric: null,
      sources: [{ id: "c" + pos, document_id: "d", document_name: "H1.pdf", location: `p. ${pos}` }],
      max_points: 1, user_answer: answered ? "x" : null, points, feedback: "fout", misconception: points < 1 ? "verwart WACC met kostenvoet EV" : null, answered_at: answered ? "2026-11-01T10:05:00Z" : null,
    });
    const r = buildReport([q(1, "WACC", 0), q(2, "WACC", 0, false), q(3, "NCW", 1), q(4, "NCW", 1)], "2026-11-01T10:00:00Z", "2026-11-01T10:30:00Z");
    expect(r.scorePct).toBe(50);
    expect(r.weakTopics).toEqual(["WACC"]);
    expect(r.perTopic[0].topic).toBe("WACC");
    expect(r.mistakes).toHaveLength(2);
    expect(r.studySources.map((s) => s.location)).toEqual(["p. 1", "p. 2"]);
    expect(r.durationMinutes).toBe(30);
    expect(r.verdict).toMatch(/Onvoldoende/);
    expect(r.answered).toBe(3);
  });
});
