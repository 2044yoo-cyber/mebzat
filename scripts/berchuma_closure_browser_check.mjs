/**
 * Handleless doors and Smart Closure Panels, in the real editor at phone
 * width: choose a grip, see the handle leave the drawing and the grip mark
 * arrive; turn the panels on and see each one listed, drawn and cut; switch
 * one off, hide one, size one by hand; and look at it exploded and at its
 * joints in 3D. After each step what is drawn is checked against the parts.
 *
 *   npm run build && node scripts/berchuma_closure_browser_check.mjs
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

const out = mkdtempSync(join(tmpdir(), "berchuma_closure_"));
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
      __doors: () => buildParts(spec).parts.filter((part) => part.role === "door").reduce((total, part) => total + part.quantity, 0),
      __closures: () => buildParts(spec).parts.filter((part) => part.role === "closure").map((part) => ({ id: part.closure!.id, kind: part.closure!.kind, width: part.width, length: part.length, hidden: part.closure!.hidden })),
      __handles: () => buildParts(spec).hardware.filter((line) => line.hardware.id === "handle-bar").reduce((total, line) => total + line.quantity, 0),
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

const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(url);
  await page.waitForFunction(() => window.__spec);
  await page.getByRole("tab", { name: "Elevation" }).click();
  const doors = await page.evaluate(() => window.__doors());
  assert.equal(await page.locator("[data-door-handle-mark]").count(), doors, "a handle drawn on every door, to begin with");

  // ---- The section ---------------------------------------------------------
  const section = page.getByRole("region", { name: "Doors and closure panels" });
  await section.getByRole("button", { name: /Doors & closure panels/ }).click();
  const handleType = section.getByLabel("Handle type");
  assert.deepEqual(
    await handleType.locator("option").allTextContents(),
    ["Standard handle", "Handleless · push-to-open", "Integrated finger-pull groove", "Aluminium G-profile", "Aluminium J-profile", "Recessed handle channel", "Recessed / profile pull", "Finger-grip lip / reveal"],
    "every handle option, in order",
  );

  // ---- A channel: no handle drawn or ordered, the gap said ------------------
  await handleType.selectOption("channel");
  await page.waitForFunction(() => window.__spec.doorHardware?.grip === "channel");
  assert.equal(await page.locator("[data-door-handle-mark]").count(), 0, "no handle drawn on a channel door");
  assert.equal(await page.locator('[data-grip-mark="channel"]').count(), doors, "the channel drawn above every door");
  assert.equal(await page.evaluate(() => window.__handles()), 0, "and no handle ordered");
  await section.getByLabel("Finger-pull height in mm").waitFor();
  await section.getByRole("status", { name: "Closure panel warnings" }).filter({ hasText: /show the inside/ }).waitFor();
  assert.equal(await page.evaluate(() => window.__closures().length), 0, "nothing added with the panels off");

  // ---- Smart Closure Panels on ---------------------------------------------
  await section.getByRole("group", { name: "Smart Closure Panels" }).getByRole("button", { name: "ON" }).click();
  await page.waitForFunction(() => window.__closures().length > 0);
  const made = await page.evaluate(() => window.__closures());
  assert.equal(await section.locator("[data-closure-panel]").count(), made.length, "every panel listed");
  assert.equal(await page.locator("[data-closure]").count(), made.length, "and drawn in the elevation");
  assert.ok(made.every((panel) => panel.kind === "rail"), "a channel wardrobe's panels are finger-pull rails");
  assert.equal(await section.getByRole("status", { name: "Closure panel warnings" }).count(), 0, "and nothing is left showing");
  await section.getByLabel("Panel thickness").waitFor();

  // ---- One off, one hidden ----------------------------------------------------
  const first = made[0];
  await section.locator(`[data-closure-panel="${first.id}"]`).getByRole("checkbox").uncheck();
  await page.waitForFunction((count) => window.__closures().length === count - 1, made.length);
  assert.equal(await page.locator("[data-closure]").count(), made.length - 1, "a panel switched off leaves the drawing and the cut list");
  await section.locator(`[data-closure-panel="${first.id}"]`).getByRole("checkbox").check();
  const second = made[1];
  await section.locator(`[data-closure-panel="${second.id}"]`).getByRole("button", { name: /^Hide / }).click();
  await page.waitForFunction((id) => window.__closures().find((panel) => panel.id === id)?.hidden === true, second.id);
  assert.equal(await page.evaluate(() => window.__closures().length), made.length, "a hidden panel is still made");

  // ---- Sized by hand --------------------------------------------------------
  await section.getByRole("group", { name: "Closure panel sizing" }).getByRole("button", { name: "Manual" }).click();
  await section.locator(`[data-closure-panel="${first.id}"]`).getByRole("button", { pressed: false }).first().click();
  const width = section.getByLabel("Closure panel width in mm");
  await width.fill("500");
  await width.press("Enter");
  await page.waitForFunction((id) => window.__closures().find((panel) => panel.id === id)?.width === 500, first.id);
  await section.getByRole("button", { name: "Reset to automatic size" }).click();
  await page.waitForFunction(([id, size]) => window.__closures().find((panel) => panel.id === id)?.width === size, [first.id, first.width]);

  // ---- The 3D views -----------------------------------------------------------
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForFunction(() => window.__scenes?.size > 0 && window.__camera, null, { timeout: 20000 });
  const joins = () => page.evaluate(() => { let count = 0; [...window.__scenes].at(-1).traverse((object) => { if (object.name === "closure-join") count += 1; }); return count; });
  const meshes = () => page.evaluate(() => { let count = 0; [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh) count += 1; }); return count; });
  const depth = () => page.evaluate(() => { const box = new window.THREE.Box3(); [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh && object.geometry?.type === "BoxGeometry") box.expandByObject(object); }); return box.max.z - box.min.z; });
  assert.equal(await joins(), 0, "no joints drawn until asked for");
  // The hidden panel is not drawn: showing it again adds exactly its mesh.
  // Once the model is on screen and still.
  await page.waitForFunction(() => { let found = 0; [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh) found += 1; }); return found > 20; }, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const before = await meshes();
  await section.locator(`[data-closure-panel="${second.id}"]`).getByRole("button", { name: /^Show / }).click();
  await page.waitForFunction((count) => { let found = 0; [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh) found += 1; }); return found === count + 1; }, before, { timeout: 10000 });
  await page.getByRole("button", { name: "Joints" }).click();
  await page.waitForFunction((count) => { let found = 0; [...window.__scenes].at(-1).traverse((object) => { if (object.name === "closure-join") found += 1; }); return found === count; }, made.length, { timeout: 10000 });
  const assembled = await depth();
  await page.getByRole("button", { name: "Exploded" }).click();
  assert.equal(await page.getByRole("button", { name: "Exploded" }).getAttribute("aria-pressed"), "true", "the exploded view is on");
  await page.waitForFunction((size) => { const box = new window.THREE.Box3(); [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh && object.geometry?.type === "BoxGeometry") box.expandByObject(object); }); return box.max.z - box.min.z > size + 0.3; }, assembled, { timeout: 10000 });

  // ---- Back to handles ------------------------------------------------------
  await page.getByRole("tab", { name: "Elevation" }).click();
  await handleType.selectOption("handle");
  await page.waitForFunction(() => window.__closures().length === 0);
  assert.equal(await page.locator("[data-door-handle-mark]").count(), doors, "handles come back on every door");
  assert.equal(await page.evaluate(() => window.__handles()), doors, "and are ordered again");

  // ---- It fits a phone --------------------------------------------------------
  const overflow = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Doors and closure panels"] *')].filter((node) => node.getBoundingClientRect().right > innerWidth + 1).length);
  assert.equal(overflow, 0, "nothing in the section runs past a 390 px screen");

  assert.deepEqual(errors, [], "page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Berchuma handleless doors and closure panels in the editor: grips drawn and ordered, panels listed, drawn, switched off, hidden, sized and reset, joints and exploded view in 3D, at phone width");
