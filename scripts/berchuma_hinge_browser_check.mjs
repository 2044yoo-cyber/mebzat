/**
 * Hinge type and door sizing, in the real editor at phone width: choose Full
 * overlay, Half overlay or Inset and see the elevation, the 3D model and the
 * parts change at once; set the gap between doors; size a door by hand and
 * Reset to Auto under the hinge now chosen; save the design, reopen it, and
 * find the same choice and the same doors.
 *
 *   npm run build && node scripts/berchuma_hinge_browser_check.mjs
 *
 * The built stylesheet is read from .next, so the editor is laid out as it
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

const out = mkdtempSync(join(tmpdir(), "berchuma_hinge_"));
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
import * as THREE from "three";
import { DesignEditor } from "@/features/berchuma-studio/components/editor/design-editor";
import { wardrobeExample } from "@/features/berchuma-studio/services/examples";
import { startingDesign } from "@/features/berchuma-studio/services/starting-designs";
import { buildParts } from "@/features/berchuma-studio/services/geometry";
import { parseSpec, validateSpec } from "@/features/berchuma-studio/types/spec";
const scenes = new Set<THREE.Scene>();
THREE.Scene.prototype.onBeforeRender = function (_renderer, _scene, camera) { scenes.add(this); Object.assign(window, { __camera: camera }); };
Object.assign(window, { __scenes: scenes, THREE });
const query = new URLSearchParams(location.search);
const start = validateSpec(query.get("design") === "kitchen" ? startingDesign("kitchen") : wardrobeExample()).spec;
function App() {
  const [spec, setSpec] = useState(start);
  useEffect(() => {
    Object.assign(window, {
      __spec: spec,
      __doors: () => buildParts(spec).parts.filter((part) => part.role === "door").reduce((total, part) => total + part.quantity, 0),
      __doorParts: () => buildParts(spec).parts.filter((part) => part.role === "door").map((part) => ({ id: part.id, width: part.width, length: part.length, quantity: part.quantity, z: part.placements[0]!.z })),
      __hinges: () => buildParts(spec).hardware.filter((line) => line.hardware.kind === "hinge").map((line) => line.hardware.id),
    });
  }, [spec]);
  useEffect(() => { Object.assign(window, { __reopen: (json: string) => { const parsed = parseSpec(JSON.parse(json)); if (parsed.ok) setSpec(parsed.spec); return parsed.ok; } }); }, []);
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

const errors = [];
const near = (actual, expected, message, tolerance = 0.06) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected}`);
/** Every door as the elevation draws it, left to right. */
const drawn = (page) => page.evaluate(() => [...document.querySelectorAll("[data-door] > rect")].map((rect) => ({ x: Number(rect.getAttribute("x")), width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")) })).sort((a, b) => a.x - b.x));
const parts = (page) => page.evaluate(() => window.__doorParts());
const depth = (page) => page.evaluate(() => { const box = new window.THREE.Box3(); [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh && object.geometry?.type === "BoxGeometry") box.expandByObject(object); }); return box.max.z - box.min.z; });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(url);
  await page.waitForFunction(() => window.__spec);
  await page.getByRole("tab", { name: "Elevation" }).click();
  await page.locator("[data-door] > rect").first().waitFor();
  // The hinge controls live under "Door options", for the door that is selected:
  // tap a cabinet, tap its door.
  const fitting = page.locator("[data-door-fitting]");
  const hinge = fitting.getByLabel("Hinge type");
  const clearance = fitting.getByLabel("Door clearance");
  const selectDoor = async () => {
    if (await fitting.count()) return;
    const leaf = page.locator('[data-door="bay-1:0:0"] > rect');
    await leaf.click({ position: { x: 20, y: 60 } });
    if (!(await fitting.count())) await leaf.click({ position: { x: 20, y: 60 } });
    await fitting.waitFor();
  };
  await selectDoor();

  // ---- A design from before: sized as it was, and says so -------------------
  assert.equal(await hinge.inputValue(), "original", "an old design is shown as originally sized");
  assert.deepEqual(await hinge.locator("option").allTextContents(), ["As originally sized", "Full overlay", "Half overlay", "Inset"], "the three hinge types are offered");
  assert.equal(await clearance.isDisabled(), true, "and its clearance is not editable until a type is chosen");
  const original = await drawn(page);
  assert.deepEqual(original.slice(0, 2).map((door) => [door.x, door.width]), [[20, 385], [407, 385]], "its doors are the old ones");

  // ---- Each hinge type: elevation, parts, hinge hardware at once ------------
  const seen = {};
  for (const [type, label] of [["full", "Full overlay"], ["half", "Half overlay"], ["inset", "Inset"]]) {
    await hinge.selectOption(type);
    await page.waitForFunction((type) => window.__spec.doorSizing?.hinge === type, type);
    const rects = await drawn(page);
    const cut = await parts(page);
    seen[type] = { rects, cut };
    assert.equal(rects.length, 6, `${label}: six doors drawn`);
    assert.equal(await hinge.inputValue(), type, `${label}: the selector shows it`);
    for (let index = 1; index < rects.length; index += 1) {
      const gap = rects[index].x - (rects[index - 1].x + rects[index - 1].width);
      if (type === "inset") assert.ok(gap >= 5 - 0.06, `${label}: doors ${index} and ${index + 1} are at least 5 mm apart (${gap})`);
      else near(gap, 5, `${label}: doors ${index} and ${index + 1} are 5 mm apart`);
    }
    assert.ok(rects.every((rect) => cut.some((part) => Math.abs(part.width - rect.width) < 0.51 && Math.abs(part.length - rect.height) < 0.51)), `${label}: every door drawn is a door cut, at its size`);
    assert.deepEqual(await page.evaluate(() => window.__hinges()), [type === "full" ? "hinge-soft-close" : type === "half" ? "hinge-half-overlay" : "hinge-inset"], `${label}: the hinge ordered is its own`);
    await fitting.locator("[data-door-fitting-summary]").filter({ hasText: type === "inset" ? /flush with the carcass front, 5 mm apart/ : type === "half" ? /reaches 6\.5 mm over a side panel.*5 mm between doors/ : /cover 15\.5 mm of the side panel.*6\.5 mm of a shared divider.*5 mm between doors/ }).waitFor();
  }
  assert.ok(seen.full.rects[0].width > seen.half.rects[0].width && seen.half.rects[0].width > seen.inset.rects[0].width, "full > half > inset in width, drawn");
  assert.ok(seen.full.rects[0].height > seen.half.rects[0].height && seen.half.rects[0].height > seen.inset.rects[0].height, "and in height");
  near(seen.full.rects[0].x, 2.5, "full overlay: the first door is 2.5 mm from the cabinet's edge");
  near(seen.inset.rects[0].x, 18 + 5, "inset: the first door stands a clearance inside the side panel");
  near(seen.inset.rects[1].x - (seen.inset.rects[0].x + seen.inset.rects[0].width), 5, "inset: a pair is 5 mm apart");
  near(seen.inset.rects[2].x - (seen.inset.rects[1].x + seen.inset.rects[1].width), 2 * 5 + 18, "inset: doors either side of a divider are the board and a clearance each apart");
  assert.deepEqual([...new Set(seen.inset.cut.map((part) => part.z))], [0], "inset doors are placed flush with the carcass");
  assert.deepEqual([...new Set(seen.full.cut.map((part) => part.z))], [-18], "overlay doors stand proud");

  // ---- The gap between doors ------------------------------------------------
  await hinge.selectOption("full");
  await clearance.fill("8");
  await clearance.press("Enter");
  await page.waitForFunction(() => window.__spec.doorSizing?.clearance === 8);
  let rects = await drawn(page);
  for (let index = 1; index < rects.length; index += 1) near(rects[index].x - (rects[index - 1].x + rects[index - 1].width), 8, `with 8 mm, doors ${index} and ${index + 1} are 8 mm apart`);
  await clearance.fill("5");
  await clearance.press("Enter");
  await page.waitForFunction(() => window.__spec.doorSizing?.clearance === 5);

  // ---- 3D follows the hinge at once ------------------------------------------
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForFunction(() => window.__scenes?.size > 0 && window.__camera, null, { timeout: 20000 });
  await page.waitForFunction(() => { let found = 0; [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh) found += 1; }); return found > 20; }, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const proud = await depth(page);
  await hinge.selectOption("inset");
  await page.waitForFunction((was) => { const box = new window.THREE.Box3(); [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh && object.geometry?.type === "BoxGeometry") box.expandByObject(object); }); return Math.abs(box.max.z - box.min.z - (was - 0.018)) < 0.0006; }, proud, { timeout: 10000 });
  await hinge.selectOption("full");
  await page.waitForFunction((was) => { const box = new window.THREE.Box3(); [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh && object.geometry?.type === "BoxGeometry") box.expandByObject(object); }); return Math.abs(box.max.z - box.min.z - was) < 0.0006; }, proud, { timeout: 10000 });
  await page.getByRole("tab", { name: "Elevation" }).click();
  await selectDoor();

  // ---- By hand, then Reset to Auto under the hinge now chosen -----------------
  await hinge.selectOption("full");
  const leftLeaf = page.locator('[data-door="bay-1:0:0"] > rect');
  await leftLeaf.click({ position: { x: 20, y: 60 } });
  await leftLeaf.click({ position: { x: 20, y: 60 } });
  const width = page.getByLabel("Door width in mm");
  await width.waitFor();
  const fullWidth = Number(await width.inputValue());
  await width.fill("300");
  await width.press("Enter");
  await page.waitForFunction(() => window.__spec.cabinets[0].bays[0].doorOverrides?.length);
  assert.equal((await drawn(page))[0].width, 300, "a door typed to 300 is drawn at 300");
  assert.equal(await page.getByRole("button", { name: "Manual", exact: true }).getAttribute("aria-pressed"), "true", "and is Manual");
  await hinge.selectOption("half");
  await page.waitForFunction(() => window.__spec.doorSizing?.hinge === "half");
  assert.equal((await drawn(page))[0].width, 300, "it keeps its size when the hinge changes");
  await page.getByRole("button", { name: "Reset to Auto" }).click();
  await page.waitForFunction(() => !window.__spec.cabinets[0].bays.some((bay) => bay.doorOverrides));
  const reset = await drawn(page);
  assert.deepEqual(reset, seen.half.rects, "Reset to Auto gives the half overlay doors, not the full ones");
  assert.notEqual(reset[0].width, fullWidth, "which are not the full overlay width");
  await page.getByRole("button", { name: "Make Equal" }).waitFor();

  // ---- Saved and reopened -------------------------------------------------------
  await hinge.selectOption("inset");
  await clearance.fill("6");
  await clearance.press("Enter");
  await page.waitForFunction(() => window.__spec.doorSizing?.hinge === "inset" && window.__spec.doorSizing?.clearance === 6);
  const saved = await page.evaluate(() => JSON.stringify(window.__spec));
  const before = await drawn(page);
  await hinge.selectOption("full");
  await page.waitForFunction(() => window.__spec.doorSizing?.hinge === "full");
  assert.equal(await page.evaluate((json) => window.__reopen(json), saved), true, "the saved design reads back");
  await page.waitForFunction(() => window.__spec.doorSizing?.hinge === "inset");
  assert.equal(await hinge.inputValue(), "inset", "reopened: the hinge type is as saved");
  assert.equal(await clearance.inputValue(), "6", "and the clearance");
  assert.deepEqual(await drawn(page), before, "and the doors are the same");

  // ---- It fits a phone ------------------------------------------------------------
  const overflow = await page.evaluate(() => [...document.querySelectorAll("[data-door-fitting] *")].filter((node) => node.getBoundingClientRect().right > innerWidth + 1).length);
  assert.equal(overflow, 0, "nothing in the door fitting runs past a 390 px screen");
  assert.deepEqual(errors, [], "page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Berchuma hinge types in the editor: Full, Half and Inset change the elevation, 3D, parts and hinges at once; clearance, manual size, Make Equal, Reset to Auto and reopen keep the choice, at phone width");
