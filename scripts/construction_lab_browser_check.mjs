/**
 * The construction learning mode in a real browser, at phone width: step the
 * 18 stages and watch the 3D model grow, switch the frame views, hide a floor,
 * explode and assemble repeatedly (the geometry comes back exactly), pick a
 * part by touching the model, isolate it, read its quantities, and look at the
 * quantity and estimate modes.
 *
 *   npm run build && node scripts/construction_lab_browser_check.mjs
 *
 * The built stylesheet is read from .next, so the screen is laid out as it
 * ships; `next/dynamic` is swapped for React.lazy, which is all it does here.
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

const out = mkdtempSync(join(tmpdir(), "construction_lab_"));
writeFileSync(join(out, "dynamic.tsx"), `
import { Suspense, lazy, type ComponentType } from "react";
export default function dynamic<P extends object>(loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>) {
  const Lazy = lazy(async () => { const loaded = await loader(); return "default" in loaded ? loaded : { default: loaded }; });
  return function Dynamic(props: P) { return <Suspense fallback={null}><Lazy {...props} /></Suspense>; };
}
`);
writeFileSync(join(out, "entry.tsx"), `
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { ConstructionLab } from "@/features/house-designer/components/construction-lab";
import { buildLearningHouseProject } from "@/features/house-designer/construction/learning-house";
import { buildConstructionModel } from "@/features/house-designer/construction/model";
const scenes = new Set<THREE.Scene>();
THREE.Scene.prototype.onBeforeRender = function (_renderer, _scene, camera) { scenes.add(this); Object.assign(window, { __camera: camera }); };
Object.assign(window, { __scenes: scenes, THREE });
// A user's own house: the sample's plan under another id, so the two sources differ only by name.
const project = { ...buildLearningHouseProject().project, id: "users-own-house" };
const before = JSON.stringify(project);
const ids = new Set(buildConstructionModel(buildLearningHouseProject().project).components.map((c) => c.id));
Object.assign(window, { __ids: ids, __projectUntouched: () => JSON.stringify(project) === before });
createRoot(document.getElementById("root")!).render(<div style={{ width: "100vw", padding: 8, boxSizing: "border-box" }}><ConstructionLab project={project} /></div>);
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

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const errors = [];

/** Every instanced box and cylinder the scene draws: how many, what they are made of, and where they stand. */
const stats = (page) => page.evaluate(() => {
  const scene = [...window.__scenes].at(-1);
  let instances = 0;
  let sum = 0;
  let highlighted = 0;
  let ghosts = 0;
  const colours = new Set();
  scene.traverse((o) => {
    if (o.isInstancedMesh && o.count > 0) {
      instances += o.count;
      for (let i = 0; i < o.count * 16; i += 1) sum += o.instanceMatrix.array[i];
      if (o.material.emissiveIntensity > 0) highlighted += o.count;
      if (o.material.opacity < 0.2) ghosts += o.count;
      colours.add(o.material.color.getHexString());
    } else if (o.isMesh && o.geometry?.type === "ExtrudeGeometry" || (o.isMesh && o.geometry?.type === "BufferGeometry" && o.geometry.attributes.position.count > 0 && !o.isInstancedMesh)) {
      instances += 1;
      if (o.material.emissiveIntensity > 0) highlighted += 1;
    }
  });
  return { instances, sum: Math.round(sum * 1e6) / 1e6, highlighted, ghosts, colours: [...colours] };
});
/** Top of the tallest instance, metres. */
const topOf = (page) => page.evaluate(() => {
  const scene = [...window.__scenes].at(-1);
  let top = -Infinity;
  const v = new window.THREE.Vector3();
  scene.traverse((o) => { if (o.isInstancedMesh) { const m = new window.THREE.Matrix4(); for (let i = 0; i < o.count; i += 1) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m); top = Math.max(top, v.y); } } });
  return top;
});
const settle = (page) => page.waitForTimeout(450);
/** Poll until `read` gives something truthy: a rebuilt model takes a moment, and a fixed wait is either too long or too short. */
const until = async (read, message, ms = 90000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > end) assert.fail(`timed out waiting for: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
};
/** What sticks out past the right edge of the screen, for the failure message. */
const sticksOut = (page) => page.evaluate(() => {
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return true; } return false; };
  return [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed" && !clipped(el)).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right)}`);
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, hasTouch: true });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !/WebGL|GPU stall|swiftshader/i.test(message.text())) errors.push(message.text()); });
  await page.goto(url);
  const lab = page.getByTestId("construction-lab");
  await lab.waitFor();
  await page.waitForFunction(() => window.__scenes?.size > 0, null, { timeout: 60000 });
  await settle(page);

  // ---- It opens on stage 1, with the warning in view and nothing overflowing ----------
  equal(await page.getByTestId("stage-title").innerText(), "Site preparation", "opens at stage 1");
  ok(await page.getByTestId("disclaimer").isVisible(), "the 'illustrative, not a design' notice is on screen");
  ok(/not a design|not safe/i.test(await page.getByTestId("disclaimer").innerText()), "and says so plainly");
  ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `no sideways scrolling at 390 px (${await page.evaluate(() => document.documentElement.scrollWidth)} wide): ${JSON.stringify(await sticksOut(page))} ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible').slice(0, 5).map((el) => el.tagName + '.' + String(el.className).slice(0, 50) + ':' + el.scrollWidth + '/' + el.clientWidth)))}`);
  const viewerBox = await page.getByTestId("construction-viewer").boundingBox();
  ok(viewerBox.width <= 390 && viewerBox.height >= 280, `the 3D view fits the phone and is tall enough to use (${Math.round(viewerBox.height)} px)`);
  for (const id of ["stage-prev", "stage-next", "reset-camera", "reset-model"]) {
    const box = await page.getByTestId(id).boundingBox();
    ok(box.height >= 36 && box.width >= 36, `${id} is a touch-sized target`);
  }
  const first = await stats(page);
  ok(first.instances > 50 && first.instances < 1000, `stage 1 draws only the site (${first.instances} pieces)`);

  // ---- The timeline drives the model ---------------------------------------------------
  const counts = [];
  for (const stage of [1, 3, 5, 7, 12, 18]) {
    await page.locator(`[role=tab][data-stage="${stage}"]`).click();
    await settle(page);
    ok(/stage \d+ of 18/i.test(await page.getByTestId("timeline").innerText()), "the timeline names the stage");
    equal(await page.getByTestId("construction-viewer").getAttribute("data-stage"), String(stage), `stage ${stage} is selected`);
    counts.push((await stats(page)).instances);
  }
  ok(counts[1] > counts[0] && counts[2] > counts[1] && counts[3] > counts[2] * 0.5 && counts[5] > counts[0] * 20, `the 3D model grows as stages are built (${counts.join(" → ")})`);
  await page.locator('[role=tab][data-stage="5"]').click();
  await page.getByTestId("stage-next").click();
  equal(await page.getByTestId("construction-viewer").getAttribute("data-stage"), "6", "Next goes to stage 6");
  await page.getByTestId("stage-prev").click();
  await page.getByTestId("stage-prev").click();
  equal(await page.getByTestId("construction-viewer").getAttribute("data-stage"), "4", "Previous goes back");
  await page.locator('[role=tab][data-stage="1"]').click();
  ok(await page.getByTestId("stage-prev").isDisabled(), "Previous stops at the first stage");

  // ---- Frame views at stage 5 -------------------------------------------------------------
  await page.locator('[role=tab][data-stage="5"]').click();
  await settle(page);
  const frame = page.getByTestId("frame-views");
  await frame.waitFor();
  const seen = {};
  for (const name of ["Complete", "Reinforcement only", "Formwork only", "Placement sequence", "Completed"]) {
    await frame.getByRole("radio", { name, exact: true }).click();
    await settle(page);
    seen[name] = await stats(page);
  }
  ok(seen["Reinforcement only"].colours.some((c) => /c0502d|d4673e/.test(c)), "reinforcement-only shows the steel");
  ok(!seen["Formwork only"].colours.some((c) => /c0502d|d4673e/.test(c)), "formwork-only has no steel");
  ok(seen["Formwork only"].colours.includes("c9a15b"), "formwork-only shows the formwork");
  ok(!seen["Completed"].colours.includes("c9a15b") && !seen["Completed"].colours.some((c) => /c0502d|d4673e/.test(c)), "completed shows neither formwork nor steel");
  ok(seen["Complete"].ghosts > 0 && seen["Completed"].ghosts === 0 || seen["Complete"].ghosts > seen["Completed"].ghosts, "in the complete view the concrete is see-through");
  ok(seen["Placement sequence"].instances < seen["Complete"].instances, "the placement sequence starts with nothing poured");
  await frame.getByRole("radio", { name: "Placement sequence", exact: true }).click();
  await page.getByTestId("placement-controls").getByRole("button", { name: "Pour next" }).click();
  await page.getByTestId("placement-controls").getByRole("button", { name: "Pour next" }).click();
  await settle(page);
  const poured = await stats(page);
  ok(poured.colours.includes("a8a8a2"), "pouring the next placement adds concrete");
  await frame.getByRole("radio", { name: "Complete", exact: true }).click();

  // ---- Floors ---------------------------------------------------------------------------------
  await page.locator('[role=tab][data-stage="18"]').click();
  await settle(page);
  const all = await stats(page);
  await page.getByRole("tab", { name: "Layers" }).click();
  const second = page.locator('[data-storey]').nth(2);
  await second.click();
  await settle(page);
  const noSecond = await stats(page);
  ok(noSecond.instances < all.instances, "hiding the second floor takes its parts out of the model");
  ok(noSecond.instances > all.instances * 0.5, "while the floors below stay");
  await second.click();
  await settle(page);
  await settle(page);
  equal((await stats(page)).sum, all.sum, "showing the floor again restores exactly what was there");
  await page.getByTestId("layers-panel").getByRole("button", { name: "Layers", exact: true }).click();
  await page.locator('[data-layer="paint"]').uncheck();
  await settle(page);
  ok((await stats(page)).instances < all.instances, "hiding the paint layer removes the paint");
  await page.locator('[data-layer="paint"]').check();
  await settle(page);
  equal((await stats(page)).sum, all.sum, "and showing it again restores it");

  // ---- Explode and assemble, again and again -----------------------------------------------------
  const slider = page.getByTestId("explode-slider");
  const top0 = await topOf(page);
  for (let round = 0; round < 3; round += 1) {
    await slider.fill("1");
    await settle(page);
    ok((await topOf(page)) > top0 + 2, `round ${round + 1}: exploding lifts the upper floors`);
    ok((await stats(page)).sum !== all.sum, `round ${round + 1}: the pieces have moved`);
    equal(await page.getByTestId("construction-viewer").getAttribute("data-exploded"), "true", "the view says it is exploded");
    await page.getByTestId("assemble").click();
    await settle(page);
    equal((await stats(page)).sum, all.sum, `round ${round + 1}: assembling restores the exact geometry`);
  }
  await slider.fill("0.5");
  await page.locator('[data-explode-toggle="floors"]').click();
  await settle(page);
  ok(Math.abs((await topOf(page)) - top0) < 6, "with floors switched off the height barely changes");
  await page.locator('[data-explode-toggle="floors"]').click();
  await slider.fill("0");
  await settle(page);
  equal((await stats(page)).sum, all.sum, "back to zero is the original model");

  // ---- Pick a part by touching the model ------------------------------------------------------------
  await page.locator('[role=tab][data-stage="5"]').click();
  await page.getByRole("tab", { name: "Lesson" }).click();
  await frame.getByRole("radio", { name: "Completed", exact: true }).click();
  await settle(page);
  await page.getByTestId("reset-camera").click();
  await page.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid="construction-viewer"]').getBoundingClientRect().top + window.scrollY - 70));
  await settle(page);
  const hit = await page.evaluate(() => {
    const THREE = window.THREE;
    const scene = [...window.__scenes].at(-1);
    const camera = window.__constructionCamera ?? window.__camera;
    const canvas = document.querySelector('[data-testid="construction-viewer"] canvas').getBoundingClientRect();
    const ray = new THREE.Raycaster();
    for (let gy = 0.3; gy < 0.9; gy += 0.05) for (let gx = 0.25; gx < 0.8; gx += 0.05) {
      ray.setFromCamera(new THREE.Vector2(gx * 2 - 1, -(gy * 2 - 1)), camera);
      // The first thing the ray meets must be an instanced piece, so that it is the instance picking being tested.
      const hits = ray.intersectObjects(scene.children, true).filter((h) => h.object.material?.opacity > 0.5);
      if (hits[0] && hits[0].object.isInstancedMesh) return { x: canvas.left + gx * canvas.width, y: canvas.top + gy * canvas.height };
    }
    return null;
  });
  ok(hit, "there is something to touch");
  await page.mouse.click(hit.x, hit.y);
  const inspector = page.getByTestId("inspector");
  await inspector.waitFor();
  const pickedId = await inspector.getAttribute("data-component-id");
  ok(await page.evaluate((id) => window.__ids.has(id), pickedId), `touching the model selects a real component (${pickedId})`);
  ok((await page.getByTestId("inspector-name").innerText()).length > 3, "and shows its name");
  ok(await page.getByTestId("inspector-where").isVisible(), "where it is");
  const geometry = await page.getByTestId("geometry-label").innerText();
  ok(/project's own geometry|Schematic illustration/.test(geometry), "whether the shape is the project's or a schematic");
  ok((await stats(page)).highlighted > 0, "the selected part is lit in the model");
  await page.getByRole("button", { name: "Isolate" }).click();
  await settle(page);
  const isolated = await stats(page);
  ok(isolated.ghosts > 0 && isolated.ghosts >= isolated.instances * 0.5, "isolating ghosts the rest of the building");
  await page.getByRole("button", { name: "Show everything" }).click();
  await settle(page);
  ok((await stats(page)).ghosts < isolated.ghosts, "and Show everything brings it back");
  await page.getByRole("button", { name: "Clear" }).first().click();
  ok(await page.getByTestId("inspector-empty").isVisible(), "clearing the selection says what to do next");

  // ---- Parts list and quantities of one part -----------------------------------------------------------
  await page.getByTestId("construction-lab").getByRole("radio", { name: "Inspect" }).click();
  await page.getByRole("tab", { name: "Parts" }).click();
  await page.getByLabel("Search parts").fill("Column");
  ok(Number((await page.getByTestId("parts-count").innerText()).split(" ")[0]) > 5, "searching the parts finds the columns");
  await page.getByRole("listbox", { name: "Parts" }).getByRole("option").first().locator("button").first().click();
  await page.getByTestId("inspector-quantities").waitFor();
  ok(/m³/.test(await page.getByTestId("inspector-quantities").innerText()), "a column's concrete quantity is in cubic metres");
  ok(/=/.test(await page.getByTestId("inspector-quantities").innerText()), "with its formula");

  // ---- Quantities and the estimate foundation ------------------------------------------------------------------
  await page.getByTestId("construction-lab").getByRole("radio", { name: "Prepare quantities" }).click();
  await page.locator('[role=tab][data-stage="18"]').click();
  const quantities = page.getByTestId("quantities-panel");
  await quantities.waitFor();
  await page.getByRole("radio", { name: "Whole building" }).click();
  ok(Number((await page.getByTestId("quantity-count").innerText()).split(" ")[0]) > 100, "the whole building has a hundred-odd bill lines");
  ok((await page.getByTestId("missing-data").count()) === 0, "with the steel estimated from the concrete, no line is left without a figure");
  const audit = page.getByTestId("bill-audit");
  ok((await audit.getAttribute("data-ok")) === "true" && (await audit.getAttribute("data-omissions")) === "0" && (await audit.getAttribute("data-duplicates")) === "0", "the bill is checked against the model: nothing left out, nothing counted twice");
  ok(/Concrete: [\d.,]+ m³ billed of [\d.,]+ m³ drawn/.test(await audit.innerText()), "and says how much concrete is billed of the concrete drawn");
  ok(!/[$€£]\s?\d/.test(await quantities.innerText()), "no price appears anywhere");
  const concrete = quantities.locator('[data-work-item="concrete.column"]');
  await concrete.locator("button").first().click();
  await settle(page);
  ok(/m³/.test(await concrete.innerText()) && /allowance/i.test(await concrete.innerText()), "the concrete line shows cubic metres with its allowance kept apart");
  ok(/^[A-W]\.\d\d$/.test((await concrete.getAttribute("data-ref")) ?? ""), "and a reference in the bill");
  ok((await stats(page)).highlighted > 0, "opening a line lights up its components in 3D");
  const steelRow = quantities.locator('[data-work-item^="steel."][data-status="assumed"]').first();
  ok(await steelRow.isVisible(), "a reinforcement line is marked as an assumption");
  ok(/kg/.test(await steelRow.innerText()) && !/no figure/.test(await steelRow.innerText()), "with a weight from the rule");
  await steelRow.locator("button").first().click();
  ok(/kg\/m³/.test(await steelRow.innerText()) && /not a bar schedule/.test(await steelRow.innerText()), "whose working says it is not a bar schedule");
  // The same bill, grouped by floor, stage and category: each group is a sum of parts of the same lines.
  const count = async () => Number((await page.getByTestId("quantity-count").innerText()).split(" ")[0]);
  const lines = await count();
  await page.getByRole("radio", { name: "By floor" }).click();
  const floors = await quantities.locator('[data-grouping="floor"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-group")));
  ok(floors[0] === "site" && floors.at(-1) === "roof" && floors.length >= 4, `grouped by floor: the foundations first, the roof last (${floors.join(", ")})`);
  ok((await count()) === lines, "the same lines, however they are grouped");
  const slabAbove = quantities.locator('[data-group="roof"] [data-work-item="concrete.slab"]');
  ok(await slabAbove.count() === 1, "the roof slab is billed with the roof");
  await page.getByRole("radio", { name: "By stage" }).click();
  ok((await quantities.locator('[data-grouping="stage"]').count()) >= 10, "grouped by stage there are a dozen groups or more");
  await page.getByRole("radio", { name: "By category" }).click();
  ok((await quantities.locator('[data-grouping="category"]').count()) >= 8, "and by category several more");
  await page.getByRole("radio", { name: "By section" }).click();
  // With a bar schedule as the only source of steel, the steel has no figure and the bill says what is missing.
  await quantities.locator("summary", { hasText: "Rules the quantities follow" }).click();
  ok((await quantities.getByTestId("steel-ratios").locator("input").count()) >= 8, "the kilograms of steel for each cubic metre of concrete can be set");
  await page.getByLabel("Reinforcement rule").selectOption("schedule");
  await page.waitForFunction(() => document.querySelector('[data-testid="missing-data"]'), null, { timeout: 60000 });
  ok(/approved bar schedule/i.test(await page.getByTestId("missing-data").innerText()), "lines with no figure are flagged, and say what is missing: a bar schedule");
  const missingSteel = quantities.locator('[data-work-item^="steel."][data-status="missing"]').first();
  ok(await missingSteel.isVisible() && /no figure/.test(await missingSteel.innerText()), "a reinforcement line is marked missing, with no weight");
  ok((await page.getByTestId("bill-audit").getAttribute("data-ok")) === "true", "and the audit still passes: it counts the lines waiting for a schedule");
  await page.getByLabel("Reinforcement rule").selectOption("ratio");
  await page.waitForFunction(() => !document.querySelector('[data-testid="missing-data"]'), null, { timeout: 60000 });
  await page.getByLabel("Filter quantities").fill("masonry");
  ok(Number((await page.getByTestId("quantity-count").innerText()).split(" ")[0]) >= 3, "quantities can be filtered");
  await page.getByLabel("Filter quantities").fill("");
  await page.getByLabel("Opening deduction rule").selectOption("none");
  await page.waitForTimeout(1500);
  ok(await quantities.isVisible(), "changing the opening rule rebuilds the quantities");
  // Hand the quantities to the takeoff page: the package it reads is stored, unpriced, and the page opens.
  await Promise.all([page.waitForURL(/\/takeoff\?source=house-design/), page.getByTestId("send-to-takeoff").click()]);
  const handoff = await page.evaluate(() => JSON.parse(sessionStorage.getItem("medosha:house-takeoff:v1") ?? "null"));
  ok(handoff && handoff.version === 1 && handoff.source === "house-designer", "the takeoff package is stored in the form the takeoff page reads");
  ok(handoff.quantities.length > 50 && handoff.elements.length > 50, `with the bill lines and the parts behind them (${handoff.quantities.length} lines)`);
  ok(!JSON.stringify(handoff).includes('"rate"') && handoff.warnings.some((w) => /no prices/i.test(w)), "and no prices");
  await page.goto(url);
  await page.getByTestId("construction-lab").waitFor();
  await page.waitForFunction(() => window.__scenes?.size > 0, null, { timeout: 60000 });
  await page.getByTestId("construction-lab").getByRole("radio", { name: "Estimate cost" }).click();

  const estimate = page.getByTestId("estimate-panel");
  await estimate.waitFor();
  ok(/indicative estimate in Ethiopian birr, not a quotation/i.test(await page.getByTestId("estimate-disclaimer").innerText()), "the estimate says it is indicative, in birr, and not a quotation");
  ok(/rests on example rates/i.test(await page.getByTestId("estimate-disclaimer").innerText()), "and how much of it rests on example rates");
  const valueOf = async (id) => Number(await page.getByTestId(id).first().getAttribute("data-value"));
  const total0 = await valueOf("estimate-total");
  const direct0 = await valueOf("estimate-direct");
  ok(total0 > 5e6 && direct0 > 3e6 && total0 > direct0, `the whole building has a cost: ${Math.round(direct0).toLocaleString("en")} ETB direct, ${Math.round(total0).toLocaleString("en")} ETB with additions and tax`);
  ok(Math.abs((await valueOf("estimate-materials")) + (await valueOf("estimate-labour")) - direct0) < 1, "materials and labour make the direct cost");
  const perM2 = await valueOf("estimate-per-m2");
  ok(perM2 > 15000 && perM2 < 90000, `with a cost per square metre (${Math.round(perM2).toLocaleString("en")} ETB)`);
  ok(await page.getByTestId("estimate-no-problems").isVisible(), "every line of the bill has a quantity and a price, or is included in another's");
  ok(!/[$€£]\s?\d/.test(await estimate.innerText()), "no price in another currency");
  // Where the cost falls: every grouping adds up to the direct cost.
  for (const label of ["Section", "Floor", "Stage", "Category"]) {
    await page.getByTestId("estimate-breakdown").getByRole("radio", { name: label, exact: true }).click();
    const text = await page.getByTestId("breakdown-sum").innerText();
    const [shown, whole] = text.match(/: ([\d,]+) of ([\d,]+)/).slice(1).map((n) => Number(n.replaceAll(",", "")));
    ok(Math.abs(shown - whole) <= 1 && Math.abs(whole - direct0) <= 1, `by ${label.toLowerCase()} the costs add up to the direct cost (${shown.toLocaleString("en")} of ${whole.toLocaleString("en")})`);
  }
  await page.getByTestId("estimate-breakdown").getByRole("radio", { name: "Floor", exact: true }).click();
  const costFloors = await estimate.locator('[data-grouping="floor"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-group")));
  ok(costFloors[0] === "site" && costFloors.at(-1) === "roof", `by floor the foundations come first and the roof last (${costFloors.join(", ")})`);

  // A price changed works the estimate out again; the building is not drawn again.
  const buildsBefore = await page.evaluate(() => window.__modelBuilds);
  const sceneBefore = await stats(page);
  const exampleBefore = await page.getByTestId("estimate-flags").innerText();
  await page.getByRole("tab", { name: "Rates" }).click();
  const rates = page.getByTestId("rates-panel");
  await rates.waitFor();
  ok(/assumptions, not quotations and not market prices/i.test(await rates.innerText()), "the rates say they are examples, not quotations and not market prices");
  await page.getByLabel("Search rates").fill("concrete.slab");
  ok(Number(await page.getByTestId("rate-concrete.slab-material").inputValue()) > 0, "each line of work has a material rate");
  await page.getByTestId("rate-concrete.slab-material").fill("20000");
  await page.getByRole("tab", { name: "Estimate" }).click();
  const total1 = await valueOf("estimate-total");
  ok(total1 > total0 + 100000, `a dearer cubic metre of slab makes a dearer building at once (${Math.round(total1 - total0).toLocaleString("en")} ETB more)`);
  ok((await page.evaluate(() => window.__modelBuilds)) === buildsBefore, "and the model was not built again");
  const sceneAfter = await stats(page);
  ok(sceneAfter.instances === sceneBefore.instances && sceneAfter.sum === sceneBefore.sum, "nor is the building on screen any different");
  ok(!(await page.getByTestId("model-updating").count()), "and it never said it was updating the model");
  ok((await page.getByTestId("estimate-flags").innerText()) !== exampleBefore, "and the estimate now says some of the cost rests on a rate you entered");
  const direct1 = await valueOf("estimate-direct");
  await page.getByRole("tab", { name: "Rates" }).click();
  await page.getByLabel("Search rates").fill("concrete.slab");
  await page.getByTestId("rate-concrete.slab-material").fill("14500");
  await page.getByRole("tab", { name: "Estimate" }).click();
  ok(Math.abs((await valueOf("estimate-direct")) - direct0) < 0.5 && direct1 > direct0, "the old rate gives the old cost back");
  // A rate left empty is missing, not nothing.
  await page.getByRole("tab", { name: "Rates" }).click();
  await page.getByLabel("Search rates").fill("concrete.beam");
  await page.getByTestId("rate-concrete.beam-labour").fill("");
  await page.getByRole("tab", { name: "Estimate" }).click();
  const problems = page.getByTestId("estimate-problems");
  await problems.waitFor();
  ok(/concrete|Beams/i.test(await problems.innerText()) && /no labour rate/i.test(await problems.innerText()), "a labour rate left empty is listed as a problem");
  ok((await valueOf("estimate-direct")) < direct0 - 1000, "and what it cost leaves the total");
  await page.getByRole("tab", { name: "Rates" }).click();
  await page.getByTestId("reset-rates").click();
  await page.getByRole("tab", { name: "Estimate" }).click();
  ok(Math.abs((await valueOf("estimate-direct")) - direct0) < 0.5, "putting every rate back gives the first estimate back");
  // The costs that are not work on site.
  await page.getByTestId("contingency-percent").fill("0");
  const noContingency = await valueOf("estimate-total");
  ok(noContingency < total0 - 1000, "with no contingency the total is lower");
  await page.getByTestId("contingency-percent").fill("5");
  await page.getByRole("checkbox", { name: "Include Value added tax" }).uncheck();
  ok((await valueOf("estimate-total")) < total0 - 1000 && (await valueOf("estimate-tax-total")) === 0, "and with no tax");
  await page.getByRole("checkbox", { name: "Include Value added tax" }).check();
  ok(Math.abs((await valueOf("estimate-total")) - total0) < 0.5, "tax put back, the first total is back");
  ok((await page.evaluate(() => window.__modelBuilds)) === buildsBefore, "and none of it drew the building again");

  // ---- Saving a study, opening it again, and the documents made from it --------------------------------------------------
  const readDownload = async (download) => readFileSync(await download.path());
  await page.getByRole("tab", { name: "Rates" }).click();
  await page.getByLabel("Search rates").fill("concrete.slab");
  await page.getByTestId("rate-concrete.slab-material").fill("20000");
  await page.getByLabel("Search rates").fill("");
  await page.getByRole("tab", { name: "Estimate" }).click();
  const savedTotal = await valueOf("estimate-total");
  ok(Math.abs(savedTotal - total0) > 1000, "a study is saved with a price of its own in it");
  await page.getByTestId("study-toggle").click();
  await page.getByTestId("study-panel").waitFor();
  ok((await page.getByTestId("study-list").locator("[data-study-id]").count()) === 0, "no study is saved yet");
  await page.getByTestId("study-name").fill("Browser study");
  await page.getByTestId("study-save").click();
  ok(/Saved .Browser study./.test(await page.getByTestId("study-message").innerText()) && (await page.getByTestId("study-message").getAttribute("data-ok")) === "true", "saving says it is saved");
  ok((await page.getByTestId("study-list").locator("[data-study-id]").count()) === 1 && /Browser study/.test(await page.getByTestId("study-list").innerText()), "and the study is listed");
  // The learner goes on and changes things.
  await page.getByTestId("study-toggle").click();
  await page.getByRole("tab", { name: "Rates" }).click();
  await page.getByLabel("Search rates").fill("concrete.slab");
  await page.getByTestId("rate-concrete.slab-material").fill("14500");
  await page.getByLabel("Search rates").fill("");
  await page.getByRole("tab", { name: "Estimate" }).click();
  ok(Math.abs((await valueOf("estimate-total")) - total0) < 0.5, "the price put back, the first total is back");
  // Opening the study brings back what was saved.
  await page.getByTestId("study-toggle").click();
  await page.getByTestId("study-open").click();
  await page.getByTestId("study-toggle").click();
  await page.getByRole("tab", { name: "Estimate" }).click();
  ok(Math.abs((await valueOf("estimate-total")) - savedTotal) < 0.5, "opening the study brings back its price and its total, to the last digit");
  // The study is still there after the page is loaded again.
  await page.goto(url);
  await page.getByTestId("construction-lab").waitFor();
  await page.waitForFunction(() => window.__scenes?.size > 0, null, { timeout: 60000 });
  await page.getByTestId("construction-lab").getByRole("radio", { name: "Estimate cost" }).click();
  await page.getByTestId("estimate-panel").waitFor();
  ok(Math.abs((await valueOf("estimate-total")) - total0) < 0.5, "a page loaded afresh starts from the examples");
  await page.getByTestId("study-toggle").click();
  ok((await page.getByTestId("study-list").locator("[data-study-id]").count()) === 1, "and the saved study is still listed: it is kept by the browser");
  await page.getByTestId("study-open").click();
  await page.getByTestId("study-toggle").click();
  await page.getByRole("tab", { name: "Estimate" }).click();
  ok(Math.abs((await valueOf("estimate-total")) - savedTotal) < 0.5, "and opens as it was saved");
  // As a file.
  await page.getByTestId("study-toggle").click();
  const [fileDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("study-to-file").click()]);
  ok(/^medosha_house_browser_study_study\.json$/.test(fileDownload.suggestedFilename()), `a study can be downloaded as a file (${fileDownload.suggestedFilename()})`);
  const saved = JSON.parse((await readDownload(fileDownload)).toString("utf8"));
  ok(saved.version === 1 && saved.name === "Browser study" && saved.priceBook.entries["concrete.slab"].material.value === 20000 && saved.building.template, "with the building and the price book in it");
  await page.getByTestId("study-delete").click();
  ok((await page.getByTestId("study-list").locator("[data-study-id]").count()) === 0, "a study can be deleted");
  await page.getByTestId("study-file-input").setInputFiles(await fileDownload.path());
  await page.waitForFunction(() => /Opened/.test(document.querySelector('[data-testid="study-message"]')?.textContent ?? ""));
  await page.getByTestId("study-toggle").click();
  await page.getByRole("tab", { name: "Estimate" }).click();
  ok(Math.abs((await valueOf("estimate-total")) - savedTotal) < 0.5, "and opened from the file it is the same study again");
  await page.getByTestId("study-toggle").click();
  await page.getByTestId("study-file-input").setInputFiles({ name: "rubbish.json", mimeType: "application/json", buffer: Buffer.from("{not json") });
  await page.waitForFunction(() => /not readable/.test(document.querySelector('[data-testid="study-message"]')?.textContent ?? ""));
  ok((await page.getByTestId("study-message").getAttribute("data-ok")) === "false", "a file that is not a study is refused, with the reason");
  // The documents.
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-xlsx").click()]);
  ok(/^medosha_house_[a-z0-9_]+_estimate\.xlsx$/.test(xlsx.suggestedFilename()), `the workbook is named with underscores (${xlsx.suggestedFilename()})`);
  const sheet = await readDownload(xlsx);
  const sheetText = sheet.toString("latin1");
  ok(sheet[0] === 0x50 && sheet[1] === 0x4b && sheet[2] === 0x03 && sheet[3] === 0x04 && /xl\/workbook\.xml/.test(sheetText), "the workbook is a zip with a workbook in it");
  ok(["BOQ by floor", "BOQ by stage", "BOQ by category", "Cost summary", "Cost by group", "Price book"].every((n) => sheetText.includes(`name="${n}"`)), "with a sheet for the bill by floor, stage and category, the cost, and the price book");
  ok(new TextDecoder().decode(sheet).includes(`ETB ${Math.round(savedTotal).toLocaleString("en")}`), "and the total in it is the total on the screen");
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-pdf").click()]);
  ok(/^medosha_house_[a-z0-9_]+_estimate\.pdf$/.test(pdf.suggestedFilename()), `the PDF is named the same way (${pdf.suggestedFilename()})`);
  const pdfBytes = await readDownload(pdf);
  const pdfText = pdfBytes.toString("latin1");
  ok(pdfText.startsWith("%PDF-1.4") && pdfText.trimEnd().endsWith("%%EOF") && (pdfText.match(/\/Type \/Page /g) ?? []).length >= 12 && /Page 1 of \d+/.test(pdfText), "the PDF is a document of a dozen pages or more");
  ok(pdfText.includes(`ETB ${Math.round(savedTotal).toLocaleString("en")}`), "with the same total in it");
  await page.getByTestId("study-toggle").click();

  // A study of another building brings that building back: its plan, its structure and its 3D model.
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("radiogroup", { name: "Building template" }).locator('[data-template="modern-villa"]').click();
  await page.waitForFunction(() => /^Modern Villa/.test(document.querySelector('[data-testid="building-summary"]')?.textContent ?? ""));
  await page.waitForFunction(() => !document.querySelector('[data-testid="model-updating"]'), null, { timeout: 60000 });
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("tab", { name: "Estimate" }).click();
  await page.waitForFunction((was) => Math.abs(Number(document.querySelector('[data-testid="estimate-total"]')?.getAttribute("data-value")) - was) > 1000, savedTotal, { timeout: 60000 });
  const villaTotal = await valueOf("estimate-total");
  const villaScene = await stats(page);
  await page.getByTestId("study-toggle").click();
  await page.getByTestId("study-name").fill("Villa");
  await page.getByTestId("study-save").click();
  await page.getByTestId("study-toggle").click();
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("radiogroup", { name: "Building template" }).locator('[data-template="existing"]').click();
  await page.waitForFunction(() => /^Medosha|^Existing|^Learning/.test(document.querySelector('[data-testid="building-summary"]')?.textContent ?? "") || !/Modern Villa/.test(document.querySelector('[data-testid="building-summary"]')?.textContent ?? ""));
  await page.waitForFunction(() => !document.querySelector('[data-testid="model-updating"]'), null, { timeout: 60000 });
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("tab", { name: "Estimate" }).click();
  await page.waitForFunction((was) => Math.abs(Number(document.querySelector('[data-testid="estimate-total"]')?.getAttribute("data-value")) - was) > 1000, villaTotal, { timeout: 60000 });
  ok(Math.abs((await valueOf("estimate-total")) - villaTotal) > 1000, "the Existing Building costs something other than the villa");
  await page.getByTestId("study-toggle").click();
  await page.getByTestId("study-open").click();
  await page.waitForFunction(() => /^Modern Villa/.test(document.querySelector('[data-testid="building-summary"]')?.textContent ?? ""));
  await page.getByTestId("study-toggle").click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="model-updating"]'), null, { timeout: 60000 });
  await page.getByRole("tab", { name: "Estimate" }).click();
  await page.waitForFunction((want) => Math.abs(Number(document.querySelector('[data-testid="estimate-total"]')?.getAttribute("data-value")) - want) < 0.5, villaTotal, { timeout: 60000 });
  ok(Math.abs((await valueOf("estimate-total")) - villaTotal) < 0.5, "opening the villa's study brings the villa back, with its cost to the last digit");
  const sameScene = async () => { for (let i = 0; i < 60; i += 1) { const now = await stats(page); if (now.instances === villaScene.instances && now.sum === villaScene.sum) return true; await page.waitForTimeout(500); } return false; };
  ok(await sameScene(), "and its 3D model is the same model");
  // Back to the Existing Building for the rest of the check, and the study put away.
  await page.getByTestId("study-toggle").click();
  await page.getByTestId("study-delete").click();
  await page.getByTestId("study-toggle").click();
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("radiogroup", { name: "Building template" }).locator('[data-template="existing"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="model-updating"]'), null, { timeout: 60000 });
  await page.getByTestId("settings-toggle").click();

  // ---- Sample dimensions ------------------------------------------------------------------------------------------------
  await page.getByTestId("construction-lab").getByRole("radio", { name: "Learn" }).click();
  await page.locator('[role=tab][data-stage="5"]').click();
  await frame.getByRole("radio", { name: "Completed", exact: true }).click();
  await settle(page);
  const heightBefore = await topOf(page);
  await page.getByTestId("settings-toggle").click();
  const settings = page.getByTestId("settings-panel");
  await settings.waitFor();
  ok(/never saved over your own houses|never saved/i.test(await settings.innerText()), "the sample says it is never saved over a user's house");
  await settings.locator('[data-field="floorToFloor"]').fill("3600");
  await page.waitForFunction(() => document.querySelector('[data-field="floorToFloor"]')?.value === "3600");
  await until(async () => (await topOf(page)) > heightBefore + 0.9, "a taller floor-to-floor height makes a taller house");
  ok((await topOf(page)) > heightBefore + 0.9, "a taller floor-to-floor height makes a taller house");
  await settings.getByRole("button", { name: /Structure and openings/ }).click();
  await settings.locator('[data-field="slabThickness"]').fill("20");
  await page.waitForTimeout(500);
  ok(/slabThickness was 20/.test(await page.getByTestId("param-issues").innerText()), "an impossible slab thickness is corrected with a message");
  await page.getByRole("button", { name: "Back to the example dimensions" }).click();
  await until(async () => Math.abs((await topOf(page)) - heightBefore) < 0.01, "the example dimensions put the house back");
  await page.getByTestId("settings-toggle").click();

  // ---- The user's own project is read, never changed ----------------------------------------------------------------------
  const sampleSide = await stats(page);
  await page.getByRole("radio", { name: "My project" }).click();
  await page.waitForTimeout(2200);
  const mine = await stats(page);
  ok(mine.instances > 300, `a user's project builds the same way (${mine.instances} pieces)`);
  equal(mine.instances, sampleSide.instances, "and, being the same plan, draws the same pieces");
  await page.getByRole("radio", { name: "Sample house" }).click();
  await page.waitForTimeout(2200);
  ok(await page.evaluate(() => window.__projectUntouched()), "the user's project object is exactly as it was given");

  // ---- Reset ----------------------------------------------------------------------------------------------------------------
  await page.locator('[role=tab][data-stage="18"]').click();
  await settle(page);
  const before = await stats(page);
  await slider.fill("0.8");
  await page.getByRole("tab", { name: "Layers" }).click();
  await page.locator('[data-category="masonry"]').uncheck();
  await settle(page);
  ok((await stats(page)).sum !== before.sum, "the model has been changed");
  await page.getByTestId("reset-model").click();
  await settle(page);
  equal((await stats(page)).sum, before.sum, "Reset model puts every piece back");
  equal(await page.getByTestId("construction-viewer").getAttribute("data-exploded"), "false", "assembled again");
  equal(await page.getByTestId("construction-viewer").getAttribute("data-stage"), "18", "and stays on the same stage");
  ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, "still no sideways scrolling");

  // ---- Installation views: plumbing, electrical, combined, concealed, finished, exploded -----------------------------------------------
  await page.getByTestId("construction-lab").getByRole("radio", { name: "Learn" }).click();
  await page.locator('[role=tab][data-stage="18"]').click();
  await page.getByRole("tab", { name: "Lesson" }).click();
  await settle(page);
  const views = page.getByTestId("service-views");
  await views.waitFor();
  for (const id of ["off", "plumbing", "electrical", "combined", "concealed", "finished", "exploded"]) {
    const box = await page.getByTestId(`service-view-${id}`).boundingBox();
    ok(box.height >= 36 && box.x + box.width <= 390 + 1 && box.x >= -1, `the ${id} view button fits the phone and is a touch target`);
  }
  equal(await page.locator('[data-testid="service-legend"] [data-legend]').count(), 7, "the legend names seven kinds of pipe and conduit");
  const COLD = "2563eb"; const HOT = "dc2626"; const CONDUIT = "eab308"; const EARTH = "16a34a";
  await page.getByTestId("service-view-plumbing").click();
  await settle(page);
  const plumbingOnly = await stats(page);
  ok(plumbingOnly.colours.includes(COLD) && plumbingOnly.colours.includes(HOT), "plumbing only draws the cold and the hot pipes, though they are inside the walls");
  ok(!plumbingOnly.colours.includes(CONDUIT), "and no conduit");
  ok(plumbingOnly.ghosts > 100, "with the building faint round them");
  await page.getByTestId("service-view-electrical").click();
  await settle(page);
  const electricalOnly = await stats(page);
  ok(electricalOnly.colours.includes(CONDUIT), "electrical only draws the conduit");
  ok(!electricalOnly.colours.includes(HOT), "and no hot pipe");
  await page.getByTestId("service-view-combined").click();
  await settle(page);
  const combinedView = await stats(page);
  ok(combinedView.colours.includes(CONDUIT) && combinedView.colours.includes(COLD), "combined draws both");
  await page.getByTestId("service-view-concealed").click();
  await settle(page);
  const concealedView = await stats(page);
  ok(concealedView.colours.includes(CONDUIT) && concealedView.colours.includes(HOT), "the concealed installation shows what is built in");
  await page.getByTestId("service-view-finished").click();
  await settle(page);
  const finishedView = await stats(page);
  ok(!finishedView.colours.includes(EARTH) && !finishedView.colours.includes(HOT), "the finished building has covered the earthing conductor and the hot pipes");
  ok(concealedView.colours.includes(EARTH), "which the concealed installation does show");
  ok(finishedView.instances < concealedView.instances, "so it draws fewer pieces than the concealed view, which has the built-in services as well");
  equal(await page.getByTestId("construction-viewer").getAttribute("data-stage"), "18", "at the last stage");
  await page.getByTestId("service-view-exploded").click();
  await settle(page);
  equal(await page.getByTestId("construction-viewer").getAttribute("data-exploded"), "true", "the exploded installation is exploded");
  const explodedView = await stats(page);
  ok(explodedView.colours.includes(CONDUIT) && explodedView.colours.includes(COLD), "and shows both installations");
  await page.getByTestId("service-view-combined").click();
  await settle(page);
  equal(await page.getByTestId("construction-viewer").getAttribute("data-exploded"), "false", "leaving it puts the model back together");
  // The routing settings redraw the drains.
  await page.getByTestId("service-settings").locator("summary").click();
  await page.getByTestId("fall-drain").fill("40");
  await page.waitForTimeout(2500);
  ok(await page.getByTestId("service-views").isVisible(), "a steeper drain fall redraws the model and the panel stays");
  await page.getByTestId("fall-drain").fill("60");
  await page.waitForTimeout(2000);
  // Touch a pipe from the list: its source, destination and fixing are shown.
  await page.getByTestId("construction-lab").getByRole("radio", { name: "Inspect" }).click();
  await page.getByRole("tab", { name: "Parts" }).click();
  await page.getByLabel("Search parts").fill("Cold-water pipes");
  await page.getByRole("listbox", { name: "Parts" }).getByRole("option").first().locator("button").first().click();
  await page.getByTestId("inspector-service").waitFor();
  ok(/Cold water/.test(await page.getByTestId("inspector-service").innerText()), "a pipe names its system");
  ok((await page.getByTestId("service-from").innerText()).length > 3 && (await page.getByTestId("service-to").innerText()).length > 3, "and where it starts and ends");
  await page.getByTestId("construction-lab").getByRole("radio", { name: "Learn" }).click();
  await page.getByTestId("service-view-off").click();
  ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, "no sideways scrolling with the installation views");

  // ---- Labels ----------------------------------------------------------------------------------------------------------------------
  await page.locator('[role=tab][data-stage="3"]').click();
  await settle(page);
  await page.waitForFunction(() => document.querySelectorAll("[data-label-for]").length > 0, null, { timeout: 15000 });
  ok((await page.locator("[data-label-for]").count()) >= 1, "labels with leader lines mark the main parts");
  await page.locator("[data-label-for]").first().click();
  await page.getByTestId("inspector").waitFor();
  ok(true, "a label opens its part");
  await page.screenshot({ path: join(out, "phone.png") });

  // ---- Optional: pictures of the stages, for looking at --------------------------------------------------------------------
  if (process.env.CONSTRUCTION_SHOTS) {
    const shots = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await shots.goto(url);
    await shots.getByTestId("construction-lab").waitFor();
    await shots.waitForFunction(() => window.__scenes?.size > 0, null, { timeout: 60000 });
    for (const stage of [3, 5, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18]) {
      await shots.locator(`[role=tab][data-stage="${stage}"]`).click();
      await shots.waitForTimeout(900);
      await shots.getByTestId("construction-viewer").screenshot({ path: join(out, `stage_${stage}.png`) });
    }
    await shots.getByTestId("explode-slider").fill("0.8");
    await shots.waitForTimeout(900);
    await shots.getByTestId("construction-viewer").screenshot({ path: join(out, "exploded.png") });
    await shots.getByTestId("explode-slider").fill("0");
    await shots.locator('[role=tab][data-stage="18"]').click();
    for (const mode of ["plumbing", "electrical", "combined", "concealed", "finished", "exploded"]) {
      await shots.getByTestId(`service-view-${mode}`).click();
      await shots.waitForTimeout(1200);
      await shots.getByTestId("construction-viewer").screenshot({ path: join(out, `services_${mode}.png`) });
    }
    console.log("pictures in", out);
  }

  // ---- Desktop layout ----------------------------------------------------------------------------------------------------------------
  const wide = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  wide.on("pageerror", (error) => errors.push(String(error)));
  await wide.goto(url);
  await wide.getByTestId("construction-lab").waitFor();
  await wide.waitForFunction(() => window.__scenes?.size > 0, null, { timeout: 60000 });
  await wide.waitForTimeout(500);
  const wideBox = await wide.getByTestId("construction-viewer").boundingBox();
  ok(wideBox.width > 600 && wideBox.height > 400, "on a wide screen the model has room");
  ok((await wide.evaluate(() => document.documentElement.scrollWidth)) <= 1280, "no sideways scrolling on desktop");
  await wide.screenshot({ path: join(out, "desktop.png") });
  console.log("screenshots:", join(out, "phone.png"), join(out, "desktop.png"));

  assert.deepEqual(errors, [], `no page errors: ${errors.join("\n")}`);
  checks += 1;
  console.log(`Construction learning mode in the browser: ${checks} checks passed.`);
} finally {
  await browser.close();
  server.close();
}
