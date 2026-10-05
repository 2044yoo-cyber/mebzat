/**
 * Height modules in a real browser, at phone width.
 *
 * The first page: a 2400 × 2700 wardrobe in 2440 board is shown, before
 * anything is made, as needing a 2600 mm side panel the board cannot give,
 * with 2100 + 600 recommended; the 2750 sheet offered makes it one module; a
 * partition typed to 2200 gives 2200 + 500; width modules customised; the
 * review repeats the decision; Create makes that construction. The editor: the
 * boundary tapped in the elevation, dragged with live heights, typed, locked,
 * reset; Remove Partition refused in 2440 board.
 *
 *   npm run build && node scripts/height_modules_browser_check.mjs [screenshot-folder]
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
let chromium;
try { ({ chromium } = await import("playwright")); } catch { try { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); } catch { console.log("SKIP: needs Playwright"); process.exit(0); } }

const cssFiles = [];
const walk = (dir) => { if (!existsSync(dir)) return; for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (name.endsWith(".css")) cssFiles.push(path); } };
walk(join(root, ".next/static"));
if (!cssFiles.length) { console.log("SKIP: run `npm run build` first, for the stylesheet"); process.exit(0); }

const out = mkdtempSync(join(tmpdir(), "height_modules_"));
writeFileSync(join(out, "dynamic.tsx"), `
import { Suspense, lazy, type ComponentType } from "react";
export default function dynamic<P extends object>(loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>) {
  const Lazy = lazy(async () => { const loaded = await loader(); return "default" in loaded ? loaded : { default: loaded }; });
  return function Dynamic(props: P) { return <Suspense fallback={null}><Lazy {...props} /></Suspense>; };
}
`);
writeFileSync(join(out, "entry.tsx"), `
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CabinetStart } from "@/features/berchuma-studio/components/cabinet-start";
import { DesignEditor } from "@/features/berchuma-studio/components/editor/design-editor";
import { buildTemplate } from "@/features/berchuma-studio/services/cabinet-templates";
const query = new URLSearchParams(location.search);
const start = buildTemplate("wardrobe-4-door", { width: 2400, height: 2700, depth: 600 }, { heights: [2100, 600], heightAuto: true })!;
function App() {
  const [spec, setSpec] = useState(start);
  useEffect(() => { Object.assign(window, { __spec: spec }); }, [spec]);
  if (query.has("start")) return <div className="@container/ws mx-auto max-w-2xl p-4"><CabinetStart onStart={(started) => Object.assign(window, { __started: started })} /></div>;
  return <div className="@container/ws" style={{ width: "100vw", height: "100vh", overflow: "auto" }}><DesignEditor spec={spec} onChange={setSpec} /></div>;
}
createRoot(document.getElementById("root")!).render(<App />);
`);
const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
await build({
  absWorkingDir: root, entryPoints: [join(out, "entry.tsx")], bundle: true, outfile: join(out, "app.js"), format: "esm", jsx: "automatic", platform: "browser", logLevel: "error",
  nodePaths: [join(root, "node_modules")], define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "alias", setup(builder) {
    builder.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: join(out, "dynamic.tsx") }));
    builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind }));
  } }],
});
writeFileSync(join(out, "app.css"), cssFiles.map((file) => readFileSync(file, "utf8")).join("\n"));
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/app.js"></script></body></html>`);
const server = createServer((request, response) => {
  const path = request.url.startsWith("/app.js") ? "app.js" : request.url.startsWith("/app.css") ? "app.css" : "index.html";
  response.writeHead(200, { "content-type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html" });
  response.end(readFileSync(join(out, path)));
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const executablePath = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;
const browser = await chromium.launch({ executablePath, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const shots = process.argv[2];
const next = (page) => page.getByRole("button", { name: /^Next:/ }).click();
const type = async (locator, value) => { await locator.fill(String(value)); await locator.press("Enter"); };

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  // ---- The first page decides the construction ------------------------------------
  await page.goto(`${url}?start`);
  await page.getByRole("group", { name: "Cabinet type" }).getByRole("button", { name: /Wardrobe/ }).click();
  await type(page.getByLabel("Width in mm"), 2400);
  await type(page.getByLabel("Height in mm"), 2700);
  const partition = page.getByRole("region", { name: "Module partition" });
  const heights = () => partition.locator("[data-height-modules]").textContent();
  const widths = () => partition.locator("[data-width-modules]").textContent();
  const decision = partition.locator("[data-construction-decision]");
  assert.equal(await page.getByRole("radiogroup", { name: "Sheet size" }).getByRole("radio", { checked: true }).textContent(), "1220 × 2440 mm", "white MDF in its 2440 sheet");
  assert.match(await decision.textContent(), /A 2700 mm wardrobe in one carcass needs a 2600 mm side panel; the selected board is 2440 mm\./, "the reason one carcass is not possible, before anything is made");
  assert.equal(await heights(), "2100 + 600", "Auto: 2100 + 600");
  assert.equal(await widths(), "Auto — 1600 + 800", "and 1600 + 800 across");
  if (shots) await page.screenshot({ path: join(shots, "height_first_page.png"), fullPage: true });

  await decision.getByRole("button", { name: /Change Material: 1220 × 2750 sheet, one module/ }).click();
  assert.equal(await page.getByRole("radiogroup", { name: "Sheet size" }).getByRole("radio", { checked: true }).textContent(), "1220 × 2750 mm", "the long sheet chosen");
  assert.equal(await heights(), "Single 2700 mm", "and the wardrobe is one 2700 mm module");
  assert.match(await decision.textContent(), /Single 2700 mm module possible in this board/, "said as possible");
  await page.getByRole("radiogroup", { name: "Sheet size" }).getByRole("radio", { name: "1220 × 2440 mm" }).click();
  assert.equal(await heights(), "2100 + 600", "back to the 2440 sheet: divided again");

  await partition.getByRole("group", { name: "Height construction" }).getByRole("button", { name: "Single Module" }).click();
  assert.match(await decision.textContent(), /This module requires a 2600 mm side panel, but the selected board is 2440 mm\./, "a single module asked for in 2440 board is refused, saying why");
  await partition.getByRole("group", { name: "Height construction" }).getByRole("button", { name: "Partitioned Modules" }).click();
  await type(partition.getByLabel("First module height in mm"), 2200);
  assert.equal(await heights(), "2200 + 500", "first module 2200: 2200 + 500");
  await type(partition.getByLabel("First module height in mm"), 2600);
  assert.match(await decision.textContent(), /Lower module: This module requires a 2500 mm side panel, but the selected board is 2440 mm\./, "2600 checked against the board");
  await type(partition.getByLabel("First module height in mm"), 2200);

  await partition.getByRole("button", { name: "Customize Modules" }).click();
  await type(partition.getByLabel("Width module 1 in mm"), 1200);
  assert.equal(await widths(), "Custom — 1200 + 1200", "width modules customised: 1200 + 1200");
  await next(page);
  await page.getByRole("group", { name: "Wardrobe layout" }).getByRole("button", { name: "Straight" }).click();
  await next(page);
  await page.getByRole("group", { name: "Templates" }).getByRole("button").filter({ hasText: "4-door wardrobe" }).click();
  await next(page);
  const review = page.getByRole("region", { name: "Review" });
  assert.match(await review.textContent(), /W 2400 × H 2700 × D 600 mm/, "the review: the overall size");
  assert.match(await review.textContent(), /1220 × 2440 mm/, "the sheet");
  assert.match(await review.textContent(), /Width modules1200 \+ 1200/, "the width modules");
  assert.equal(await review.locator("[data-review-heights]").textContent(), "2200 + 500", "and the height modules, before generating");
  await page.getByRole("button", { name: /^Create 4-door wardrobe/ }).click();
  await page.waitForFunction(() => window.__started);
  const made = await page.evaluate(() => window.__started.cabinets.map((cabinet) => [cabinet.size.width, cabinet.size.height, Boolean(cabinet.stackedOn), (cabinet.transport?.joints ?? []).map((joint) => joint.at)]));
  assert.deepEqual(made, [[2400, 2200, false, [1200]], [2400, 500, true, [1200]]], "made as decided: 1200 + 1200 across, 2200 + 500 up");

  // ---- The editor: the boundary itself -----------------------------------------------
  await page.goto(url);
  await page.waitForFunction(() => window.__spec);
  await page.getByRole("tab", { name: "Elevation" }).click();
  const svg = page.locator("svg[role=img]").first();
  await svg.waitFor();
  assert.equal(await svg.locator("text", { hasText: "Upper module 2 — 800 × 600" }).count(), 1, "the elevation names each upper module with its width and height");
  assert.equal(await svg.locator("text", { hasText: "Lower module 1 — 1600 × 2100" }).count(), 1, "and each lower");
  const lowerId = await page.evaluate(() => window.__spec.cabinets.find((cabinet) => !cabinet.stackedOn).id);
  await svg.scrollIntoViewIfNeeded();
  const band = await page.locator(`[data-height-partition="${lowerId}"]`).boundingBox();
  await page.mouse.click(band.x + band.width * 0.25, band.y + band.height / 2);
  const panel = page.getByRole("region", { name: "Height modules" });
  await panel.waitFor();
  assert.match(await panel.textContent(), /Height module partition/, "tapping the boundary opens the partition");
  assert.equal(await panel.getByLabel("Lower module in mm").inputValue(), "2100", "Lower module 2100");
  assert.equal(await panel.getByLabel("Upper module in mm").inputValue(), "600", "Upper module 600");
  assert.equal(await panel.getByLabel("Overall height in mm").inputValue(), "2700", "Overall 2700");

  const scale = await page.evaluate(() => document.querySelector("svg[role=img]").getScreenCTM().d);
  await svg.scrollIntoViewIfNeeded();
  const grip = await page.locator(`[data-partition-handle="${lowerId}"]`).boundingBox();
  const at = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y - 160 * scale, { steps: 8 });
  await page.waitForFunction(() => /^Lower 22\d\d/.test(document.querySelector("[data-partition-live]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => undefined);
  const live = await svg.locator("[data-partition-live]").textContent();
  assert.match(live, /^Lower 22\d\d · Upper [45]\d\d$/, `the heights shown live while it is dragged (${live})`);
  if (shots) await page.screenshot({ path: join(shots, "height_drag.png") });
  await page.mouse.up();
  const dragged = await page.evaluate(() => window.__spec.cabinets.map((cabinet) => cabinet.size.height));
  assert.ok(Math.abs(dragged[0] - 2260) <= 60 && dragged[0] + dragged[1] === 2700, `dragged up: ${dragged.join(" + ")}`);

  await type(panel.getByLabel("Lower module in mm"), 2200);
  await page.waitForFunction(() => window.__spec.cabinets.map((cabinet) => cabinet.size.height).join() === "2200,500");
  assert.equal(await panel.getByLabel("Upper module in mm").inputValue(), "500", "lower typed 2200: upper 500, total 2700");
  await type(panel.getByLabel("Upper module in mm"), 400);
  await page.waitForFunction(() => window.__spec.cabinets.map((cabinet) => cabinet.size.height).join() === "2300,400");
  assert.equal(await panel.getByLabel("Lower module in mm").inputValue(), "2300", "upper typed 400: lower 2300");
  await type(panel.getByLabel("Lower module in mm"), 2200);
  await page.waitForFunction(() => window.__spec.cabinets.map((cabinet) => cabinet.size.height).join() === "2200,500");
  await panel.getByRole("button", { name: "Lock partition" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].heightModules?.locked === true);
  assert.ok(await panel.getByLabel("Lower module in mm").isDisabled(), "a locked partition cannot be typed");
  assert.equal(await page.locator(`[data-partition-handle="${lowerId}"]`).count(), 0, "or dragged");
  assert.ok(await panel.getByRole("button", { name: "Remove Partition" }).isDisabled(), "Remove Partition refused: 2440 board cannot make one 2700 carcass");
  await panel.getByRole("button", { name: "Reset to Recommended" }).click();
  await page.waitForFunction(() => window.__spec.cabinets.map((cabinet) => cabinet.size.height).join() === "2100,600" && window.__spec.cabinets[0].heightModules?.auto === true && !window.__spec.cabinets[0].heightModules?.locked);
  await type(panel.getByLabel("Overall height in mm"), 2300);
  await page.waitForFunction(() => window.__spec.cabinets.length === 1 && window.__spec.cabinets[0].size.height === 2300);
  assert.match(await panel.textContent(), /One carcass, 2300 mm/, "on Auto a 2300 mm wardrobe becomes one module again");

  assert.deepEqual(errors, [], "page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Height modules in the browser: 2700 in 2440 board shown as 2100 + 600 before generating, the 2750 sheet making it one module, 2200 + 500 typed and checked, 1200 + 1200 across, made as decided; the boundary tapped, dragged live, typed, locked, reset, and Auto making 2300 one module");
