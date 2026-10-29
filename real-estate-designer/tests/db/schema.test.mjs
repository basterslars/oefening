// Test van het Supabase-schema in PGlite (Postgres in WebAssembly), met minimale
// stubs voor de Supabase-schema's auth en storage. Controleert de document-API
// (save_project / project_document), Row Level Security en deellinks.
//   npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const db = new PGlite({ extensions: { pgcrypto } });
// --- Minimale stubs van Supabase (auth, storage, rollen) ---
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create schema storage;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
`);
const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");
for (const f of fs.readdirSync(migrations).sort()) await db.exec(fs.readFileSync(path.join(migrations, f), "utf8"));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant all on all tables in schema storage to authenticated;`);

const as = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const pid = "aaaaaaaa-0000-0000-0000-000000000001";
const doc = {
  id: pid, name: "Testwoning", propertyType: "appartement", address: "Dam 1", status: "concept", furnishing: "leeg", inputMethod: "manual",
  roomCount: 3, totalArea: { value: 80.5, source: "user" }, ceilingHeight: { value: 2.7, source: "user" }, thumbnail: null,
  createdAt: "2026-10-29T10:00:00.000Z", updatedAt: "2026-10-29T11:00:00.000Z", activeVariantId: "var_1", schemaVersion: 1,
  plan: { background: { assetId: "asset_1", pxPerMeter: 100, offset: { x: 0, y: 0 }, opacity: 0.6, widthPx: 1200, heightPx: 800, visible: true },
    walls: [{ id: "wall_1", a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, thickness: 0.12, source: "user" }, { id: "wall_2", a: { x: 6, y: 0 }, b: { x: 6, y: 4 }, thickness: 0.25, height: 2.4, source: "ai_estimate" }],
    openings: [{ id: "door_1", wallId: "wall_1", type: "door", offset: 2, width: 0.9, height: 2.1, sill: 0, swing: -1, source: "user" }],
    rooms: [{ id: "room_1", name: "Woonkamer", polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], floor: "oak", wallColor: "#f4f2ee", source: "traced" }] },
  variants: [{ id: "var_1", name: "Basis", style: "Modern", finishes: { room_1: { floor: "marble" } }, createdAt: "2026-10-29T10:00:00.000Z", updatedAt: "2026-10-29T10:00:00.000Z",
    furniture: [{ id: "obj_1", catalogId: "sofa-3", x: 3, y: 2, rotation: 1.5707963, elevation: 0, color: "#b9b2a6", finish: "fabric", source: "ai_proposal", size: { w: 2, d: 0.9, h: 0.8 } }] }],
  media: [{ id: "asset_1", kind: "floorplan", name: "plan.png", mime: "image/png", size: 1234, width: 1200, height: 800, createdAt: "2026-10-29T10:00:00.000Z" }],
  visualizations: [{ id: "vis_1", kind: "staging", title: "Staging", assetId: "asset_1", beforeAssetId: "asset_1", style: "Modern", origin: "ai_image", favorite: true, createdAt: "2026-10-29T10:00:00.000Z" }],
  analyses: [{ id: "ai_1", kind: "photo", assetId: "asset_1", provider: "anthropic", model: "x", result: { roomType: "woonkamer" }, status: "pending", createdAt: "2026-10-29T10:00:00.000Z" }],
};
const checks = [];
const ok = (name, cond) => { checks.push([name, !!cond]); };

// 1. Opslaan en teruglezen als eigenaar
await as(A, () => db.query("select public.save_project($1::jsonb)", [JSON.stringify(doc)]));
const back = (await as(A, () => db.query("select public.project_document($1::uuid) as d", [pid]))).rows[0].d;
const norm = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v).toISOString() : v)));
const sortKeys = (o) => (Array.isArray(o) ? o.map(sortKeys) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])])) : o);
const expected = sortKeys(norm(doc)), got = sortKeys(norm(back));
ok("roundtrip document identiek", JSON.stringify(expected) === JSON.stringify(got));
if (JSON.stringify(expected) !== JSON.stringify(got)) { console.log("VERWACHT", JSON.stringify(expected)); console.log("KREEG   ", JSON.stringify(got)); }

// 2. Opnieuw opslaan met minder elementen vervangt kindtabellen
const doc2 = structuredClone(doc); doc2.plan.walls = [doc.plan.walls[1]]; doc2.plan.openings = []; doc2.name = "Hernoemd";
await as(A, () => db.query("select public.save_project($1::jsonb)", [JSON.stringify(doc2)]));
const cnt = (await as(A, () => db.query("select count(*)::int as n from public.walls where project_id = $1", [pid]))).rows[0].n;
ok("kindtabellen vervangen bij opslaan", cnt === 1);

// 3. RLS: gebruiker B ziet niets en kan niet overschrijven
const seenByB = (await as(B, () => db.query("select count(*)::int as n from public.projects"))).rows[0].n;
ok("RLS: andere gebruiker ziet project niet", seenByB === 0);
const docB = (await as(B, () => db.query("select public.project_document($1::uuid) as d", [pid]))).rows[0].d;
ok("RLS: project_document leeg voor andere gebruiker", docB === null);
let blocked = false;
try { await as(B, () => db.query("select public.save_project($1::jsonb)", [JSON.stringify({ ...doc, name: "Gekaapt" })])); } catch { blocked = true; }
ok("RLS: andere gebruiker kan niet overschrijven", blocked);
const wallsByB = (await as(B, () => db.query("select count(*)::int as n from public.walls"))).rows[0].n;
ok("RLS: kindtabellen afgeschermd", wallsByB === 0);
let anonBlocked = false;
try { await db.exec("set role anon"); await db.query("select public.save_project($1::jsonb)", [JSON.stringify(doc)]); } catch { anonBlocked = true; } finally { await db.exec("reset role"); }
ok("anon kan niet opslaan", anonBlocked);

// 4. Deellinks
await as(A, () => db.query("insert into public.project_shares (project_id, allow_original_photos) values ($1, false)", [pid]));
const share = (await as(A, () => db.query("select id, token from public.project_shares where project_id = $1", [pid]))).rows[0];
ok("token automatisch gegenereerd (48 hex)", /^[0-9a-f]{48}$/.test(share.token));
let shareBlocked = false;
try { await as(B, () => db.query("insert into public.project_shares (project_id) values ($1)", [pid])); } catch { shareBlocked = true; }
ok("andere gebruiker kan geen deellink maken", shareBlocked);
await db.exec("set role service_role");
let r = (await db.query("select public.resolve_share($1, null) as r", [share.token])).rows[0].r;
ok("resolve_share geeft project", r.status === "ok" && r.project.name === "Hernoemd");
ok("resolve_share filtert originele foto's niet weg als het plattegronden zijn", r.project.media.length === 1);
ok("storagePrefix = owner/project", r.storagePrefix === `${A}/${pid}`);
r = (await db.query("select public.resolve_share('bestaat-niet', null) as r")).rows[0].r;
ok("onbekende token → not_found", r.status === "not_found");
await db.exec("reset role");
await as(A, () => db.query("select public.set_share_passcode($1, '4821')", [share.id]));
await db.exec("set role service_role");
r = (await db.query("select public.resolve_share($1, null) as r", [share.token])).rows[0].r;
ok("toegangscode vereist", r.status === "passcode_required");
r = (await db.query("select public.resolve_share($1, 'fout') as r", [share.token])).rows[0].r;
ok("verkeerde code geweigerd", r.status === "passcode_required");
r = (await db.query("select public.resolve_share($1, '4821') as r", [share.token])).rows[0].r;
ok("juiste code geaccepteerd", r.status === "ok");
await db.exec("reset role");
await as(A, () => db.query("update public.project_shares set enabled = false where id = $1", [share.id]));
await db.exec("set role service_role");
r = (await db.query("select public.resolve_share($1, '4821') as r", [share.token])).rows[0].r;
ok("uitgeschakelde link → not_found", r.status === "not_found");
await db.exec("reset role");
await as(A, () => db.query("update public.project_shares set enabled = true, expires_at = now() - interval '1 day' where id = $1", [share.id]));
await db.exec("set role service_role");
r = (await db.query("select public.resolve_share($1, '4821') as r", [share.token])).rows[0].r;
ok("verlopen link → not_found", r.status === "not_found");
await db.exec("reset role");
let resolveBlocked = false;
try { await as(A, () => db.query("select public.resolve_share($1, null)", [share.token])); } catch { resolveBlocked = true; }
ok("resolve_share niet aanroepbaar door gewone gebruikers", resolveBlocked);

// 5. Verwijderen cascadeert
await as(A, () => db.query("delete from public.projects where id = $1", [pid]));
const left = (await db.query("select (select count(*) from public.walls) + (select count(*) from public.furniture_items) + (select count(*) from public.project_shares) as n")).rows[0].n;
ok("verwijderen cascadeert naar alle kindtabellen", Number(left) === 0);

for (const [n, v] of checks) console.log(v ? "✓" : "✗", n);
process.exit(checks.every(([, v]) => v) ? 0 : 1);
