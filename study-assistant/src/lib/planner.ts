// Studieplanner: pure, deterministische planning zonder API-aanroepen.
//
// Uitgangspunten (onderbouwing in README → "Didactische keuzes"):
//  • Gespreid leren (distributed practice) en herhalen met toenemende intervallen
//    (1, 3, 7 dagen) i.p.v. alles op het eind stampen.
//  • Oefenen met toetsvragen (retrieval practice) tijdens én aan het eind van de periode.
//  • Onderwerpen die nog niet getoetst of zwak zijn krijgen voorrang en meer tijd.
//  • Herplannen gebeurt vanaf vandaag op basis van de werkelijk gestudeerde tijd,
//    dus achterstand of voorsprong werkt automatisch door in de nieuwe planning.
import { addDays, daysBetween, isoWeekday, parseDateKey, toDateKey } from "./utils";
import type { PlanKind, PlanWarning } from "./types";

export interface PlannerTopic {
  id: string;
  name: string;
  mastery: number;
  attempts: number;
}

export interface PlannerCourse {
  id: string;
  name: string;
  examDate: string | null;
  materialPages: number | null;
  estimatedHours: number | null;
  difficulty: number; // 1..5
  knowledgeLevel: number; // 1..5 (zelfinschatting)
  hoursPerWeek: number;
  studiedMinutes: number; // werkelijk gestudeerd (alle activiteiten)
  topics: PlannerTopic[];
  recentExamScore: number | null; // 0..1, gemiddelde van recente oefententamens
  usedToday?: number; // vandaag al afgeronde geplande minuten (bij herplannen gedurende de dag)
}

export interface PlannerInput {
  today: string; // YYYY-MM-DD
  studyDays: number[]; // ISO-weekdagen
  courses: PlannerCourse[];
  horizonDays?: number; // voor vakken zonder tentamendatum
}

export interface PlannedSession {
  courseId: string;
  date: string;
  minutes: number;
  kind: PlanKind;
  title: string;
  topicId: string | null;
}

export interface CourseEstimate {
  courseId: string;
  totalMinutes: number; // geschatte totale studielast
  requiredMinutes: number; // na correctie voor voorkennis + herhaling
  remainingMinutes: number;
  capacityMinutes: number;
  studyDayCount: number;
  feasible: boolean;
  knowledge: number; // 0..1 gecombineerde kennisschatting
  assumption: string; // hoe de studielast is geschat
}

export interface PlannerOutput {
  sessions: PlannedSession[];
  estimates: CourseEstimate[];
  warnings: PlanWarning[];
}

const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);
export const MIN_PER_PAGE_BY_DIFFICULTY = [0, 4, 5, 6, 8, 10];
const DEFAULT_HOURS = 30;
const REVIEW_OFFSETS = [1, 3, 7];

/** Studielast in minuten + uitleg van de aanname. */
export function estimateWorkload(c: Pick<PlannerCourse, "estimatedHours" | "materialPages" | "difficulty">) {
  if (c.estimatedHours && c.estimatedHours > 0) {
    return { minutes: c.estimatedHours * 60, assumption: `${c.estimatedHours} uur (zelf ingevuld)` };
  }
  const d = Math.min(5, Math.max(1, Math.round(c.difficulty)));
  if (c.materialPages && c.materialPages > 0) {
    const perPage = MIN_PER_PAGE_BY_DIFFICULTY[d];
    return {
      minutes: c.materialPages * perPage,
      assumption: `${c.materialPages} pagina's × ${perPage} min/pagina (moeilijkheid ${d}/5)`,
    };
  }
  return {
    minutes: DEFAULT_HOURS * 60 * (0.6 + d * 0.2),
    assumption: `standaardaanname ${Math.round(DEFAULT_HOURS * (0.6 + d * 0.2))} uur — vul de hoeveelheid materiaal in voor een betere schatting`,
  };
}

/** Kennisschatting 0..1: zelfinschatting, aangevuld met gemeten beheersing en tentamenscores. */
export function estimateKnowledge(c: Pick<PlannerCourse, "knowledgeLevel" | "topics" | "recentExamScore">): number {
  const prior = (Math.min(5, Math.max(1, c.knowledgeLevel)) - 1) / 4;
  const tested = c.topics.filter((t) => t.attempts > 0);
  const parts: [number, number][] = [[prior, 1]];
  if (c.topics.length > 0 && tested.length > 0) {
    // Ongeteste onderwerpen tellen als 0: je weet niet of je ze beheerst.
    const coverageMastery = c.topics.reduce((s, t) => s + (t.attempts > 0 ? t.mastery : 0), 0) / c.topics.length;
    parts.push([coverageMastery, 2]);
  }
  if (c.recentExamScore !== null) parts.push([c.recentExamScore, 2]);
  const w = parts.reduce((s, [, wt]) => s + wt, 0);
  return parts.reduce((s, [v, wt]) => s + v * wt, 0) / w;
}

function studyDates(from: Date, untilExclusive: Date, studyDays: number[]): string[] {
  const out: string[] = [];
  for (let d = new Date(from); d < untilExclusive; d = addDays(d, 1)) {
    if (studyDays.includes(isoWeekday(d))) out.push(toDateKey(d));
  }
  return out;
}

interface Unit {
  topicId: string | null;
  title: string;
  minutes: number;
}

function learningUnits(course: PlannerCourse, learnMinutes: number): Unit[] {
  if (learnMinutes <= 0) return [];
  if (course.topics.length === 0) {
    const parts = Math.max(1, Math.ceil(learnMinutes / 90));
    return Array.from({ length: parts }, (_, i) => ({
      topicId: null,
      title: `Studiemateriaal doorwerken (deel ${i + 1}/${parts})`,
      minutes: learnMinutes / parts,
    }));
  }
  // Prioriteit: ongetest en zwak eerst; beheerste onderwerpen krijgen minder tijd.
  const weight = (t: PlannerTopic) => (t.attempts === 0 ? 1 : Math.max(0.15, 1 - t.mastery * 0.85));
  const sorted = [...course.topics].sort((a, b) => {
    const pa = a.attempts === 0 ? 0.35 : a.mastery;
    const pb = b.attempts === 0 ? 0.35 : b.mastery;
    return pa - pb || a.name.localeCompare(b.name);
  });
  const total = sorted.reduce((s, t) => s + weight(t), 0);
  return sorted.map((t) => ({
    topicId: t.id,
    title: t.attempts > 0 && t.mastery < 0.6 ? `Bijspijkeren: ${t.name}` : `Bestuderen: ${t.name}`,
    minutes: (learnMinutes * weight(t)) / total,
  }));
}

export function planCourse(course: PlannerCourse, input: PlannerInput): { sessions: PlannedSession[]; estimate: CourseEstimate | null; warnings: PlanWarning[] } {
  const warnings: PlanWarning[] = [];
  const today = parseDateKey(input.today);
  const studyDays = input.studyDays.length ? input.studyDays : [1, 2, 3, 4, 5, 6];
  let end: Date;
  if (course.examDate) {
    end = parseDateKey(course.examDate);
    if (daysBetween(today, end) <= 0) {
      warnings.push({ courseId: course.id, courseName: course.name, type: "exam_passed", message: `De tentamendatum van ${course.name} is vandaag of al voorbij; er is niets meer ingepland.` });
      return { sessions: [], estimate: null, warnings };
    }
  } else {
    end = addDays(today, input.horizonDays ?? 28);
    warnings.push({ courseId: course.id, courseName: course.name, type: "no_exam_date", message: `${course.name} heeft geen tentamendatum; er is een planning voor de komende ${input.horizonDays ?? 28} dagen gemaakt op basis van je beschikbare uren.` });
  }
  const dates = studyDates(today, end, studyDays);
  const workload = estimateWorkload(course);
  const knowledge = estimateKnowledge(course);
  // Voorkennis verlaagt de studielast tot max. 60%; +15% voor herhaling en oefentoetsen.
  const required = workload.minutes * (1 - 0.6 * knowledge) * 1.15;
  const remaining = Math.max(0, required - course.studiedMinutes);
  const dayCap = round5((course.hoursPerWeek * 60) / studyDays.length);
  const capacity = dayCap * dates.length;
  const feasible = remaining <= capacity;
  const estimate: CourseEstimate = {
    courseId: course.id,
    totalMinutes: Math.round(workload.minutes),
    requiredMinutes: Math.round(required),
    remainingMinutes: Math.round(remaining),
    capacityMinutes: capacity,
    studyDayCount: dates.length,
    feasible,
    knowledge,
    assumption: workload.assumption,
  };
  if (dates.length === 0 || dayCap < 10) {
    warnings.push({ courseId: course.id, courseName: course.name, type: "infeasible", message: `Voor ${course.name} is geen studietijd beschikbaar vóór het tentamen (controleer studiedagen en uren per week).` });
    return { sessions: [], estimate: { ...estimate, feasible: false }, warnings };
  }
  if (!feasible) {
    const short = Math.ceil((remaining - capacity) / 60);
    const needed = Math.ceil((remaining / dates.length) * studyDays.length / 60);
    warnings.push({
      courseId: course.id,
      courseName: course.name,
      type: "infeasible",
      message: `${course.name}: met ${course.hoursPerWeek} u/week kom je ~${short} uur tekort. Je hebt ongeveer ${needed} u/week nodig, of je moet scherper prioriteren (zwakke onderwerpen eerst).`,
    });
  }
  if (remaining <= 0) {
    // Studielast is gehaald: alleen onderhoud en oefentoetsen.
    const sessions: PlannedSession[] = [];
    const last = dates.slice(-3);
    for (const d of last) {
      sessions.push({ courseId: course.id, date: d, minutes: Math.min(dayCap, 60), kind: d === dates[dates.length - 1] ? "final_review" : "practice", title: d === dates[dates.length - 1] ? "Eindherhaling: zwakke punten + flashcards" : "Oefententamen ter controle", topicId: null });
    }
    return { sessions, estimate, warnings };
  }

  const finalDays = course.examDate ? (dates.length >= 6 ? 2 : dates.length >= 3 ? 1 : 0) : 0;
  const learnDates = dates.slice(0, dates.length - finalDays);
  const finalDates = dates.slice(dates.length - finalDays);
  const daily = Math.min(dayCap, Math.max(Math.min(dayCap, 30), round5(remaining / dates.length + 2.4)));
  const finalMinutes = finalDates.length * daily;
  const learnBudget = Math.max(0, Math.min(remaining, capacity) - finalMinutes);
  const reviewShare = 0.15;
  const units = learningUnits(course, learnBudget * (1 - reviewShare));

  const byDate = new Map<string, PlannedSession[]>();
  const used = new Map<string, number>();
  const add = (s: PlannedSession) => {
    if (s.minutes < 10) return;
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
    used.set(s.date, (used.get(s.date) ?? 0) + s.minutes);
  };
  const reviewMinutes = (unitMinutes: number) => Math.min(30, Math.max(10, round5(unitMinutes * 0.15)));
  const scheduleReviews = (from: string, unit: Unit, total: number) => {
    const base = parseDateKey(from);
    for (const off of REVIEW_OFFSETS) {
      let target = toDateKey(addDays(base, off));
      const idx = learnDates.findIndex((d) => d >= target);
      if (idx < 0) break;
      target = learnDates[idx];
      if ((used.get(target) ?? 0) + reviewMinutes(total) > dayCap) continue;
      add({ courseId: course.id, date: target, minutes: reviewMinutes(total), kind: "review", title: `Herhalen: ${unit.title.replace(/^(Bestuderen|Bijspijkeren): /, "")}`, topicId: unit.topicId });
    }
  };

  let ui = 0;
  let left = units[0]?.minutes ?? 0;
  let finishedSincePractice = 0;
  for (let di = 0; di < learnDates.length && ui < units.length; di++) {
    const date = learnDates[di];
    const pre = date === input.today ? (course.usedToday ?? 0) : 0;
    let budget = Math.min(daily - pre, dayCap - pre - (used.get(date) ?? 0));
    // Elke 5e leerdag een blok oefenvragen over wat al is afgerond (retrieval practice).
    if (di > 0 && di % 5 === 4 && finishedSincePractice > 0 && budget >= 40) {
      add({ courseId: course.id, date, minutes: 30, kind: "practice", title: "Oefenvragen over afgeronde onderwerpen", topicId: null });
      budget -= 30;
      finishedSincePractice = 0;
    }
    while (budget >= 10 && ui < units.length) {
      const unit = units[ui];
      const take = round5(Math.min(budget, left));
      if (take < 10 && left > 10) break;
      const minutes = Math.max(10, take);
      add({ courseId: course.id, date, minutes, kind: "learn", title: unit.title, topicId: unit.topicId });
      budget -= minutes;
      left -= minutes;
      if (left <= 5) {
        scheduleReviews(date, unit, unit.minutes);
        finishedSincePractice++;
        ui++;
        left = units[ui]?.minutes ?? 0;
      }
    }
  }
  if (finalDates.length === 2) {
    add({ courseId: course.id, date: finalDates[0], minutes: Math.min(dayCap, Math.max(daily, 90)), kind: "practice", title: "Oefententamen onder tentamencondities", topicId: null });
  }
  if (finalDates.length >= 1) {
    add({ courseId: course.id, date: finalDates[finalDates.length - 1], minutes: daily, kind: "final_review", title: "Eindherhaling: zwakke onderwerpen + flashcards", topicId: null });
  }
  const sessions = [...byDate.values()].flat().sort((a, b) => a.date.localeCompare(b.date));
  return { sessions, estimate, warnings };
}

export function generatePlan(input: PlannerInput): PlannerOutput {
  const out: PlannerOutput = { sessions: [], estimates: [], warnings: [] };
  for (const c of input.courses) {
    const r = planCourse(c, input);
    out.sessions.push(...r.sessions);
    if (r.estimate) out.estimates.push(r.estimate);
    out.warnings.push(...r.warnings);
  }
  out.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.courseId.localeCompare(b.courseId));
  return out;
}

/** Achterstand: geplande minuten tot en met gisteren die niet zijn afgerond. */
export function backlogMinutes(sessions: { date: string; minutes: number; status: string }[], today: string): number {
  return sessions.filter((s) => s.date < today && s.status === "planned").reduce((n, s) => n + s.minutes, 0);
}
