// Minimale nabootsing van Supabase Auth + PostgREST voor UI-rooktests zonder
// echte Supabase. Alleen voor tests: in-memory testgegevens, eenvoudige filters.
import http from "node:http";

export const USER = { id: "11111111-1111-4111-8111-111111111111", email: "student@uni.nl", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const C1 = "c1000000-0000-4000-8000-000000000001";
const C2 = "c2000000-0000-4000-8000-000000000002";
const uid = USER.id;

export function seed() {
  return {
    profiles: [{ id: uid, display_name: "Sam", study_level: "bachelor", study_days: [1, 2, 3, 4, 5, 6], daily_goal_minutes: 120, plan_generated_on: day(0), plan_warnings: [{ courseId: C1, courseName: "Finance", type: "infeasible", message: "Finance: met 4 u/week kom je ~12 uur tekort." }] }],
    courses: [
      { id: C1, user_id: uid, name: "Finance", description: null, color: "indigo", exam_date: day(9), material_pages: 240, estimated_hours: null, difficulty: 4, knowledge_level: 2, hours_per_week: 4, archived: false, created_at: "2026-09-01T00:00:00Z" },
      { id: C2, user_id: uid, name: "Marketing", description: "Marketingmanagement", color: "teal", exam_date: day(40), material_pages: 120, estimated_hours: null, difficulty: 2, knowledge_level: 3, hours_per_week: 5, archived: false, created_at: "2026-09-01T00:00:00Z" },
    ],
    topics: [
      { id: "t1", user_id: uid, course_id: C1, name: "WACC", mastery: 0.35, attempts: 3, correct: 1, last_studied_at: day(-1) + "T10:00:00Z", source: "ai" },
      { id: "t2", user_id: uid, course_id: C1, name: "Netto contante waarde", mastery: 0.85, attempts: 4, correct: 3.4, last_studied_at: day(-2) + "T10:00:00Z", source: "ai" },
      { id: "t3", user_id: uid, course_id: C1, name: "Optiewaardering", mastery: 0, attempts: 0, correct: 0, last_studied_at: null, source: "ai" },
      { id: "t4", user_id: uid, course_id: C2, name: "Marketingmix", mastery: 0.7, attempts: 2, correct: 1.4, last_studied_at: day(-3) + "T10:00:00Z", source: "ai" },
    ],
    documents: [
      { id: "d1", user_id: uid, course_id: C1, name: "H3 Vermogenskosten.pdf", storage_path: `${uid}/${C1}/d1-h3.pdf`, mime_type: "application/pdf", size_bytes: 120000, file_type: "pdf", category: "boek/hoofdstuk", status: "ready", error: null, page_count: 32, word_count: 11800, chunk_count: 54, summary: "Behandelt de gewogen gemiddelde vermogenskosten (WACC) en het CAPM.", key_terms: [{ term: "WACC", definition: "gewogen gemiddelde vermogenskostenvoet" }, { term: "CAPM" }], topics: ["WACC", "CAPM"], analyzed_by: "ai", created_at: day(-5) + "T10:00:00Z", processed_at: day(-5) + "T10:01:00Z" },
      { id: "d2", user_id: uid, course_id: C1, name: "College 4.pptx", storage_path: `${uid}/${C1}/d2.pptx`, mime_type: null, size_bytes: 900000, file_type: "pptx", category: "collegeslides", status: "error", error: "Bestand niet gevonden in opslag.", page_count: null, word_count: null, chunk_count: null, summary: null, key_terms: [], topics: [], analyzed_by: null, created_at: day(-1) + "T10:00:00Z", processed_at: null },
    ],
    plan_sessions: [
      { id: "p1", user_id: uid, course_id: C1, date: day(0), minutes: 45, kind: "learn", title: "Bijspijkeren: WACC", topic_id: "t1", status: "planned", completed_at: null, created_at: day(0) },
      { id: "p2", user_id: uid, course_id: C2, date: day(0), minutes: 30, kind: "review", title: "Herhalen: Marketingmix", topic_id: "t4", status: "done", completed_at: day(0), created_at: day(0) },
      { id: "p3", user_id: uid, course_id: C1, date: day(1), minutes: 40, kind: "learn", title: "Bestuderen: Optiewaardering", topic_id: "t3", status: "planned", completed_at: null, created_at: day(0) },
      { id: "p4", user_id: uid, course_id: C1, date: day(-2), minutes: 60, kind: "learn", title: "Bestuderen: WACC", topic_id: "t1", status: "planned", completed_at: null, created_at: day(-3) },
    ],
    exams: [
      { id: "e1", user_id: uid, course_id: C1, title: "Finance — oefententamen", settings: { questionCount: 2 }, status: "finished", time_limit_minutes: 30, started_at: day(-2) + "T10:00:00Z", finished_at: day(-2) + "T10:25:00Z", score: 1.5, max_score: 3, created_at: day(-2) + "T10:00:00Z",
        report: { scorePct: 50, score: 1.5, maxScore: 3, answered: 2, total: 2, durationMinutes: 25, perTopic: [{ topic: "WACC", topicId: "t1", score: 0.5, max: 2, pct: 0.25 }, { topic: "Netto contante waarde", topicId: "t2", score: 1, max: 1, pct: 1 }], mistakes: [{ position: 1, topic: "WACC", issue: "Verwart de kostenvoet van eigen vermogen met de WACC." }], weakTopics: ["WACC"], advice: ["WACC: 25%. Bestudeer de bronnen opnieuw."], studySources: [{ document_name: "H3 Vermogenskosten.pdf", location: "p. 4", topic: "WACC" }], verdict: "Onvoldoende." } },
      { id: "e2", user_id: uid, course_id: C1, title: "Finance — WACC", settings: { questionCount: 2 }, status: "in_progress", time_limit_minutes: null, started_at: new Date().toISOString(), finished_at: null, score: null, max_score: null, report: null, created_at: new Date().toISOString() },
    ],
    exam_questions: [
      { id: "q1", user_id: uid, exam_id: "e1", position: 1, type: "open", topic_id: "t1", topic_name: "WACC", difficulty: 2, prompt: "Bereken de WACC als $E=60$, $D=40$, $r_E=10\\%$, $r_D=5\\%$ en $t=25\\%$.", options: null, correct_answer: "7,5%", explanation: "$0{,}6 \\times 10\\% + 0{,}4 \\times 5\\% \\times 0{,}75 = 7{,}5\\%$", rubric: null, sources: [{ id: "x", document_id: "d1", document_name: "H3 Vermogenskosten.pdf", location: "p. 4" }], max_points: 2, user_answer: "8%", points: 0.5, feedback: "Je vergat het belastingvoordeel.", misconception: "Belastingvoordeel vergeten", answered_at: day(-2) + "T10:10:00Z" },
      { id: "q2", user_id: uid, exam_id: "e1", position: 2, type: "mc", topic_id: "t2", topic_name: "Netto contante waarde", difficulty: 1, prompt: "Wanneer is een project aantrekkelijk?", options: ["NCW < 0", "NCW > 0", "IRR < WACC", "Terugverdientijd > 10 jaar"], correct_answer: "B", explanation: "Positieve NCW creëert waarde.", rubric: null, sources: [], max_points: 1, user_answer: "B", points: 1, feedback: "Juist.", misconception: null, answered_at: day(-2) + "T10:20:00Z" },
      { id: "q3", user_id: uid, exam_id: "e2", position: 1, type: "mc", topic_id: "t1", topic_name: "WACC", difficulty: 2, prompt: "Wat gebeurt er met de WACC als de belastingvoet stijgt (overige gelijk)?", options: ["Stijgt", "Daalt", "Blijft gelijk", "Hangt af van de bèta"], correct_answer: "B", explanation: "", rubric: null, sources: [], max_points: 1, user_answer: null, points: null, feedback: null, misconception: null, answered_at: null },
      { id: "q4", user_id: uid, exam_id: "e2", position: 2, type: "case", topic_id: "t1", topic_name: "WACC", difficulty: 3, prompt: "Een bedrijf overweegt meer vreemd vermogen aan te trekken. Bespreek het effect op de WACC.", options: null, correct_answer: "…", explanation: "", rubric: null, sources: [], max_points: 4, user_answer: null, points: null, feedback: null, misconception: null, answered_at: null },
    ],
    flashcards: [
      { id: "f1", user_id: uid, course_id: C1, topic_id: "t1", document_id: "d1", front: "Wat is de WACC?", back: "De gewogen gemiddelde vermogenskostenvoet: $WACC = \\frac{E}{V} r_E + \\frac{D}{V} r_D (1-t)$", card_type: "formule", difficulty: 2, source_location: "H3 Vermogenskosten.pdf, p. 4", origin: "ai", fsrs: null, due: day(-1) + "T08:00:00Z", state: 0, reps: 0, lapses: 0, last_review: null, created_at: day(-3), updated_at: day(-3) },
      { id: "f2", user_id: uid, course_id: C2, topic_id: "t4", document_id: null, front: "Noem de 4 P's", back: "Product, prijs, plaats, promotie", card_type: "begrip", difficulty: 1, source_location: null, origin: "manual", fsrs: { due: day(5) + "T08:00:00Z", stability: 12, difficulty: 4, elapsed_days: 0, scheduled_days: 12, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: day(-7) + "T08:00:00Z" }, due: day(5) + "T08:00:00Z", state: 2, reps: 3, lapses: 0, last_review: day(-7) + "T08:00:00Z", created_at: day(-20), updated_at: day(-7) },
    ],
    chat_sessions: [{ id: "s1", user_id: uid, course_id: C1, mode: "explain", title: "Wat is het verschil tussen WACC en CAPM?", created_at: day(-1), updated_at: day(-1) + "T12:00:00Z" }],
    chat_messages: [
      { id: "m1", user_id: uid, session_id: "s1", role: "user", content: "Wat is het verschil tussen WACC en CAPM?", sources: [], created_at: day(-1) + "T12:00:00Z" },
      { id: "m2", user_id: uid, session_id: "s1", role: "assistant", content: "Goede vraag. Voordat ik het uitleg: wat denk je dat het **CAPM** berekent? [B1]\n\nDe WACC combineert beide vermogensvormen:\n\n$$WACC = \\frac{E}{V} r_E + \\frac{D}{V} r_D (1-t)$$", sources: [{ id: "x", document_id: "d1", document_name: "H3 Vermogenskosten.pdf", location: "p. 4", label: "B1", excerpt: "De WACC is de gewogen gemiddelde vermogenskostenvoet…" }], created_at: day(-1) + "T12:00:05Z" },
    ],
    coach_reviews: [],
    ai_usage: [{ id: "u1", user_id: uid, feature: "tutor_explain", model: "claude-opus-5-5", input_tokens: 4200, output_tokens: 800, cache_read_tokens: 3000, created_at: new Date().toISOString() }],
    flashcard_reviews: [],
    study_sessions: [],
  };
}

const RPC = {
  study_totals: () => [{ course_id: C1, minutes: 610, sessions: 9 }, { course_id: C2, minutes: 180, sessions: 4 }],
  study_daily: () =>
    [-20, -13, -9, -6, -4, -2, -1, 0].map((o, i) => ({ day: day(o), course_id: i % 2 ? C1 : C2, activity: ["tutor", "exam", "flashcards", "planner"][i % 4], minutes: 20 + i * 12 })),
  flashcard_counts: () => [{ course_id: C1, total: 1, due: 1, new_cards: 1 }, { course_id: C2, total: 1, due: 0, new_cards: 0 }],
  search_chunks: () => [{ id: "x", document_id: "d1", document_name: "H3 Vermogenskosten.pdf", course_id: C1, location: "p. 4", heading: null, content: "De WACC is de gewogen gemiddelde vermogenskostenvoet van eigen en vreemd vermogen.", score: 0.03 }],
};

function applyFilters(rows, params) {
  let out = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const neg = raw.startsWith("not.");
    const expr = neg ? raw.slice(4) : raw;
    const [op, ...rest] = expr.split(".");
    const val = rest.join(".");
    const test = (r) => {
      const v = r[key];
      switch (op) {
        case "eq": return String(v) === val;
        case "neq": return String(v) !== val;
        case "gt": return v !== null && String(v) > val;
        case "gte": return v !== null && String(v) >= val;
        case "lt": return v !== null && String(v) < val;
        case "lte": return v !== null && String(v) <= val;
        case "is": return val === "null" ? v === null || v === undefined : String(v) === val;
        case "in": return val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")).includes(String(v));
        default: return true;
      }
    };
    out = out.filter((r) => (neg ? !test(r) : test(r)));
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    out = [...out].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (dir === "desc" ? -1 : 1));
  }
  const limit = Number(params.get("limit"));
  if (limit) out = out.slice(0, limit);
  return out;
}

export function startMockSupabase(port = 54329) {
  const db = seed();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let body = "";
    for await (const c of req) body += c;
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return send(200, USER);
    if (url.pathname.startsWith("/auth/v1/")) return send(200, {});
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)/);
    if (rpc) return send(200, RPC[rpc[1]]?.() ?? []);
    const table = url.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
    if (!table) return send(404, { message: "not found" });
    const rows = (db[table] ??= []);
    if (req.method === "GET" || req.method === "HEAD") {
      const out = applyFilters(rows, url.searchParams);
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const headers = { "content-range": `0-${Math.max(0, out.length - 1)}/${out.length}` };
      if (req.method === "HEAD") return send(200, undefined, headers);
      if (single) return out.length ? send(200, out[0], headers) : send(406, { code: "PGRST116", message: "no rows" });
      return send(200, out, headers);
    }
    if (req.method === "POST") {
      const items = [].concat(JSON.parse(body || "[]")).map((r) => ({ id: crypto.randomUUID(), user_id: USER.id, created_at: new Date().toISOString(), ...r }));
      rows.push(...items);
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      return send(201, single ? items[0] : items);
    }
    if (req.method === "PATCH") {
      const patch = JSON.parse(body || "{}");
      const hit = applyFilters(rows, url.searchParams);
      hit.forEach((r) => Object.assign(r, patch));
      return send(200, hit);
    }
    if (req.method === "DELETE") {
      const hit = new Set(applyFilters(rows, url.searchParams));
      db[table] = rows.filter((r) => !hit.has(r));
      return send(200, [...hit]);
    }
    send(405, {});
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, db })));
}
