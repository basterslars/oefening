// E2E: methode A — PDF-plattegrond uploaden, schaal kalibreren, overtrekken,
// ruimte tekenen, meubel plaatsen en in 3D verslepen.
//   BASE_URL=http://localhost:3000 node tests/e2e/floorplan.mjs
// De fixture (tests/e2e/fixtures/plattegrond.pdf) is een plattegrond van 1200×800 px
// op 100 px/m, met een maatlijn van 6,00 m en een buitenmuur van 9 m.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const FIXTURE = process.env.FIXTURE ?? new URL("./fixtures/plattegrond.pdf", import.meta.url).pathname;
const OUT = process.env.OUT_DIR ?? "test-results";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const step = (s) => console.log("•", s);

step("wizard met PDF-plattegrond");
await page.goto(`${BASE}/projects/new`);
await page.getByPlaceholder(/Keizersgracht/).fill("Plattegrondtest");
await page.getByRole("button", { name: "Volgende" }).click();
await page.getByRole("button", { name: "Volgende" }).click();
await page.locator('input[type=file][accept*="pdf"]').setInputFiles(FIXTURE);
await page.getByRole("button", { name: "Volgende" }).click();
await page.getByRole("button", { name: /A · Plattegrond overtrekken/ }).click();
await page.getByRole("button", { name: "Project aanmaken" }).click();
await page.getByTestId("plan-svg").waitFor({ timeout: 30000 });
await page.getByText("nog niet op schaal").waitFor();
const img = page.locator('[data-testid="plan-svg"] image');
await img.waitFor();
const at = async (fx, fy) => {
  const b = await img.boundingBox();
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
};

step("schaal kalibreren op maatlijn van 6 m");
let p1 = await at(150 / 1200, 90 / 800);
let p2 = await at(750 / 1200, 90 / 800);
await page.mouse.click(p1.x, p1.y);
await page.mouse.click(p2.x, p2.y);
await page.getByLabel("Werkelijke afstand (meter)").fill("6");
await page.getByRole("button", { name: "Schaal toepassen" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/fp-01-gekalibreerd.png` });

step("buitenmuur van 9 m overtrekken");
await page.getByTestId("tool-wall").click();
p1 = await at(150 / 1200, 150 / 800);
p2 = await at(1050 / 1200, 150 / 800);
await page.mouse.click(p1.x, p1.y);
await page.mouse.click(p2.x, p2.y);
await page.keyboard.press("Escape");
await page.getByTestId("tool-select").click();
const mid = await at(600 / 1200, 150 / 800);
await page.mouse.click(mid.x, mid.y);
const len = parseFloat((await page.getByLabel("Lengte muur").inputValue()).replace(",", "."));
const badge = await page.getByText("Overgetrokken").first().isVisible();

step("ruimte tekenen en bank plaatsen");
await page.getByTestId("tool-room").click();
p1 = await at(150 / 1200, 150 / 800);
p2 = await at(750 / 1200, 550 / 800);
await page.mouse.move(p1.x, p1.y);
await page.mouse.down();
await page.mouse.move(p2.x, p2.y, { steps: 8 });
await page.mouse.up();
const roomArea = await page.getByText(/^2[34],\d m²$/).first().textContent().catch(() => null);
await page.getByRole("button", { name: "Meubels" }).click();
await page.getByTestId("catalog-sofa-3").click();
const fp = page.getByTestId("item-footprint").first();
const before = await fp.boundingBox();

step("bank verslepen in 3D (bovenaanzicht)");
await page.getByRole("button", { name: "Naast elkaar" }).click();
await page.getByRole("button", { name: "Boven" }).click();
await page.waitForTimeout(2000);
const canvas = page.locator("canvas").first();
const cb = await canvas.boundingBox();
// Zoek de bank: scan een raster en kijk wanneer de selectie verandert
let grabbed = false;
for (let gy = 0.3; gy <= 0.7 && !grabbed; gy += 0.05) {
  for (let gx = 0.3; gx <= 0.7 && !grabbed; gx += 0.05) {
    await page.mouse.click(cb.x + cb.width * gx, cb.y + cb.height * gy);
    if (await page.getByText("Driezitsbank").first().isVisible().catch(() => false)) {
      await page.mouse.move(cb.x + cb.width * gx, cb.y + cb.height * gy);
      await page.mouse.down();
      await page.mouse.move(cb.x + cb.width * gx + 40, cb.y + cb.height * gy + 30, { steps: 10 });
      await page.mouse.up();
      grabbed = true;
    }
  }
}
await page.waitForTimeout(500);
const after = await page.getByTestId("item-footprint").first().boundingBox();
await page.screenshot({ path: `${OUT}/fp-02-split.png` });
await browser.close();

const moved = Math.hypot(after.x - before.x, after.y - before.y);
const result = { wallLengthM: len, provenanceTraced: badge, roomArea, sofaGrabbedIn3d: grabbed, sofaMovedPx2d: Math.round(moved), consoleErrors: errors };
console.log(JSON.stringify(result, null, 2));
if (Math.abs(len - 9) > 0.15 || !badge || !grabbed || moved < 5 || errors.length) process.exit(1);
