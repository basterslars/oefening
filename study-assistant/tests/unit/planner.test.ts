import { describe, expect, it } from "vitest";
import { backlogMinutes, estimateKnowledge, estimateWorkload, generatePlan, type PlannerCourse } from "@/lib/planner";
import { buildInsights, coursePriorities, dailyGoals, type CoachInput } from "@/lib/coach";

const base: PlannerCourse = {
  id: "c1", name: "Finance", examDate: "2026-12-14", materialPages: 200, estimatedHours: null, difficulty: 3, knowledgeLevel: 1,
  hoursPerWeek: 10, studiedMinutes: 0, recentExamScore: null,
  topics: [
    { id: "t1", name: "WACC", mastery: 0.3, attempts: 2 },
    { id: "t2", name: "NCW", mastery: 0.9, attempts: 3 },
    { id: "t3", name: "Opties", mastery: 0, attempts: 0 },
  ],
};
const input = { today: "2026-11-02", studyDays: [1, 2, 3, 4, 5, 6], courses: [base] };

describe("planner", () => {
  it("schat studielast uit pagina's en moeilijkheid", () => {
    expect(estimateWorkload(base).minutes).toBe(200 * 6);
    expect(estimateWorkload({ ...base, estimatedHours: 12 }).minutes).toBe(720);
  });
  it("combineert zelfinschatting met gemeten beheersing", () => {
    const k = estimateKnowledge(base);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(0.6);
    expect(estimateKnowledge({ ...base, topics: [], knowledgeLevel: 5 })).toBe(1);
  });
  it("plant alleen op studiedagen, vóór het tentamen, binnen de daglimiet", () => {
    const { sessions, estimates } = generatePlan(input);
    expect(sessions.length).toBeGreaterThan(10);
    const cap = Math.round((10 * 60) / 6 / 5) * 5;
    const perDay = new Map<string, number>();
    for (const s of sessions) {
      expect(s.date >= "2026-11-02" && s.date < "2026-12-14").toBe(true);
      const wd = new Date(s.date + "T12:00:00").getDay();
      expect(wd).not.toBe(0); // geen zondag
      perDay.set(s.date, (perDay.get(s.date) ?? 0) + s.minutes);
    }
    for (const m of perDay.values()) expect(m).toBeLessThanOrEqual(cap);
    expect(estimates[0].feasible).toBe(true);
  });
  it("zet zwakke/ongeteste onderwerpen eerst en plant herhalingen", () => {
    const { sessions } = generatePlan(input);
    const learn = sessions.filter((s) => s.kind === "learn");
    // Aantoonbaar zwak (30%) eerst, dan ongetest, beheerst (90%) als laatste en korter.
    const order = [...new Set(learn.map((s) => s.topicId))];
    expect(order).toEqual(["t1", "t3", "t2"]);
    const minutes = (id: string) => learn.filter((s) => s.topicId === id).reduce((n, s) => n + s.minutes, 0);
    expect(minutes("t2")).toBeLessThan(minutes("t3"));
    expect(sessions.some((s) => s.kind === "review")).toBe(true);
    const last = sessions[sessions.length - 1];
    expect(last.kind).toBe("final_review");
    expect(sessions.some((s) => s.kind === "practice" && s.title.includes("tentamencondities"))).toBe(true);
  });
  it("totaal gepland ≈ resterende studielast", () => {
    const { sessions, estimates } = generatePlan(input);
    const total = sessions.reduce((n, s) => n + s.minutes, 0);
    expect(Math.abs(total - estimates[0].remainingMinutes) / estimates[0].remainingMinutes).toBeLessThan(0.25);
  });
  it("waarschuwt bij onhaalbare planning", () => {
    const out = generatePlan({ ...input, courses: [{ ...base, hoursPerWeek: 1, materialPages: 800, difficulty: 5 }] });
    expect(out.warnings.some((w) => w.type === "infeasible")).toBe(true);
    expect(out.estimates[0].feasible).toBe(false);
  });
  it("gestudeerde tijd verlaagt de resterende planning (herplannen)", () => {
    const a = generatePlan(input).estimates[0].remainingMinutes;
    const b = generatePlan({ ...input, courses: [{ ...base, studiedMinutes: 600 }] }).estimates[0].remainingMinutes;
    expect(a - b).toBe(600);
  });
  it("tentamen voorbij → geen sessies", () => {
    const out = generatePlan({ ...input, courses: [{ ...base, examDate: "2026-11-01" }] });
    expect(out.sessions).toHaveLength(0);
    expect(out.warnings[0].type).toBe("exam_passed");
  });
  it("berekent achterstand", () => {
    expect(backlogMinutes([{ date: "2026-11-01", minutes: 60, status: "planned" }, { date: "2026-11-01", minutes: 30, status: "done" }, { date: "2026-11-02", minutes: 45, status: "planned" }], "2026-11-02")).toBe(60);
  });
});

describe("coach", () => {
  const ci: CoachInput = {
    today: "2026-11-02",
    courses: [
      { id: "c1", name: "Finance", examDate: "2026-11-08", topicCount: 4, testedCount: 1, coverageMastery: 0.2, minutesLast7: 30, hoursPerWeek: 8, backlogMinutes: 90, dueCards: 40, lastExamPct: 45 },
      { id: "c2", name: "Marketing", examDate: "2027-01-20", topicCount: 3, testedCount: 3, coverageMastery: 0.85, minutesLast7: 300, hoursPerWeek: 4, backlogMinutes: 0, dueCards: 0, lastExamPct: 82 },
    ],
    weakTopics: [{ courseId: "c1", courseName: "Finance", topicId: "t1", name: "WACC", mastery: 0.3 }],
    todaySessions: [{ id: "s1", courseId: "c1", title: "Bestuderen: WACC", minutes: 60, status: "planned" }],
    todayMinutes: 20, dailyGoalMinutes: 120, minutesLast7: 330, minutesPrev7: 900, studyDaysLast7: 2,
    examScores: [{ courseName: "Finance", pct: 45, date: "2026-11-01" }, { courseName: "Finance", pct: 60, date: "2026-10-25" }],
    dueCardsTotal: 40, infeasibleCourses: [],
  };
  it("geeft urgente signalen en geen onterechte complimenten", () => {
    const ins = buildInsights(ci);
    expect(ins[0].level).toBe("urgent");
    expect(ins.some((i) => i.title.includes("Achterstand"))).toBe(true);
    expect(ins.some((i) => i.title.includes("daalt"))).toBe(true);
    expect(ins.some((i) => i.level === "positive")).toBe(false);
  });
  it("prioriteert het vak met nabij tentamen en lage beheersing", () => {
    expect(coursePriorities(ci)[0].courseName).toBe("Finance");
  });
  it("stelt concrete dagdoelen voor", () => {
    const g = dailyGoals(ci);
    expect(g[0].label).toContain("WACC");
    expect(g.some((x) => x.label.includes("flashcards"))).toBe(true);
    expect(g.at(-1)!.done).toBe(false);
  });
});
