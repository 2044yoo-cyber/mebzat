/**
 * Transport modules in the real editor, at phone width: a new 2400 wardrobe
 * made 1600 + 800, its modules listed and named on the elevation; a joint
 * tapped, dragged with its live widths, typed and locked; a top cabinet
 * added with its joints over the wardrobe's; the module names shown in 3D
 * only with the fronts off; a saved wardrobe divided when asked; a narrow
 * last module warned about and kept; a small wardrobe divided by hand.
 *
 *   npm run build && node scripts/berchuma_transport_browser_check.mjs [screenshot-folder]
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

const out = mkdtempSync(join(tmpdir(), "berchuma_transport_"));
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
const design = query.get("design");
const start = design === "legacy" ? validateSpec(wardrobeExample()).spec : startingDesign("wardrobe", { width: Number(query.get("width") ?? 2400) });
function App() {
  const [spec, setSpec] = useState(start);
  useEffect(() => {
    Object.assign(window, {
      __changes: ((window as unknown as { __changes?: number }).__changes ?? -1) + 1,
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

const modules = (page, index = 0) => page.evaluate((index) => {
  const cabinet = window.__spec.cabinets[index];
  const joints = (cabinet.transport?.joints ?? []).map((joint) => joint.at);
  const edges = [0, ...joints, cabinet.size.width];
  return edges.slice(1).map((edge, at) => Math.round(edge - edges[at]));
}, index);
const panel = (page) => page.getByRole("region", { name: "Transport modules" });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__spec && window.__scenes?.size > 0, null, { timeout: 20000 });
  assert.deepEqual(await modules(page), [1600, 800], "a new 2400 wardrobe is 1600 + 800");
  await page.getByRole("button", { name: "Wardrobe", exact: true }).first().click().catch(async () => { await page.locator("button", { hasText: /Wardrobe|Tall/ }).first().click(); });
  const cabinetButton = page.getByRole("region", { name: "Cabinet" }).locator("button").first();
  if (await cabinetButton.count()) await cabinetButton.click();
  await panel(page).waitFor();
  const listed = await panel(page).getByRole("list", { name: "Modules" }).textContent();
  assert.match(listed, /Module 1\s*1600 mm.*Module 2\s*800 mm/s, `the panel lists the modules (${listed})`);

  // ---- 3D: the names only with the fronts off --------------------------------
  const labelCount = () => page.evaluate(() => [...window.__scenes].at(-1).getObjectByName("module-labels")?.children.length ?? 0);
  await page.waitForTimeout(500);
  assert.equal(await labelCount(), 0, "the exterior 3D view is not cluttered with module names");
  await page.getByText("Show inside").click();
  await page.waitForTimeout(600);
  assert.equal(await labelCount(), 2, "Show inside names both modules");
  if (shots) { await page.locator("canvas").scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, "transport_inside.png") }); }
  await page.getByText("Show inside").click();

  // ---- Elevation: names, a joint tapped and dragged ------------------------------
  await page.getByRole("tab", { name: "Elevation" }).click();
  const svg = page.locator("svg[role=img]").first();
  await svg.waitFor();
  assert.ok(await svg.locator("text", { hasText: "Module 1 — 1600" }).count() === 1 && await svg.locator("text", { hasText: "Module 2 — 800" }).count() === 1, "the elevation names each module with its width");
  await svg.scrollIntoViewIfNeeded();
  await page.locator('[data-transport-joint="0"]').click({ position: { x: 3, y: 60 } });
  const jointPanel = page.getByRole("region", { name: "Module joint" });
  await jointPanel.waitFor();
  assert.equal(await jointPanel.getByLabel("Joint 1 position in mm").inputValue(), "1600", "the joint, tapped: Position 1600");
  assert.match(await jointPanel.textContent(), /Left module 1600 mm · Right module 800 mm/, "with the modules either side");
  const scale = await page.evaluate(() => document.querySelector("svg[role=img]").getScreenCTM().a);
  await svg.scrollIntoViewIfNeeded();
  const grip = await page.locator('[data-joint-handle="0"]').boundingBox();
  const at = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(at.x, at.y);
  const changesBefore = await page.evaluate(() => window.__changes);
  await page.mouse.down();
  await page.mouse.move(at.x + 2, at.y);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__changes), changesBefore, "a press that barely moves is not a drag: nothing changed");
  await page.mouse.move(at.x - 137 * scale, at.y, { steps: 8 });
  const live = await svg.locator("text").filter({ hasText: /^\d+ \| \d+$/ }).textContent();
  assert.match(live, /^14\d\d \| 9\d\d$/, `the widths either side are shown while it is dragged (${live})`);
  if (shots) await page.screenshot({ path: join(shots, "transport_drag.png") });
  await page.mouse.up();
  const dragged = await modules(page);
  assert.ok(Math.abs(dragged[0] - 1463) <= 25 && dragged[0] + dragged[1] === 2400, `dragged left: ${dragged.join(" + ")}`);
  await jointPanel.getByLabel("Joint 1 position in mm").fill("1400");
  await jointPanel.getByLabel("Joint 1 position in mm").press("Enter");
  await page.waitForFunction(() => window.__spec.cabinets[0].transport.joints[0].at === 1400);
  assert.match(await jointPanel.textContent(), /Left module 1400 mm · Right module 1000 mm/, "typed 1400: 1400 + 1000");
  const sides = await page.evaluate(() => window.__parts().filter((part) => part.role === "gable" && part.cabinetId === window.__spec.cabinets[0].id).map((part) => part.label).sort());
  assert.deepEqual(sides, ["Base module 1 — left side", "Base module 1 — right side", "Base module 2 — left side", "Base module 2 — right side"], "the double wall moved with it: real side panels");
  await jointPanel.getByRole("button", { name: "Lock" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].transport.joints[0].locked === true);
  assert.equal(await page.locator('[data-joint-handle="0"]').count(), 0, "a locked joint has no handle");
  assert.equal(await jointPanel.getByLabel("Joint 1 position in mm").isDisabled(), true, "and its position cannot be typed");
  await jointPanel.getByRole("button", { name: "Locked" }).click();
  await jointPanel.getByRole("button", { name: "Done" }).click();

  // ---- A top cabinet: its own modules, aligned ------------------------------------
  await page.getByRole("button", { name: "Add 700 mm" }).click();
  await page.waitForFunction(() => window.__spec.cabinets.length === 2);
  assert.deepEqual(await modules(page, 1), [1400, 1000], "the top cabinet's joint is over the wardrobe's");
  assert.ok(await svg.locator("text", { hasText: "Top module 1 — 1400" }).count() === 1, "and named as top modules");
  await page.getByRole("button", { name: "Wardrobe", exact: true }).first().click().catch(() => undefined);
  await panel(page).getByRole("button", { name: "Align Top Modules" }).waitFor();
  assert.equal(await panel(page).getByRole("button", { name: "Align Top Modules" }).getAttribute("aria-pressed"), "true", "Align Top Modules is on");
  await panel(page).getByLabel("Joint 1 position in mm").fill("1600");
  await panel(page).getByLabel("Joint 1 position in mm").press("Enter");
  await page.waitForFunction(() => window.__spec.cabinets[1].transport.joints[0].at === 1600);
  assert.deepEqual([await modules(page, 0), await modules(page, 1)], [[1600, 800], [1600, 800]], "moving the base joint moves the top's");
  if (shots) { await svg.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, "transport_top.png") }); }

  // ---- A saved wardrobe, divided when asked ------------------------------------
  await page.goto(`${url}?design=legacy`);
  await page.waitForFunction(() => window.__spec);
  assert.deepEqual(await modules(page), [2400], "a saved wardrobe opens as one carcass");
  await page.getByRole("button", { name: "Wardrobe", exact: true }).click();
  await panel(page).getByRole("button", { name: "Divide 1600 + 800" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].transport?.joints.length === 1);
  assert.deepEqual(await modules(page), [1600, 800], "Divide 1600 + 800");

  // ---- A narrow last module: warned, kept ---------------------------------------
  await page.goto(`${url}?width=2000`);
  await page.waitForFunction(() => window.__spec);
  await page.locator("button", { hasText: /^Wardrobe/ }).first().click().catch(() => undefined);
  const cabinetName = await page.evaluate(() => window.__spec.cabinets[0].label);
  await page.getByRole("button", { name: cabinetName, exact: true }).click();
  const warning = panel(page).getByRole("alert");
  await warning.waitFor();
  assert.equal((await warning.locator("p").textContent()).trim(), "Final module is only 400 mm wide.", "a 400 mm last module is warned about");
  assert.deepEqual(await modules(page), [1600, 400], "and left as it is");
  await warning.getByRole("button", { name: "Keep 1600 + 400" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].transport.joints[0].locked === true);
  assert.equal(await panel(page).getByRole("alert").count(), 0, "Keep: not said again");

  // ---- A small wardrobe, divided by hand -------------------------------------------
  await page.goto(`${url}?width=1500`);
  await page.waitForFunction(() => window.__spec);
  const smallName = await page.evaluate(() => window.__spec.cabinets[0].label);
  await page.getByRole("button", { name: smallName, exact: true }).click();
  assert.deepEqual(await modules(page), [1500], "1500 is one module");
  // One module, nothing to decide: the panel starts closed, the option under its heading.
  const heading = panel(page).getByRole("button", { name: "Transport modules" });
  assert.equal(await heading.getAttribute("aria-expanded"), "false", "a one-module wardrobe does not open the panel");
  await heading.click();
  await panel(page).getByRole("button", { name: "Divide for Transport" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].transport?.joints.length === 1);
  await panel(page).getByLabel("Joint 1 position in mm").fill("900");
  await panel(page).getByLabel("Joint 1 position in mm").press("Enter");
  await page.waitForFunction(() => window.__spec.cabinets[0].transport.joints[0].at === 900);
  assert.deepEqual(await modules(page), [900, 600], "divided by hand: 900 + 600");

  assert.deepEqual(errors, [], "page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Berchuma transport modules in the editor: 1600 + 800 listed and named; a joint tapped, dragged with live widths, typed and locked; the top cabinet aligned; names in 3D only inside; a saved wardrobe divided; a narrow module kept; 900 + 600 by hand");
