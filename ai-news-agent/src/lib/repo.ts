import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { getDb } from "./db";
import { SOURCES } from "./sources/registry";
import { articleId, normalizeUrl } from "./text";
import {
  INTEREST_KEYS,
  type Article,
  type Category,
  type FeedbackAction,
  type NewsletterContent,
  type NewsletterRow,
  type Opportunity,
  type RawArticle,
  type RunLogEntry,
  type RunRow,
  type Settings,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  deliveryTime: "07:00",
  timezone: "Europe/Amsterdam",
  length: "normal",
  lookbackHours: 24,
  // De opgegeven interessegebieden starten op hoge prioriteit (4 van 5).
  interests: Object.fromEntries(INTEREST_KEYS.map((k) => [k, 4])) as Settings["interests"],
  enabledSources: Object.fromEntries(SOURCES.map((s) => [s.id, s.defaultEnabled])),
  preferredSources: [],
  email: { enabled: false, to: "" },
};

export interface ItemRow {
  id: string;
  newsletterId: number;
  kind: "headline" | "tool" | "dev";
  title: string;
  summary: string;
  category: Category;
  sourceIds: string[];
  url: string | null;
  publishedAt: string | null;
  data: unknown;
  createdAt: string;
  feedback: FeedbackAction[];
}

export interface OpportunityRow {
  id: number;
  newsletterId: number | null;
  date: string;
  title: string;
  data: Opportunity;
  saved: boolean;
  notes: string;
  expansion: string | null;
  createdAt: string;
}

type Row = Record<string, SQLInputValue>;

export class Repo {
  constructor(readonly db: DatabaseSync = getDb()) {}

  // ── Instellingen ─────────────────────────────────────────────────────────
  getSettings(): Settings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'settings'").get() as Row | undefined;
    const stored = row ? (JSON.parse(String(row.value)) as Partial<Settings>) : {};
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      interests: { ...DEFAULT_SETTINGS.interests, ...stored.interests },
      enabledSources: { ...DEFAULT_SETTINGS.enabledSources, ...stored.enabledSources },
      email: { ...DEFAULT_SETTINGS.email, ...stored.email },
    };
  }

  saveSettings(settings: Settings): void {
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(settings));
  }

  // ── Artikelen ────────────────────────────────────────────────────────────
  /** Slaat nieuwe artikelen op; bestaande (zelfde genormaliseerde URL) blijven ongewijzigd. */
  upsertArticles(raw: RawArticle[], fetchedAt: string): { inserted: number } {
    const stmt = this.db.prepare(
      `INSERT INTO articles (id, url, title, source_id, source_name, tier, published_at, fetched_at, excerpt, engagement)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET engagement = MAX(COALESCE(articles.engagement, 0), COALESCE(excluded.engagement, 0))`,
    );
    let inserted = 0;
    const before = this.countArticles();
    this.db.exec("BEGIN");
    try {
      for (const a of raw) {
        stmt.run(articleId(a.url), normalizeUrl(a.url), a.title, a.sourceId, a.sourceName, a.tier, a.publishedAt, fetchedAt, a.excerpt, a.engagement ?? null);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    inserted = this.countArticles() - before;
    return { inserted };
  }

  countArticles(sinceIso?: string): number {
    const row = sinceIso
      ? (this.db.prepare("SELECT COUNT(*) AS n FROM articles WHERE fetched_at >= ?").get(sinceIso) as Row)
      : (this.db.prepare("SELECT COUNT(*) AS n FROM articles").get() as Row);
    return Number(row.n);
  }

  /**
   * Artikelen gepubliceerd na `sinceIso` die nog in geen nieuwsbrief stonden.
   * `reuseFrom`: nieuwsbrieven die opnieuw gegenereerd worden, hun artikelen tellen weer mee.
   */
  candidateArticlesSince(sinceIso: string, reuseFrom: number[] = []): Article[] {
    const reuse = reuseFrom.length ? ` OR used_in_newsletter IN (${reuseFrom.map(() => "?").join(",")})` : "";
    const rows = this.db
      .prepare(`SELECT * FROM articles WHERE published_at >= ? AND (used_in_newsletter IS NULL${reuse}) ORDER BY published_at DESC`)
      .all(sinceIso, ...reuseFrom) as Row[];
    return rows.map(toArticle);
  }

  markArticlesUsed(ids: string[], newsletterId: number): void {
    const stmt = this.db.prepare("UPDATE articles SET used_in_newsletter = ? WHERE id = ?");
    for (const id of ids) stmt.run(newsletterId, id);
  }

  // ── Nieuwsbrieven ────────────────────────────────────────────────────────
  insertNewsletter(content: NewsletterContent): number {
    const res = this.db
      .prepare("INSERT INTO newsletters (date, created_at, mode, content) VALUES (?, ?, ?, ?)")
      .run(content.date, content.generatedAt, content.mode, JSON.stringify(content));
    return Number(res.lastInsertRowid);
  }

  getNewsletter(id: number): NewsletterRow | null {
    const row = this.db.prepare("SELECT * FROM newsletters WHERE id = ?").get(id) as Row | undefined;
    return row ? toNewsletter(row) : null;
  }

  latestNewsletter(): NewsletterRow | null {
    const row = this.db.prepare("SELECT * FROM newsletters ORDER BY id DESC LIMIT 1").get() as Row | undefined;
    return row ? toNewsletter(row) : null;
  }

  newsletterForDate(date: string): NewsletterRow | null {
    const row = this.db.prepare("SELECT * FROM newsletters WHERE date = ? ORDER BY id DESC LIMIT 1").get(date) as Row | undefined;
    return row ? toNewsletter(row) : null;
  }

  listNewsletters(limit = 60): { id: number; date: string; mode: string; createdAt: string; headlineCount: number; top: string | null }[] {
    const rows = this.db.prepare("SELECT * FROM newsletters ORDER BY id DESC LIMIT ?").all(limit) as Row[];
    return rows.map((r) => {
      const n = toNewsletter(r);
      return { id: n.id, date: n.date, mode: n.mode, createdAt: n.createdAt, headlineCount: n.content.headlines.length, top: n.content.headlines[0]?.title ?? null };
    });
  }

  /** Titels van artikelen die al in recente nieuwsbrieven stonden (om herhaling van verhalen te voorkomen). */
  recentlyUsedTitles(sinceIso: string, excludeNewsletters: number[] = []): string[] {
    const ex = excludeNewsletters.length ? ` AND n.id NOT IN (${excludeNewsletters.map(() => "?").join(",")})` : "";
    const rows = this.db
      .prepare(`SELECT a.title FROM articles a JOIN newsletters n ON n.id = a.used_in_newsletter WHERE n.created_at >= ?${ex}`)
      .all(sinceIso, ...excludeNewsletters) as Row[];
    return rows.map((r) => String(r.title));
  }

  newsletterIdsForDate(date: string): number[] {
    return (this.db.prepare("SELECT id FROM newsletters WHERE date = ?").all(date) as Row[]).map((r) => Number(r.id));
  }

  // ── Items ────────────────────────────────────────────────────────────────
  insertItem(item: Omit<ItemRow, "feedback">): void {
    this.db
      .prepare(
        `INSERT INTO items (id, newsletter_id, kind, title, summary, category, source_ids, url, published_at, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(item.id, item.newsletterId, item.kind, item.title, item.summary, item.category, JSON.stringify(item.sourceIds), item.url, item.publishedAt, JSON.stringify(item.data), item.createdAt);
  }

  getItem(id: string): ItemRow | null {
    const row = this.db.prepare("SELECT * FROM items WHERE id = ?").get(id) as Row | undefined;
    return row ? this.withFeedback([toItem(row)])[0] : null;
  }

  searchItems(opts: { q?: string; category?: string; action?: FeedbackAction | "any"; limit?: number }): ItemRow[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (opts.q) {
      where.push("(i.title LIKE ? OR i.summary LIKE ?)");
      params.push(`%${opts.q}%`, `%${opts.q}%`);
    }
    if (opts.category) {
      where.push("i.category = ?");
      params.push(opts.category);
    }
    if (opts.action === "any") where.push("EXISTS (SELECT 1 FROM feedback f WHERE f.item_id = i.id AND f.action IN ('save','favorite','like'))");
    else if (opts.action) {
      where.push("EXISTS (SELECT 1 FROM feedback f WHERE f.item_id = i.id AND f.action = ?)");
      params.push(opts.action);
    }
    const sql = `SELECT i.* FROM items i ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY i.created_at DESC LIMIT ?`;
    params.push(opts.limit ?? 200);
    return this.withFeedback((this.db.prepare(sql).all(...params) as Row[]).map(toItem));
  }

  private withFeedback(items: ItemRow[]): ItemRow[] {
    if (items.length === 0) return items;
    const map = this.feedbackFor(items.map((i) => i.id));
    return items.map((i) => ({ ...i, feedback: map[i.id] ?? [] }));
  }

  // ── Feedback ─────────────────────────────────────────────────────────────
  setFeedback(itemId: string, action: FeedbackAction, on: boolean): void {
    if (on) {
      this.db.prepare("INSERT OR IGNORE INTO feedback (item_id, action, created_at) VALUES (?, ?, ?)").run(itemId, action, new Date().toISOString());
      // 'Niet interessant' en positieve signalen sluiten elkaar uit.
      if (action === "dismiss") this.db.prepare("DELETE FROM feedback WHERE item_id = ? AND action IN ('like','favorite')").run(itemId);
      if (action === "like" || action === "favorite") this.db.prepare("DELETE FROM feedback WHERE item_id = ? AND action = 'dismiss'").run(itemId);
    } else {
      this.db.prepare("DELETE FROM feedback WHERE item_id = ? AND action = ?").run(itemId, action);
    }
  }

  feedbackFor(itemIds: string[]): Record<string, FeedbackAction[]> {
    const out: Record<string, FeedbackAction[]> = {};
    if (itemIds.length === 0) return out;
    const rows = this.db
      .prepare(`SELECT item_id, action FROM feedback WHERE item_id IN (${itemIds.map(() => "?").join(",")})`)
      .all(...itemIds) as Row[];
    for (const r of rows) (out[String(r.item_id)] ??= []).push(String(r.action) as FeedbackAction);
    return out;
  }

  /** Alle feedback met de categorie en bronnen van het item, voor het leersysteem. */
  feedbackSignals(): { action: FeedbackAction; category: Category; sourceIds: string[]; title: string }[] {
    const rows = this.db
      .prepare("SELECT f.action, i.category, i.source_ids, i.title FROM feedback f JOIN items i ON i.id = f.item_id")
      .all() as Row[];
    return rows.map((r) => ({
      action: String(r.action) as FeedbackAction,
      category: String(r.category) as Category,
      sourceIds: JSON.parse(String(r.source_ids)) as string[],
      title: String(r.title),
    }));
  }

  // ── Zakelijke kansen ─────────────────────────────────────────────────────
  insertOpportunity(newsletterId: number, date: string, data: Opportunity): number {
    const res = this.db
      .prepare("INSERT INTO opportunities (newsletter_id, date, title, data, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(newsletterId, date, data.title, JSON.stringify(data), new Date().toISOString());
    return Number(res.lastInsertRowid);
  }

  listOpportunities(opts: { savedOnly?: boolean; q?: string } = {}): OpportunityRow[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (opts.savedOnly) where.push("saved = 1");
    if (opts.q) {
      where.push("(title LIKE ? OR data LIKE ? OR notes LIKE ?)");
      params.push(`%${opts.q}%`, `%${opts.q}%`, `%${opts.q}%`);
    }
    const sql = `SELECT * FROM opportunities ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 300`;
    return (this.db.prepare(sql).all(...params) as Row[]).map(toOpportunity);
  }

  getOpportunity(id: number): OpportunityRow | null {
    const row = this.db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id) as Row | undefined;
    return row ? toOpportunity(row) : null;
  }

  opportunitiesForNewsletter(newsletterId: number): OpportunityRow[] {
    return (this.db.prepare("SELECT * FROM opportunities WHERE newsletter_id = ? ORDER BY id").all(newsletterId) as Row[]).map(toOpportunity);
  }

  updateOpportunity(id: number, patch: { saved?: boolean; notes?: string; expansion?: string }): void {
    if (patch.saved !== undefined) this.db.prepare("UPDATE opportunities SET saved = ? WHERE id = ?").run(patch.saved ? 1 : 0, id);
    if (patch.notes !== undefined) this.db.prepare("UPDATE opportunities SET notes = ? WHERE id = ?").run(patch.notes, id);
    if (patch.expansion !== undefined) this.db.prepare("UPDATE opportunities SET expansion = ? WHERE id = ?").run(patch.expansion, id);
  }

  // ── Runs (logging + vergrendeling) ───────────────────────────────────────
  /** Start een run, tenzij er al één loopt (jonger dan 30 min). */
  startRun(trigger: RunRow["trigger"]): number | null {
    const now = new Date();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const running = this.db
        .prepare("SELECT id FROM runs WHERE status = 'running' AND started_at >= ?")
        .get(new Date(now.getTime() - 30 * 60e3).toISOString()) as Row | undefined;
      if (running) {
        this.db.exec("ROLLBACK");
        return null;
      }
      // Hangende runs (proces gecrasht) netjes afsluiten.
      this.db.prepare("UPDATE runs SET status = 'failed', error = 'Afgebroken (time-out)', finished_at = ? WHERE status = 'running'").run(now.toISOString());
      const res = this.db.prepare("INSERT INTO runs (trigger, status, started_at) VALUES (?, 'running', ?)").run(trigger, now.toISOString());
      this.db.exec("COMMIT");
      return Number(res.lastInsertRowid);
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  appendRunLog(runId: number, entry: RunLogEntry): void {
    this.db.prepare("UPDATE runs SET log = json_insert(log, '$[#]', json(?)) WHERE id = ?").run(JSON.stringify(entry), runId);
  }

  finishRun(runId: number, result: { status: "success" | "failed"; newsletterId?: number | null; error?: string | null }): void {
    this.db
      .prepare("UPDATE runs SET status = ?, finished_at = ?, newsletter_id = ?, error = ? WHERE id = ?")
      .run(result.status, new Date().toISOString(), result.newsletterId ?? null, result.error ?? null, runId);
  }

  listRuns(limit = 20): RunRow[] {
    return (this.db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit) as Row[]).map(toRun);
  }

  runsSince(sinceIso: string, trigger?: RunRow["trigger"]): RunRow[] {
    const rows = trigger
      ? this.db.prepare("SELECT * FROM runs WHERE started_at >= ? AND trigger = ? ORDER BY id DESC").all(sinceIso, trigger)
      : this.db.prepare("SELECT * FROM runs WHERE started_at >= ? ORDER BY id DESC").all(sinceIso);
    return (rows as Row[]).map(toRun);
  }
}

function toArticle(r: Row): Article {
  return {
    id: String(r.id),
    url: String(r.url),
    title: String(r.title),
    sourceId: String(r.source_id),
    sourceName: String(r.source_name),
    tier: String(r.tier) as Article["tier"],
    publishedAt: r.published_at == null ? null : String(r.published_at),
    fetchedAt: String(r.fetched_at),
    excerpt: String(r.excerpt ?? ""),
    engagement: r.engagement == null ? undefined : Number(r.engagement),
    usedInNewsletter: r.used_in_newsletter == null ? null : Number(r.used_in_newsletter),
  };
}

function toNewsletter(r: Row): NewsletterRow {
  return { id: Number(r.id), date: String(r.date), createdAt: String(r.created_at), mode: String(r.mode) as "ai" | "basic", content: JSON.parse(String(r.content)) };
}

function toItem(r: Row): ItemRow {
  return {
    id: String(r.id),
    newsletterId: Number(r.newsletter_id),
    kind: String(r.kind) as ItemRow["kind"],
    title: String(r.title),
    summary: String(r.summary),
    category: String(r.category) as Category,
    sourceIds: JSON.parse(String(r.source_ids)),
    url: r.url == null ? null : String(r.url),
    publishedAt: r.published_at == null ? null : String(r.published_at),
    data: JSON.parse(String(r.data)),
    createdAt: String(r.created_at),
    feedback: [],
  };
}

function toOpportunity(r: Row): OpportunityRow {
  return {
    id: Number(r.id),
    newsletterId: r.newsletter_id == null ? null : Number(r.newsletter_id),
    date: String(r.date),
    title: String(r.title),
    data: JSON.parse(String(r.data)),
    saved: Number(r.saved) === 1,
    notes: String(r.notes ?? ""),
    expansion: r.expansion == null ? null : String(r.expansion),
    createdAt: String(r.created_at),
  };
}

function toRun(r: Row): RunRow {
  return {
    id: Number(r.id),
    trigger: String(r.trigger) as RunRow["trigger"],
    status: String(r.status) as RunRow["status"],
    startedAt: String(r.started_at),
    finishedAt: r.finished_at == null ? null : String(r.finished_at),
    newsletterId: r.newsletter_id == null ? null : Number(r.newsletter_id),
    error: r.error == null ? null : String(r.error),
    log: JSON.parse(String(r.log ?? "[]")),
  };
}
