// Studiecoach (regelgebaseerd, gratis): signaleert risico's en stelt dagdoelen voor.
// De optionele AI-evaluatie (api/coach) krijgt deze cijfers als input.
import { daysBetween, formatMinutes, parseDateKey } from "./utils";
import { WEAK_THRESHOLD } from "./mastery";

export interface CoachCourse {
  id: string;
  name: string;
  examDate: string | null;
  topicCount: number;
  testedCount: number;
  coverageMastery: number; // 0..1, ongeteste onderwerpen tellen als 0
  minutesLast7: number;
  hoursPerWeek: number;
  backlogMinutes: number;
  dueCards: number;
  lastExamPct: number | null;
}

export interface CoachInput {
  today: string;
  courses: CoachCourse[];
  weakTopics: { courseId: string; courseName: string; topicId: string; name: string; mastery: number }[];
  todaySessions: { id: string; courseId: string; title: string; minutes: number; status: string }[];
  todayMinutes: number;
  dailyGoalMinutes: number;
  minutesLast7: number;
  minutesPrev7: number;
  studyDaysLast7: number;
  examScores: { courseName: string; pct: number; date: string }[];
  dueCardsTotal: number;
  infeasibleCourses: string[];
}

export type InsightLevel = "urgent" | "warning" | "info" | "positive";

export interface Insight {
  level: InsightLevel;
  title: string;
  detail: string;
  href?: string;
  action?: string;
}

export interface Priority {
  courseId: string;
  courseName: string;
  score: number;
  reason: string;
}

export interface DailyGoal {
  label: string;
  done: boolean;
  href: string;
}

export function coursePriorities(input: CoachInput): Priority[] {
  const today = parseDateKey(input.today);
  return input.courses
    .map((c) => {
      const days = c.examDate ? daysBetween(today, parseDateKey(c.examDate)) : null;
      const gap = 1 - c.coverageMastery;
      const urgency = days === null ? 0.25 : days <= 0 ? 0 : Math.min(1, 14 / days);
      const behind = c.backlogMinutes > 0 ? 0.15 : 0;
      const score = gap * (0.3 + 0.7 * urgency) + behind;
      const parts: string[] = [];
      if (days !== null && days > 0) parts.push(`tentamen over ${days} dag${days === 1 ? "" : "en"}`);
      if (c.topicCount === 0) parts.push("nog geen onderwerpen bekend");
      else parts.push(`${Math.round(c.coverageMastery * 100)}% beheerst (${c.testedCount}/${c.topicCount} onderwerpen getoetst)`);
      if (c.backlogMinutes > 0) parts.push(`${formatMinutes(c.backlogMinutes)} achterstand`);
      return { courseId: c.id, courseName: c.name, score, reason: parts.join(" · ") };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function buildInsights(input: CoachInput): Insight[] {
  const out: Insight[] = [];
  const today = parseDateKey(input.today);
  for (const c of input.courses) {
    if (!c.examDate) continue;
    const days = daysBetween(today, parseDateKey(c.examDate));
    if (days < 0) continue;
    if (days <= 14 && c.coverageMastery < 0.7) {
      out.push({
        level: days <= 7 ? "urgent" : "warning",
        title: `${c.name}: tentamen over ${days} dag${days === 1 ? "" : "en"}, beheersing ${Math.round(c.coverageMastery * 100)}%`,
        detail:
          c.testedCount < c.topicCount
            ? `${c.topicCount - c.testedCount} van ${c.topicCount} onderwerpen zijn nog nooit getoetst. Je weet dus niet of je ze beheerst. Maak een oefententamen.`
            : "Je scoort onder de 70%. Focus op je zwakste onderwerpen, niet op wat je al kunt.",
        href: `/exams/new?course=${c.id}`,
        action: "Oefententamen",
      });
    } else if (days <= 21) {
      out.push({ level: "info", title: `${c.name}: tentamen op ${c.examDate} (over ${days} dagen)`, detail: `Huidige beheersing ${Math.round(c.coverageMastery * 100)}%.` });
    }
    if (c.backlogMinutes >= 60) {
      out.push({
        level: "warning",
        title: `Achterstand bij ${c.name}: ${formatMinutes(c.backlogMinutes)}`,
        detail: "Geplande sessies zijn niet afgerond. De planning is opnieuw verdeeld; dit gaat ten koste van je buffer vóór het tentamen.",
        href: "/planner",
        action: "Planning",
      });
    }
    const weeklyTarget = c.hoursPerWeek * 60;
    if (weeklyTarget > 0 && c.minutesLast7 < weeklyTarget * 0.5 && c.examDate && days <= 42) {
      out.push({
        level: "warning",
        title: `${c.name}: te weinig studietijd`,
        detail: `Afgelopen 7 dagen ${formatMinutes(c.minutesLast7)} gestudeerd, terwijl je ${c.hoursPerWeek} u/week had ingepland.`,
      });
    }
  }
  for (const name of input.infeasibleCourses) {
    out.push({ level: "urgent", title: `Planning voor ${name} is niet haalbaar`, detail: "Met de opgegeven uren per week red je de geschatte studielast niet. Verhoog je uren of accepteer dat je moet prioriteren.", href: "/planner", action: "Bekijk planning" });
  }
  if (input.weakTopics.length) {
    const list = input.weakTopics.slice(0, 5).map((t) => `${t.name} (${Math.round(t.mastery * 100)}%)`).join(", ");
    out.push({ level: "warning", title: `${input.weakTopics.length} zwak${input.weakTopics.length === 1 ? "" : "ke"} onderwerp${input.weakTopics.length === 1 ? "" : "en"}`, detail: `Onder ${Math.round(WEAK_THRESHOLD * 100)}%: ${list}.`, href: "/progress", action: "Voortgang" });
  }
  if (input.dueCardsTotal >= 30) {
    out.push({ level: "warning", title: `${input.dueCardsTotal} flashcards staan klaar`, detail: "Uitgestelde herhalingen stapelen op en je vergeet sneller. Werk ze vandaag weg.", href: "/flashcards", action: "Oefenen" });
  }
  if (input.studyDaysLast7 <= 2 && input.courses.some((c) => c.examDate)) {
    out.push({ level: "warning", title: `Slechts ${input.studyDaysLast7} studiedag${input.studyDaysLast7 === 1 ? "" : "en"} in de afgelopen week`, detail: "Gespreid leren werkt aantoonbaar beter dan stampen. Kortere sessies op meer dagen zijn effectiever dan één lange sessie." });
  }
  if (input.minutesPrev7 > 0 && input.minutesLast7 < input.minutesPrev7 * 0.6) {
    out.push({ level: "info", title: "Studietijd daalt", detail: `${formatMinutes(input.minutesLast7)} deze week tegenover ${formatMinutes(input.minutesPrev7)} de week ervoor.` });
  }
  const scores = input.examScores;
  if (scores.length >= 2) {
    const [latest, prev] = scores;
    if (latest.pct - prev.pct >= 10) out.push({ level: "positive", title: "Tentamenscore stijgt", detail: `${latest.courseName}: ${Math.round(latest.pct)}% (was ${Math.round(prev.pct)}%).` });
    else if (prev.pct - latest.pct >= 10) out.push({ level: "warning", title: "Tentamenscore daalt", detail: `${latest.courseName}: ${Math.round(latest.pct)}% (was ${Math.round(prev.pct)}%). Kijk in het rapport welke onderwerpen misgingen.` });
  }
  if (input.studyDaysLast7 >= 5 && input.minutesLast7 >= input.dailyGoalMinutes * 4) {
    out.push({ level: "positive", title: "Consistent gestudeerd", detail: `${input.studyDaysLast7} studiedagen en ${formatMinutes(input.minutesLast7)} in de afgelopen week.` });
  }
  const order: Record<InsightLevel, number> = { urgent: 0, warning: 1, info: 2, positive: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export function dailyGoals(input: CoachInput): DailyGoal[] {
  const goals: DailyGoal[] = [];
  for (const s of input.todaySessions.slice(0, 5)) {
    const course = input.courses.find((c) => c.id === s.courseId);
    goals.push({ label: `${course?.name ?? "Vak"}: ${s.title} (${formatMinutes(s.minutes)})`, done: s.status === "done", href: "/planner" });
  }
  if (input.dueCardsTotal > 0) goals.push({ label: `${Math.min(input.dueCardsTotal, 50)} flashcards herhalen`, done: false, href: "/flashcards/review" });
  const weakest = input.weakTopics[0];
  if (weakest) goals.push({ label: `Oefen je zwakste onderwerp: ${weakest.name}`, done: false, href: `/tutor?course=${weakest.courseId}&mode=practice&topic=${encodeURIComponent(weakest.name)}` });
  if (input.dailyGoalMinutes > 0) {
    goals.push({ label: `Studiedoel: ${formatMinutes(input.dailyGoalMinutes)} (nu ${formatMinutes(input.todayMinutes)})`, done: input.todayMinutes >= input.dailyGoalMinutes, href: "/progress" });
  }
  return goals;
}
