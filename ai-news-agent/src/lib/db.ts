import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config";

// SQLite via de ingebouwde node:sqlite-module (Node ≥ 22.13): geen native
// build-stap, één bestand, eenvoudig te back-uppen. Voor één gebruiker ruim
// voldoende. Wil je naar Postgres, dan hoeft alleen repo.ts te veranderen.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  tier TEXT NOT NULL,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  engagement INTEGER,
  used_in_newsletter INTEGER
);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);

CREATE TABLE IF NOT EXISTS newsletters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  mode TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_newsletters_date ON newsletters(date);

-- Losse nieuwsitems (headlines, tools, dev-updates) zodat je ze kunt liken,
-- opslaan en doorzoeken, los van de nieuwsbrief waarin ze stonden.
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  newsletter_id INTEGER NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  source_ids TEXT NOT NULL,
  url TEXT,
  published_at TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, action)
);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  newsletter_id INTEGER REFERENCES newsletters(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  saved INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  expansion TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  newsletter_id INTEGER,
  error TEXT,
  log TEXT NOT NULL DEFAULT '[]'
);
`;

const g = globalThis as unknown as { __newsDb?: Map<string, DatabaseSync> };

export function getDb(path = config.databasePath): DatabaseSync {
  g.__newsDb ??= new Map();
  const key = path === ":memory:" ? path : resolve(path);
  let db = g.__newsDb.get(key);
  if (!db) {
    if (key !== ":memory:") mkdirSync(dirname(key), { recursive: true });
    db = new DatabaseSync(key);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    db.exec(SCHEMA);
    g.__newsDb.set(key, db);
  }
  return db;
}

/** Alleen voor tests: een verse database in het geheugen. */
export function createMemoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}
