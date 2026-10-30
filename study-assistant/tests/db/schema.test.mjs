// Test van het Supabase-schema in PGlite (Postgres in WebAssembly) met pgvector en
// minimale stubs voor de Supabase-schema's auth en storage. Controleert profieltrigger,
// Row Level Security, koppeling aan eigen vakken, cascades en hybride zoeken.
//   npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const db = new PGlite({ extensions: { vector } });
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create schema storage;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
`);
const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");
for (const f of fs.readdirSync(migrations).sort()) await db.exec(fs.readFileSync(path.join(migrations, f), "utf8"));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant all on all tables in schema storage to authenticated; grant usage on all sequences in schema storage to authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'a@uni.nl'), ('22222222-2222-2222-2222-222222222222', 'b@uni.nl');`);

const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const as = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const one = async (uid, sql, params = []) => (await as(uid, () => db.query(sql, params))).rows;
const fails = async (uid, sql, params = []) => { try { await as(uid, () => db.query(sql, params)); return false; } catch { return true; } };
const checks = [];
const ok = (name, cond) => checks.push([name, !!cond]);

// 1. Profieltrigger
const profiles = (await db.query("select id, display_name from public.profiles order by id")).rows;
ok("profiel aangemaakt per nieuwe gebruiker", profiles.length === 2 && profiles[0].display_name === "a");

// 2. Vak + document + fragmenten als A
const [course] = await one(A, "insert into public.courses (name, exam_date) values ('Finance', '2026-12-15') returning id");
ok("user_id standaard auth.uid()", (await one(A, "select user_id from public.courses"))[0].user_id === A);
const [doc] = await one(A, "insert into public.documents (course_id, name, storage_path, file_type) values ($1, 'H1.pdf', $2, 'pdf') returning id", [course.id, `${A}/${course.id}/h1.pdf`]);
const emb = (i) => `[${Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0)).join(",")}]`;
await one(A, `insert into public.document_chunks (course_id, document_id, chunk_index, location, content, embedding) values
  ($1, $2, 0, 'p. 1', 'De WACC is de gewogen gemiddelde vermogenskostenvoet van eigen en vreemd vermogen.', $3),
  ($1, $2, 1, 'p. 2', 'Netto contante waarde (NCW) disconteert toekomstige kasstromen tegen de vermogenskostenvoet.', $4),
  ($1, $2, 2, 'p. 3', 'Het CAPM bepaalt het vereiste rendement op eigen vermogen met de beta.', null)`, [course.id, doc.id, emb(0), emb(1)]);

// 3. Hybride zoeken
const fts = await one(A, "select * from public.search_chunks('wacc:* | vermogenskostenvoet:*', $1)", [course.id]);
ok("full-text zoeken vindt fragmenten", fts.length === 2 && fts[0].content.includes("WACC"));
ok("zoekresultaat bevat documentnaam en locatie", fts[0].document_name === "H1.pdf" && fts[0].location === "p. 1");
const vec = await one(A, "select * from public.search_chunks('', $1, $2::extensions.vector, 5)", [course.id, emb(1)]);
ok("vector zoeken (zonder tekstquery) werkt", vec.length >= 1 && vec[0].content.includes("Netto contante waarde"));
const hyb = await one(A, "select * from public.search_chunks('capm:*', $1, $2::extensions.vector, 5)", [course.id, emb(0)]);
ok("hybride: resultaten van beide bronnen gefuseerd", hyb.length === 3 && hyb.slice(0, 2).some((r) => r.content.includes("CAPM")) && hyb.slice(0, 2).some((r) => r.content.includes("WACC")));
const allCourses = await one(A, "select * from public.search_chunks('beta:*')");
ok("zoeken zonder vak doorzoekt alle eigen vakken", allCourses.length === 1);

// 4. RLS
ok("RLS: B ziet vakken van A niet", (await one(B, "select count(*)::int n from public.courses"))[0].n === 0);
ok("RLS: B vindt geen fragmenten van A", (await one(B, "select * from public.search_chunks('wacc:*', $1)", [course.id])).length === 0);
ok("RLS: B kan document niet aan vak van A koppelen", await fails(B, "insert into public.documents (course_id, name, storage_path, file_type) values ($1, 'x', 'x', 'pdf')", [course.id]));
ok("RLS: B kan geen rij namens A invoegen", await fails(B, "insert into public.courses (user_id, name) values ($1, 'x')", [A]));
await one(B, "update public.courses set name = 'Gekaapt' where id = $1", [course.id]);
ok("RLS: B kan vak van A niet wijzigen", (await one(A, "select name from public.courses"))[0].name === "Finance");
ok("anon ziet niets", await (async () => { await db.exec("set role anon"); try { await db.query("select * from public.courses"); return false; } catch { return true; } finally { await db.exec("reset role"); } })());

// 5. Opslagpolicies: alleen in eigen map
ok("storage: upload in eigen map toegestaan", !(await fails(A, "insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${A}/${course.id}/h1.pdf`])));
ok("storage: upload in andermans map geweigerd", await fails(B, "insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${A}/evil.pdf`]));
ok("storage: B kan bestand van A niet lezen", (await one(B, "select count(*)::int n from storage.objects"))[0].n === 0);

// 6. Onderwerpen uniek (hoofdletterongevoelig) en validatie
await one(A, "insert into public.topics (course_id, name) values ($1, 'WACC')", [course.id]);
ok("onderwerp uniek per vak (case-insensitive)", await fails(A, "insert into public.topics (course_id, name) values ($1, 'wacc')", [course.id]));
ok("check-constraint op moeilijkheid", await fails(A, "insert into public.courses (name, difficulty) values ('x', 9)"));

await one(A, "insert into public.flashcards (course_id, front, back) values ($1, 'Wat is WACC?', 'Gewogen vermogenskosten')", [course.id]);

// 7. Aggregaties
await one(A, "insert into public.study_sessions (course_id, activity, minutes, started_at) values ($1, 'tutor', 20, '2026-11-01T23:30:00Z'), ($1, 'exam', 40, '2026-11-01T10:00:00Z')", [course.id]);
await one(B, "insert into public.study_sessions (activity, minutes) values ('other', 99)");
const totals = await one(A, "select * from public.study_totals()");
ok("study_totals telt alleen eigen sessies", totals.length === 1 && totals[0].minutes === 60);
const daily = await one(A, "select * from public.study_daily('2026-10-01', 'Europe/Amsterdam') order by day");
const dayKey = (d) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : String(d));
ok("study_daily groepeert per lokale dag (23:30 UTC = volgende dag in NL)", JSON.stringify(daily.map((d) => [dayKey(d.day), d.activity])) === JSON.stringify([["2026-11-01", "exam"], ["2026-11-02", "tutor"]]));
const fc = await one(A, "select * from public.flashcard_counts()");
ok("flashcard_counts telt kaarten (incl. due/nieuw)", fc.length === 1 && Number(fc[0].due) === 1 && Number(fc[0].new_cards) === 1);

// 8. Cascades
await one(A, "delete from public.courses where id = $1", [course.id]);
const left = await one(A, "select (select count(*) from public.documents)::int d, (select count(*) from public.document_chunks)::int c, (select count(*) from public.flashcards)::int f, (select count(*) from public.topics)::int t");
ok("vak verwijderen verwijdert documenten, fragmenten, kaarten en onderwerpen", Object.values(left[0]).every((n) => n === 0));

let failed = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "✓" : "✗"} ${name}`); if (!pass) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} geslaagd`);
process.exit(failed ? 1 : 0);
