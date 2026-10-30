// End-to-end rooktest van de belangrijkste workflow.
// Gebruik: start de app (npm run build && npm start) en draai
//   BASE_URL=http://localhost:3000 node tests/e2e/smoke.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "test-results";
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const step = (s) => console.log("•", s);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

step("dashboard");
await page.goto(BASE);
await page.getByRole("heading", { name: "Vastgoedprojecten" }).waitFor();
await shot("01-dashboard-leeg");

step("wizard");
await page.getByRole("button", { name: /Eerste woning toevoegen|Nieuwe woning/ }).first().click();
await page.getByPlaceholder(/Keizersgracht/).fill("Testwoning Prinsengracht 1");
await page.getByRole("button", { name: "Volgende" }).click();
await page.getByLabel("Lengte").first().fill("6");
await page.getByLabel("Breedte").first().fill("4,5");
await page.getByRole("button", { name: "Ruimte toevoegen" }).click();
await page.getByLabel("Naam ruimte").nth(1).fill("Slaapkamer");
await page.getByLabel("Lengte").nth(1).fill("3,5");
await page.getByLabel("Breedte").nth(1).fill("3");
await page.getByRole("button", { name: "Volgende" }).click();
await page.getByRole("button", { name: "Volgende" }).click();
await page.getByRole("button", { name: /B · Handmatig tekenen/ }).click();
await shot("02-wizard-methode");
await page.getByRole("button", { name: "Project aanmaken" }).click();
await page.getByTestId("plan-svg").waitFor();
await page.waitForTimeout(500);
await shot("03-editor-2d");

const svg = page.getByTestId("plan-svg");
const box = await svg.boundingBox();

step("muur tekenen");
await page.getByTestId("tool-wall").click();
await page.mouse.click(box.x + 120, box.y + box.height - 120);
await page.mouse.click(box.x + 400, box.y + box.height - 120);
await page.keyboard.press("Escape");
const wallCount = await page.locator('[data-testid="plan-svg"] polygon').count();

step("deur plaatsen op een kamermuur");
await page.getByTestId("tool-door").click();
// zoek het midden van de bovenste muur van de eerste kamer via de DOM
const roomPoly = page.locator('[data-testid="plan-svg"] polygon').first();
const rb = await roomPoly.boundingBox();
await page.mouse.move(rb.x + rb.width / 2, rb.y + 2);
await page.mouse.click(rb.x + rb.width / 2, rb.y + 2);
await page.getByText(/^Deur$/).first().waitFor({ timeout: 3000 }).catch(() => {});

step("meubels toevoegen");
await page.getByTestId("tool-select").click();
await page.getByRole("button", { name: "Meubels" }).click();
await page.getByTestId("catalog-sofa-3").click();
await page.getByTestId("catalog-coffee-table").click();
await page.getByTestId("catalog-plant-large").click();
await page.waitForTimeout(300);
const items = await page.getByTestId("item-footprint").count();
await shot("04-editor-ingericht");

step("3D-weergave");
await page.getByRole("button", { name: "3D", exact: true }).click();
await page.locator("canvas").first().waitFor();
await page.waitForTimeout(2500);
await shot("05-3d-rondom");
await page.getByRole("button", { name: "Boven" }).click();
await page.waitForTimeout(1200);
await shot("06-3d-boven");
await page.getByRole("button", { name: "Ooghoogte" }).click();
await page.waitForTimeout(800);
await page.keyboard.down("w");
await page.waitForTimeout(600);
await page.keyboard.up("w");
await shot("07-3d-ooghoogte");
await page.getByRole("button", { name: "Rondom" }).click();
await page.getByRole("button", { name: "Naast elkaar" }).click();
await page.waitForTimeout(1500);
await shot("08-split");

step("voor-en-na en screenshot");
await page.getByRole("button", { name: "Voor & na" }).click();
await page.getByText("Voor-en-na-beeld opgeslagen").waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Screenshot" }).click();
await page.getByText("Screenshot opgeslagen").waitFor({ timeout: 10000 });

step("opslaan en herladen");
await page.locator('[data-testid="save-state"][data-state="saved"]').waitFor({ timeout: 10000 });
const url = page.url();
await page.reload();
await page.getByTestId("plan-svg").waitFor({ timeout: 15000 }).catch(async () => {
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByTestId("plan-svg").waitFor();
});
await page.waitForTimeout(500);
const itemsAfter = await page.getByTestId("item-footprint").count();

step("presentatie + PDF");
await page.getByRole("button", { name: "Presentatie & delen" }).click();
await page.getByText("PDF-presentatie").waitFor();
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: "PDF genereren" }).click()]);
const pdfPath = `${OUT}/presentatie.pdf`;
await dl.saveAs(pdfPath);
await shot("09-presentatie");

step("dashboard met kaart");
await page.goto(BASE);
await page.getByText("Testwoning Prinsengracht 1").first().waitFor();
await shot("10-dashboard");

await browser.close();
const result = { url, wallPolygonsAfterDrawing: wallCount, itemsPlaced: items, itemsAfterReload: itemsAfter, pdfBytes: fs.statSync(pdfPath).size, consoleErrors: errors };
console.log(JSON.stringify(result, null, 2));
if (items < 3 || itemsAfter !== items || errors.length) process.exit(1);
