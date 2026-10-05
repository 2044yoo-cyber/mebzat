/**
 * Doors sized by hand, in the real editor: tap a cabinet, tap its door, type a
 * width, pull an edge with snap off and on, Make Equal, Reset to Auto — in the
 * elevation and in 3D, at phone width. After each step the door that is drawn
 * is checked against the part the cut list cuts.
 *
 *   npm run build && node scripts/berchuma_doors_browser_check.mjs [screenshot-folder]
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

const out = mkdtempSync(join(tmpdir(), "berchuma_doors_"));
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
import { validateSpec } from "@/features/berchuma-studio/types/spec";
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
      __doors: () => buildParts(spec).parts.filter((part) => part.role === "door").map((part) => ({ id: part.id, width: part.width, length: part.length, quantity: part.quantity, placements: part.placements })),
    });
  }, [spec]);
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

/** The leaf's rectangle as the elevation draws it, and the cut-list part it is. */
const elevationDoor = (page, key) => page.evaluate((key) => {
  const rect = document.querySelector(`[data-door="${key}"] > rect`);
  return rect ? { width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")), x: Number(rect.getAttribute("x")) } : null;
}, key);
const doorParts = (page) => page.evaluate(() => window.__doors());
const overrides = (page) => page.evaluate(() => window.__spec.cabinets.flatMap((cabinet) => cabinet.bays.flatMap((bay) => (bay.doorOverrides ?? []).map((entry) => ({ bay: bay.id, ...entry })))));
/** Pixels per millimetre of the elevation drawing. */
const pxPerMm = (page) => page.evaluate(() => document.querySelector("svg[role=img]").getScreenCTM().a);
// The panel is under the drawing on a phone; the drawing is brought back into
// view before an edge is pulled, as a person scrolling back up would.
const centreOf = async (locator) => { await locator.page().locator("svg[role=img]").scrollIntoViewIfNeeded(); const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__spec, null, { timeout: 20000 });
  const autoParts = await doorParts(page);

  // ---- Elevation -----------------------------------------------------------
  await page.getByRole("tab", { name: "Elevation" }).click();
  const leftLeaf = page.locator('[data-door="bay-1:0:0"] > rect');
  await leftLeaf.waitFor();
  await leftLeaf.click({ position: { x: 20, y: 60 } });
  assert.equal(await page.getByRole("button", { name: "Make Equal" }).count(), 0, "the first tap selects the cabinet, not a door");
  await leftLeaf.click({ position: { x: 20, y: 60 } });
  const width = page.getByLabel("Door width in mm");
  await width.waitFor();
  assert.equal(await width.inputValue(), "385", "the second tap selects the door: its width, 385");
  assert.equal(await page.getByLabel("Door height in mm").inputValue(), "2296", "and its height");
  assert.equal(await page.getByRole("button", { name: "Auto", exact: true }).getAttribute("aria-pressed"), "true", "sized automatically to begin with");
  assert.equal(await page.locator("[data-door-handle]").count(), 4, "a handle on each edge of the selected door");
  if (shots) await page.screenshot({ path: join(shots, "doors_selected.png") });

  // Typed.
  await width.fill("300");
  await width.press("Enter");
  await page.waitForFunction(() => window.__spec.cabinets[0].bays[0].doorOverrides?.length);
  assert.equal((await elevationDoor(page, "bay-1:0:0")).width, 300, "the elevation draws the door at 300");
  let parts = await doorParts(page);
  const typed = parts.find((part) => part.id === "wardrobe/bay-1-door-leaf-0");
  assert.deepEqual([typed?.width, typed?.length, typed?.quantity], [300, 2296, 1], "and the cut list cuts it at 300");
  assert.equal(await page.getByRole("button", { name: "Manual", exact: true }).getAttribute("aria-pressed"), "true", "the door is Manual now");

  // Refused, with a reason, and nothing changes.
  const before = await overrides(page);
  await width.fill("50");
  await width.press("Enter");
  await page.getByRole("alert").filter({ hasText: "at least 100" }).waitFor();
  assert.deepEqual(await overrides(page), before, "a 50 mm door is refused and the design is unchanged");

  // Make Equal.
  await page.getByRole("button", { name: "Make Equal" }).click();
  await page.waitForFunction(() => window.__doors().filter((part) => part.id.startsWith("wardrobe/bay-1-door")).every((part) => part.width === 385));
  assert.equal((await elevationDoor(page, "bay-1:0:1")).width, 385, "Make Equal: both leaves 385 again, drawn and cut");

  // Dragged, snap off: goes where it is put.
  await page.getByRole("button", { name: "Snap door edges" }).click();
  assert.equal(await page.getByRole("button", { name: "Snap door edges" }).textContent(), "OFF");
  const scale = await pxPerMm(page);
  let handle = await centreOf(page.locator('[data-door-handle="right"]'));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 2, handle.y);
  assert.deepEqual(await elevationDoor(page, "bay-1:0:0"), { width: 385, height: 2296, x: 20 }, "a press that barely moves is not a resize");
  await page.mouse.move(handle.x - 50 * scale, handle.y, { steps: 6 });
  const label = await page.locator("svg text").filter({ hasText: /← \d+ mm →/ }).textContent();
  assert.match(label, /^← 3[34]\d mm →$/, `the size is written across the door while it is pulled (${label})`);
  if (shots) await page.screenshot({ path: join(shots, "doors_dragging.png") });
  await page.mouse.up();
  let dragged = await elevationDoor(page, "bay-1:0:0");
  assert.ok(Math.abs(dragged.width - 335) <= 2, `pulled 50 mm in, snap off: about 335 (${dragged.width})`);
  parts = await doorParts(page);
  assert.equal(parts.find((part) => part.id === "wardrobe/bay-1-door-leaf-0").width, dragged.width, "the cut list cuts what was dragged");

  // Snap on: an edge let go 3 mm short of the door gap lands on it.
  await page.getByRole("button", { name: "Snap door edges" }).click();
  handle = await centreOf(page.locator('[data-door-handle="right"]'));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + (405 - 3 - (20 + dragged.width)) * scale, handle.y, { steps: 6 });
  await page.mouse.up();
  dragged = await elevationDoor(page, "bay-1:0:0");
  assert.equal(dragged.width, 385, "snapped to a door gap short of the other leaf");

  // Pulled into the other leaf: it gives way, a gap clear.
  handle = await centreOf(page.locator('[data-door-handle="right"]'));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 80 * scale, handle.y, { steps: 6 });
  await page.mouse.up();
  const pushedLeft = await elevationDoor(page, "bay-1:0:0");
  const pushedRight = await elevationDoor(page, "bay-1:0:1");
  assert.ok(Math.abs(pushedRight.x - (pushedLeft.x + pushedLeft.width + 2)) < 0.01, "the other leaf's meeting edge moved with it, the gap kept");
  parts = await doorParts(page);
  assert.equal(parts.find((part) => part.id === "wardrobe/bay-1-door-leaf-1").width, pushedRight.width, "and is cut at its new width");

  // Reset to Auto.
  await page.getByRole("button", { name: "Reset to Auto" }).click();
  await page.waitForFunction(() => !window.__spec.cabinets[0].bays.some((bay) => bay.doorOverrides));
  assert.deepEqual(await doorParts(page), autoParts, "Reset to Auto gives back exactly the automatic doors");
  await page.getByRole("button", { name: "Done" }).click();
  assert.equal(await page.locator("[data-door-handle]").count(), 0, "Done lets go of the door");

  // ---- 3D --------------------------------------------------------------------
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForFunction(() => window.__scenes?.size > 0 && window.__camera, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  /** Where a point in the scene is on the page. */
  const onScreen = (page, find) => page.evaluate((find) => {
    const scene = [...window.__scenes].at(-1);
    const canvas = document.querySelector("canvas");
    canvas.scrollIntoView({ block: "nearest" });
    const box = canvas.getBoundingClientRect();
    const object = find.name ? scene.getObjectByName(find.name) : null;
    const point = object ? object.getWorldPosition(new window.THREE.Vector3()) : new window.THREE.Vector3(...find.point);
    if (find.offset) point.add(new window.THREE.Vector3(...find.offset));
    const ndc = point.clone().project(window.__camera);
    return { x: box.left + (ndc.x + 1) / 2 * box.width, y: box.top + (1 - ndc.y) / 2 * box.height };
  }, find);
  // The left leaf's centre, from its part, in scene metres (the model is centred on the design).
  const leaf = autoParts.find((part) => part.id === "wardrobe/bay-1-door");
  const leafCentre = [(leaf.placements[0].x + leaf.width / 2 - 1200) / 1000, (leaf.placements[0].y + leaf.length / 2) / 1000, 0.32];
  let at = await onScreen(page, { point: leafCentre });
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(400);
  at = await onScreen(page, { point: leafCentre });
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => [...window.__scenes].at(-1).getObjectByName("door-handles"), null, { timeout: 5000 });
  assert.equal(await page.getByLabel("Door width in mm").inputValue(), "385", "in 3D too: tap the cabinet, then its door");
  if (shots) await page.screenshot({ path: join(shots, "doors_3d_selected.png") });
  // The canvas renders on demand: give the new handles a frame before they
  // are pressed, as a person's reaction time always does.
  await page.waitForTimeout(400);
  const grip = await onScreen(page, { name: "door-handle-right" });
  await page.mouse.move(grip.x, grip.y);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(150);
  // 50 mm to the left of the edge, on screen.
  const target = await onScreen(page, { name: "door-handle-right", offset: [-0.05, 0, 0] });
  await page.mouse.move(target.x, target.y, { steps: 8 });
  const sprite = await page.evaluate(() => [...window.__scenes].at(-1).getObjectByName("door-handles").children.some((child) => child.type === "Sprite"));
  assert.ok(sprite, "the size is shown while the 3D edge is pulled");
  if (shots) await page.screenshot({ path: join(shots, "doors_3d_dragging.png") });
  await page.mouse.up();
  assert.deepEqual((await overrides(page)).map((entry) => [entry.bay, entry.leaf]), [["bay-1", 0]], "only the door whose edge was pulled changed");
  const width3d = Number(await page.getByLabel("Door width in mm").inputValue());
  assert.ok(Math.abs(width3d - 335) <= 1, `the edge follows the pointer: pulled 50 mm in, the door is 335 (${width3d})`);
  parts = await doorParts(page);
  assert.equal(Math.round(parts.find((part) => part.id === "wardrobe/bay-1-door-leaf-0").width), width3d, "and the cut list cuts that width");
  const mesh = await page.evaluate(() => {
    const scene = [...window.__scenes].at(-1);
    let found = null;
    scene.traverse((object) => { if (object.isMesh && object.geometry?.type === "BoxGeometry" && Math.abs(object.geometry.parameters.height - 2.296) < 1e-6 && Math.abs(object.geometry.parameters.depth - 0.018) < 1e-6 && Math.abs(object.geometry.parameters.width * 1000 - window.__doors().find((part) => part.id === "wardrobe/bay-1-door-leaf-0").width) < 0.01) found = object.geometry.parameters.width * 1000; });
    return found;
  });
  assert.ok(mesh !== null, "the 3D door is a box of the width the cut list cuts");

  // A longer pull, on the other edge: still under the pointer, millimetre for millimetre.
  await page.waitForTimeout(400);
  const leftGrip = await onScreen(page, { name: "door-handle-left" });
  const leftTarget = await onScreen(page, { name: "door-handle-left", offset: [0.1, 0, 0] });
  await page.mouse.move(leftGrip.x, leftGrip.y);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(leftTarget.x, leftTarget.y, { steps: 8 });
  await page.mouse.up();
  const pulled = (await overrides(page)).find((entry) => entry.bay === "bay-1" && entry.leaf === 0);
  assert.ok(Math.abs(pulled.x - 120) <= 1 && Math.abs(pulled.x + pulled.width - (20 + width3d)) < 0.01, `the left edge pulled 100 mm in lands at 120, the right edge staying (${pulled.x})`);

  // The right leaf of an automatic pair — one part, cut twice — is its own door to tap.
  await page.waitForTimeout(300);
  const rightLeaf = await onScreen(page, { point: [(1995 + 385 / 2 - 1200) / 1000, (leaf.placements[0].y + leaf.length / 2) / 1000, 0.32] });
  await page.mouse.click(rightLeaf.x, rightLeaf.y);
  await page.getByText(/leaf 2 of 2/).waitFor({ timeout: 5000 });

  // ---- A kitchen wall unit, typed ---------------------------------------------
  await page.goto(`${url}?design=kitchen`);
  await page.waitForFunction(() => window.__spec);
  await page.getByRole("tab", { name: "Elevation" }).click();
  const wallLeaf = page.locator('[data-door="bay-13:0:0"] > rect');
  await wallLeaf.click({ position: { x: 20, y: 40 } });
  await wallLeaf.click({ position: { x: 20, y: 40 } });
  await page.getByLabel("Door height in mm").fill("500");
  await page.getByLabel("Door height in mm").press("Enter");
  await page.waitForFunction(() => window.__doors().some((part) => part.id === "wall-14/bay-13-door-leaf-0" && part.length === 500));
  assert.equal((await elevationDoor(page, "bay-13:0:0")).height, 500, "a kitchen wall unit's door, typed to 500 high, drawn and cut at 500");

  assert.deepEqual(errors, [], "page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Berchuma doors in the editor: tap to select, typed and dragged sizes (snap off and on), Make Equal, Reset to Auto, in the elevation and in 3D — drawn and cut the same");
