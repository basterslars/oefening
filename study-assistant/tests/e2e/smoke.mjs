// UI-rooktest: start de echte Next.js-app tegen een nagebootste Supabase en
// bezoekt elke pagina op desktop en mobiel. Controleert: geen serverfouten,
// geen console-fouten, geen horizontale overflow; maakt screenshots.
//   npm run build && npm run test:e2e
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startMockSupabase, USER } from "./mock-supabase.mjs";

// Playwright wordt via require geladen zodat ook een globaal geïnstalleerde versie werkt
const { chromium } = createRequire(import.meta.url)("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "test-results");
fs.mkdirSync(outDir, { recursive: true });
const SUPA_PORT = 54329;
const APP_PORT = 3107;
const base = `http://127.0.0.1:${APP_PORT}`;

const { server } = await startMockSupabase(SUPA_PORT);
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
  cwd: root,
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
const stopApp = () => {
  try {
    process.kill(-app.pid, "SIGTERM");
  } catch {}
};
let appLog = "";
process.on("exit", stopApp);
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));
for (let i = 0; i < 60; i++) {
  try {
    await fetch(`${base}/login`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Sessiecookie zoals @supabase/ssr hem verwacht (projectref = eerste hostlabel)
const b64url = (s) => Buffer.from(s).toString("base64url");
const jwt = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify({ sub: USER.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }))}.sig`;
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER };
const cookie = { name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" };

const PAGES = [
  "/",
  "/courses",
  "/courses/c1000000-0000-4000-8000-000000000001",
  "/courses/c1000000-0000-4000-8000-000000000001?tab=topics",
  "/courses/c1000000-0000-4000-8000-000000000001?tab=search",
  "/courses/c1000000-0000-4000-8000-000000000001?tab=settings",
  "/tutor",
  "/tutor?session=s1",
  "/exams",
  "/exams/new",
  "/exams/e1",
  "/exams/e2",
  "/flashcards?course=c1000000-0000-4000-8000-000000000001",
  "/flashcards/review",
  "/planner",
  "/progress",
  "/coach",
  "/settings",
];

const browser = await chromium.launch();
const failures = [];
for (const [device, viewport] of [["desktop", { width: 1280, height: 860 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  // Niet ingelogd → login
  await page.goto(`${base}/planner`);
  if (!page.url().includes("/login")) failures.push(`${device}: niet-ingelogde gebruiker niet naar /login gestuurd (${page.url()})`);
  await page.screenshot({ path: path.join(outDir, `${device}-login.png`) });

  await ctx.addCookies([cookie]);
  for (const p of PAGES) {
    errors.length = 0;
    const res = await page.goto(base + p, { waitUntil: "networkidle" });
    const status = res?.status() ?? 0;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const text = await page.locator("main").innerText().catch(() => "");
    const name = `${device}${p.replace(/[/?=&]+/g, "-").replace(/-c1000000[^-]*/, "-course")}`;
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
    if (status >= 400) failures.push(`${device} ${p}: HTTP ${status}`);
    if (overflow > 1) failures.push(`${device} ${p}: horizontale overflow ${overflow}px`);
    if (/Application error|Er ging iets mis/.test(text)) failures.push(`${device} ${p}: foutmelding op pagina`);
    const real = errors.filter((e) => !/favicon|Failed to load resource.*(404|406)/.test(e));
    if (real.length) failures.push(`${device} ${p}: console-fouten: ${real.join(" | ").slice(0, 300)}`);
    console.log(`${status < 400 && overflow <= 1 && !real.length ? "✓" : "✗"} ${device} ${p}${real.length ? ` — ${real[0].slice(0, 200)}` : ""}`);
  }

  // Interactie: flashcard draaien en tentamenvraag kiezen
  if (device === "desktop") try {
    await page.goto(`${base}/flashcards/review`);
    await page.getByRole("button", { name: "Toon antwoord" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, "desktop-flashcard-flipped.png") });
    if (!(await page.getByRole("button", { name: /Goed/ }).isEnabled())) failures.push("flashcard: beoordelingsknoppen niet actief na draaien");
    await page.goto(`${base}/exams/e2`);
    await page.getByText("Daalt").click();
    if (!(await page.getByRole("button", { name: "Antwoord nakijken" }).isEnabled())) failures.push("tentamen: nakijkknop niet actief na kiezen");
  } catch (e) {
    failures.push(`interactietest: ${String(e).split("\n")[0]}`);
  }
  await ctx.close();
}
await browser.close();
stopApp();
server.close();
if (/Error:/i.test(appLog)) console.log("\n--- server-log (fouten) ---\n" + appLog.split("\n").filter((l) => /error/i.test(l)).slice(0, 20).join("\n"));
if (failures.length) {
  console.log("\nMislukt:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`\nAlle pagina's OK. Screenshots in ${path.relative(root, outDir)}/`);
