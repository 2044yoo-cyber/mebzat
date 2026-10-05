/**
 * Open displays and internal drawers, in the real editor at phone width:
 * a bay made an open display (no door, an oak board, a shelf LED), turned
 * into a partial opening and closed again; internal drawers behind full
 * doors that stay when the doors come off; open shelves added beside the
 * wardrobe; the recommendations and facade options with their previews; a
 * niche resized by its handle in the elevation; and the wardrobe setup's
 * design priority. After each step the drawing is checked against the parts.
 *
 *   npm run build && node scripts/berchuma_display_browser_check.mjs [screenshot-folder]
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

const out = mkdtempSync(join(tmpdir(), "berchuma_display_"));
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
import { WardrobeShapeSetup } from "@/features/berchuma-studio/components/wardrobe-shape-setup";
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
      __doors: () => buildParts(spec).parts.filter((part) => part.role === "door").map((part) => ({ id: part.id, bayId: part.bayId, width: part.width, length: part.length, quantity: part.quantity, placements: part.placements })),
      __parts: () => buildParts(spec).parts.map((part) => ({ id: part.id, role: part.role, label: part.label, board: part.board.id, bayId: part.bayId, cabinetId: part.cabinetId, internal: part.internal ?? false, quantity: part.quantity, size: part.size })),
    });
  }, [spec]);
  if (query.has("setup")) return <WardrobeShapeSetup onStart={(started) => Object.assign(window, { __started: started })} />;
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

const parts = (page) => page.evaluate(() => window.__parts());
const doorsOfBay = async (page, bayId) => (await page.evaluate(() => window.__doors())).filter((part) => part.bayId === bayId);
const bays = (page) => page.evaluate(() => window.__spec.cabinets[0].bays.map((bay) => ({ id: bay.id, width: bay.width, display: bay.display ?? null, fitting: bay.fitting, door: bay.door })));
const section = (page, index) => page.getByRole("group", { name: "Section type" }).nth(index);
/** Meshes in the 3D scene drawn in a colour, and the lit ones. */
const sceneLook = (page) => page.evaluate(() => {
  const scene = [...window.__scenes].at(-1);
  const colours = new Set();
  let lit = 0;
  scene.traverse((object) => {
    if (!object.isMesh || !object.material?.color) return;
    colours.add(`#${object.material.color.getHexString()}`);
    if (object.material.emissiveIntensity > 1) lit += 1;
  });
  return { colours: [...colours], lit };
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__spec && window.__scenes?.size > 0, null, { timeout: 20000 });
  const startDoors = await page.evaluate(() => window.__doors());
  await page.getByRole("button", { name: "Wardrobe", exact: true }).click();

  // ---- A bay as an open display: no door, oak, lit --------------------------
  await section(page, 2).getByRole("button", { name: "Open Display" }).click();
  await page.getByRole("group", { name: "Display type" }).waitFor();
  assert.equal(await page.getByRole("group", { name: "Display type" }).getByRole("button", { name: "Center Niche" }).getAttribute("aria-pressed"), "true", "the bay is now a centre niche, and selected");
  assert.deepEqual(await doorsOfBay(page, "bay-3"), [], "no door is made over the open display");
  await page.locator('select[aria-label="Material"]').selectOption("mdf-18-oak");
  await page.getByRole("button", { name: "Shelf LED" }).click();
  await page.waitForFunction(() => window.__parts().some((part) => part.role === "led"));
  let all = await parts(page);
  assert.ok(all.filter((part) => part.bayId === "bay-3" && part.role === "shelf").every((part) => part.board === "mdf-18-oak"), "its shelves are oak on the cut list");
  assert.equal(all.find((part) => part.role === "led")?.quantity, 5, "an LED strip under each of its five shelves");
  await page.waitForTimeout(800);
  const look = await sceneLook(page);
  assert.ok(look.colours.includes("#b88757"), `the 3D shows the oak (${look.colours.join(" ")})`);
  assert.ok(look.lit >= 1, "and the strip lit");
  if (shots) { await page.locator("canvas").scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await page.screenshot({ path: join(shots, "display_niche_3d.png") }); }

  // Partial opening, then closed again: the doors come back exactly.
  await page.getByRole("group", { name: "Display type" }).getByRole("button", { name: "Partial Opening" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].bays[2].fitting.kind === "stack");
  const partialDoors = await doorsOfBay(page, "bay-3");
  assert.equal(new Set(partialDoors.map((part) => part.id)).size, 2, "a partial opening: doors above it and doors below");
  await page.getByRole("button", { name: "Closed door" }).click();
  await page.waitForFunction(() => !window.__spec.cabinets[0].bays[2].fitting.sections?.some((section) => section.kind === "display"));
  assert.equal((await doorsOfBay(page, "bay-3")).length > 0, true, "closed again: the bay has its doors");
  await section(page, 2).getByRole("button", { name: "Shelves" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].bays[2].fitting.kind === "shelves");
  assert.deepEqual((await page.evaluate(() => window.__doors())).filter((part) => part.bayId === "bay-3"), startDoors.filter((part) => part.bayId === "bay-3"), "and they are the doors it started with");

  // ---- Internal drawers behind full doors -----------------------------------
  await section(page, 0).getByRole("button", { name: "Internal Drawers" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].bays[0].fitting.internal === true);
  all = await parts(page);
  assert.equal(all.filter((part) => part.bayId === "bay-1" && part.role === "drawer_front" && !part.internal).length, 0, "no drawer front on the face");
  const innerFronts = all.filter((part) => part.bayId === "bay-1" && part.role === "drawer_front" && part.internal);
  assert.ok(innerFronts.length >= 1, "inner fronts behind the doors");
  assert.ok((await doorsOfBay(page, "bay-1")).length > 0, "and the doors stay in front of them");
  const innerBox = (page, front) => page.evaluate((front) => {
    let found = 0;
    [...window.__scenes].at(-1).traverse((object) => {
      const box = object.geometry?.parameters;
      if (object.isMesh && box && Math.abs(box.width - front.size.x / 1000) < 1e-6 && Math.abs(box.height - front.size.y / 1000) < 1e-6 && Math.abs(box.depth - front.size.z / 1000) < 1e-6) found += 1;
    });
    return found;
  }, front);
  assert.ok(await innerBox(page, innerFronts[0]) >= 1, "the inner fronts are in the 3D model");
  await page.getByText("Show inside").click();
  await page.waitForTimeout(600);
  assert.ok(await innerBox(page, innerFronts[0]) >= 1, "Show Inside takes the doors off and keeps the inner fronts");
  assert.equal((await page.evaluate(() => { let n = 0; [...window.__scenes].at(-1).traverse((o) => { if (o.isMesh && Math.abs((o.geometry?.parameters?.depth ?? 0) - 0.018) < 1e-6 && Math.abs((o.geometry?.parameters?.height ?? 0) - 2.296) < 1e-6) n += 1; }); return n; })), 0, "with the doors off");
  if (shots) { await page.locator("canvas").scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await page.screenshot({ path: join(shots, "display_internal_inside.png") }); }
  await page.getByText("Show inside").click();

  // ---- + Add Side Display ---------------------------------------------------
  await page.getByRole("button", { name: "Wardrobe", exact: true }).click();
  await page.getByRole("button", { name: "Add Side Display" }).click();
  const adder = page.getByLabel("Add side display");
  await adder.getByRole("button", { name: "Left" }).click();
  await adder.getByLabel("Width in mm").fill("450");
  await adder.getByLabel("Width in mm").press("Enter");
  await adder.getByLabel("Shelf count in units").fill("6");
  await adder.getByLabel("Shelf count in units").press("Enter");
  await adder.getByRole("button", { name: "Add" }).click();
  await page.waitForFunction(() => window.__spec.cabinets.length === 2);
  const placed = await page.evaluate(() => window.__spec.cabinets.map((cabinet) => ({ id: cabinet.id, offset: cabinet.offset, width: cabinet.size.width, side: cabinet.bays[0].display?.side ?? null })));
  assert.deepEqual(placed.map((entry) => [entry.offset, entry.width, entry.side]).sort(), [[0, 450, "left"], [450, 2400, null]].sort(), "open shelves on the left, the wardrobe moved along beside them");
  assert.equal(await page.getByRole("group", { name: "Display type" }).getByRole("button", { name: "Side Shelves" }).getAttribute("aria-pressed"), "true", "the new unit is selected as a side display");
  all = await parts(page);
  const sideId = placed.find((entry) => entry.side)?.id;
  assert.equal(all.filter((part) => part.cabinetId === sideId && part.role === "shelf").reduce((sum, part) => sum + part.quantity, 0), 6, "six shelves cut for it");
  assert.equal(all.filter((part) => part.cabinetId === sideId && part.role === "door").length, 0, "and no door");
  if (shots) { await page.locator("canvas").scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await page.screenshot({ path: join(shots, "display_side_3d.png") }); }
  await page.getByRole("region", { name: "Open display", exact: true }).getByRole("button", { name: "Delete" }).click();
  await page.waitForFunction(() => window.__spec.cabinets.length === 1 && window.__spec.cabinets[0].offset === 0);

  // ---- Ideas: priority, a recommendation with its preview, facade options ----
  await page.getByRole("button", { name: "Wardrobe", exact: true }).click();
  const ideas = page.getByRole("button", { name: "Open display ideas" });
  if ((await ideas.getAttribute("aria-expanded")) !== "true") await ideas.click();
  await page.getByRole("button", { name: "Decorative", exact: true }).click();
  const card = page.getByRole("region", { name: "Recommendation" });
  await card.waitFor();
  const first = await card.locator("p").first().textContent();
  assert.ok(await card.getByLabel("Preview").locator("svg").count() === 1, "the recommendation shows a preview before applying");
  await card.getByRole("button", { name: "Try another" }).click();
  assert.notEqual(await card.locator("p").first().textContent(), first, "Try another shows another idea");
  const options = page.locator("button", { hasText: /Option \d/ });
  assert.ok(await options.count() >= 3, "facade options to choose from");
  assert.equal(await options.first().locator("svg").count(), 1, "each with a preview");
  await card.getByRole("button", { name: "No thanks" }).click();
  assert.equal(await card.count(), 0, "No thanks puts it away");
  assert.equal((await bays(page)).some((bay) => bay.display), false, "and nothing was applied");
  await page.locator("button", { hasText: "Centre open niche" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].bays.some((bay) => bay.display?.style === "niche"));
  const niche = (await bays(page)).find((bay) => bay.display);
  assert.equal(niche.display.boardId, "mdf-18-white", "a decorative niche in an accent board, white against the walnut");

  // ---- Elevation: tap the niche, pull its edge, snap ------------------------
  await page.getByRole("tab", { name: "Elevation" }).click();
  const nicheRect = page.locator(`[data-display="${niche.id}"]`);
  await nicheRect.waitFor();
  await page.locator("svg[role=img]").first().scrollIntoViewIfNeeded();
  await nicheRect.click({ position: { x: 10, y: 40 } });
  await page.locator("[data-door-handle]").first().waitFor();
  assert.deepEqual(await page.locator("[data-door-handle]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-door-handle"))), ["left", "right"], "a niche has handles on its two sides");
  const scale = await page.evaluate(() => document.querySelector("svg[role=img]").getScreenCTM().a);
  await page.locator("svg[role=img]").first().scrollIntoViewIfNeeded();
  const grip = await page.locator('[data-door-handle="right"]').boundingBox();
  const at = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 60 * scale, at.y, { steps: 6 });
  const label = await page.locator("svg text").filter({ hasText: /← \d+ mm →/ }).textContent();
  assert.match(label, /^← \d+ mm →$/, `its width is shown while it is pulled (${label})`);
  await page.mouse.up();
  const after = (await bays(page)).find((bay) => bay.id === niche.id);
  // Snap is on: the edge lands within the snap distance of where it was let go.
  assert.ok(Math.abs(after.width - (niche.width + 60)) <= 25, `pulled 60 mm wider: ${niche.width} → ${after.width}`);
  if (shots) await page.screenshot({ path: join(shots, "display_niche_elevation.png") });

  // ---- The wardrobe setup's design priority ----------------------------------
  await page.goto(`${url}?setup`);
  await page.getByRole("button", { name: "Decorative" }).click();
  await page.getByText("Left end").locator("select").selectOption("open");
  await page.getByRole("button", { name: /Start with a straight wardrobe/ }).click();
  const started = await page.evaluate(() => window.__started);
  assert.deepEqual(started.wardrobePlan, { priority: "decorative", leftEnd: "open", rightEnd: "wall" }, "the setup records the priority and which end is open");
  assert.equal(started.cabinets.some((cabinet) => cabinet.bays.some((bay) => bay.display)), false, "and adds no display by itself");

  assert.deepEqual(errors, [], "page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Berchuma open displays in the editor: a bay made an open niche (oak, LED, no door), a partial opening, closed again; internal drawers behind full doors; side shelves added; ideas with previews; a niche pulled wider in the elevation; the setup's design priority");
