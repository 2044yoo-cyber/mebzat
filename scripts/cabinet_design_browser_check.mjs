/**
 * Cabinet Design in a real browser, at phone width and at desktop width.
 *
 * The start steps walked through as somebody would: a wardrobe typed to a
 * measured space (with a decimal, and the lock tried), its layout, a template
 * card, a material, and the design that comes out checked against what was
 * chosen; a kitchen from a template preset with its material; a template
 * opened from the gallery. Then the editor: Model and Material view, the
 * selected cabinet's quick actions, a decimal width, and a joint put back to
 * the recommended 1600 mm rule.
 *
 *   npm run build && node scripts/cabinet_design_browser_check.mjs [screenshot-folder]
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

const out = mkdtempSync(join(tmpdir(), "cabinet_design_"));
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
import { CabinetStart } from "@/features/berchuma-studio/components/cabinet-start";
import { DesignEditor } from "@/features/berchuma-studio/components/editor/design-editor";
import { divideForTransport } from "@/features/berchuma-studio/services/operations";
import { startingDesign } from "@/features/berchuma-studio/services/starting-designs";
const scenes = new Set<THREE.Scene>();
THREE.Scene.prototype.onBeforeRender = function () { scenes.add(this); };
Object.assign(window, { __scenes: scenes, THREE });
const query = new URLSearchParams(location.search);
const fresh = startingDesign("wardrobe", { width: 2400 });
const start = query.get("design") === "moved" ? divideForTransport(fresh, fresh.cabinets[0]!.id, [1200]) : fresh;
function App() {
  const [spec, setSpec] = useState(start);
  useEffect(() => { Object.assign(window, { __spec: spec }); }, [spec]);
  if (query.has("start")) return <div className="@container/ws mx-auto max-w-2xl p-4"><CabinetStart initialTemplate={query.get("template") ?? undefined} onStart={(started) => Object.assign(window, { __started: started })} /></div>;
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

const started = (page) => page.waitForFunction(() => window.__started).then(() => page.evaluate(() => window.__started));
const noSideScroll = (page, what) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1).then((fits) => assert.ok(fits, `${what}: no sideways scroll`));
const next = (page) => page.getByRole("button", { name: /^Next:/ }).click();

try {
  for (const viewport of [{ width: 390, height: 780 }, { width: 1280, height: 860 }]) {
    const phone = viewport.width < 600;
    const size = phone ? "phone" : "desktop";
    const page = await browser.newPage({ viewport, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // ---- A wardrobe, step by step ----------------------------------------------
    await page.goto(`${url}?start`);
    const types = page.getByRole("group", { name: "Cabinet type" });
    await types.waitFor();
    assert.deepEqual(await types.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.querySelector("span")?.textContent)), ["Wardrobe", "Kitchen", "Vanity / Bathroom", "TV Unit", "Shoe Cabinet", "Storage Cabinet", "Office Cabinet", "Custom Cabinet"], `${size}: the eight cabinet types`);
    await noSideScroll(page, `${size} type step`);
    await types.getByRole("button", { name: /Wardrobe/ }).click();
    const width = page.getByLabel("Width in mm");
    await width.fill("2437.5");
    await width.press("Enter");
    assert.equal(await width.inputValue(), "2437.5", `${size}: a width typed to the half millimetre is kept`);
    await width.fill("2437,25");
    await width.press("Enter");
    assert.equal(await width.inputValue(), "2437.2", `${size}: a comma is a decimal point, and a second decimal is not taken`);
    await width.fill("2437.5");
    await width.press("Enter");
    await page.getByRole("button", { name: "Lock Width" }).click();
    assert.ok(await width.isDisabled(), `${size}: a locked width cannot be typed into`);
    assert.ok(await page.locator('input[type="range"]').first().isDisabled(), `${size}: nor dragged`);
    await page.getByRole("button", { name: "Unlock Width" }).click();
    assert.ok(!(await width.isDisabled()), `${size}: unlocked again`);
    await page.getByLabel("Height in mm").fill("2700");
    await page.getByLabel("Height in mm").press("Enter");
    await next(page);
    await page.getByRole("group", { name: "Wardrobe layout" }).getByRole("button", { name: "Straight" }).click();
    await next(page);
    const cards = page.getByRole("group", { name: "Templates" }).getByRole("button");
    assert.ok(await cards.count() >= 8, `${size}: wardrobe templates offered (${await cards.count()})`);
    assert.equal(await page.getByRole("group", { name: "Templates" }).locator("svg[role=img] rect").count() > 100, true, `${size}: each card is drawn from its parts`);
    await noSideScroll(page, `${size} template step`);
    if (shots) await page.screenshot({ path: join(shots, `cabinet_templates_${size}.png`), fullPage: true });
    await cards.filter({ hasText: "Wardrobe with top cabinet" }).click();
    await next(page);
    const materials = page.getByRole("radiogroup", { name: "Material" });
    await materials.getByRole("radio", { name: /oak/i }).click();
    await page.getByRole("group", { name: "Design priority" }).getByRole("button", { name: "Decorative" }).click();
    await page.getByRole("button", { name: /^Create wardrobe with top cabinet/ }).click();
    const wardrobe = await started(page);
    const base = wardrobe.cabinets.find((cabinet) => !cabinet.stackedOn);
    const top = wardrobe.cabinets.find((cabinet) => cabinet.stackedOn);
    assert.equal(base.size.width, 2437.5, `${size}: the wardrobe is the width measured`);
    assert.ok(top && Math.round(base.size.height + top.size.height) === 2700, `${size}: with a top cabinet to the ceiling`);
    assert.equal(wardrobe.carcass.board.id, "mdf-18-oak", `${size}: in the board chosen`);
    assert.equal(wardrobe.wardrobePlan?.priority, "decorative", `${size}: with the priority chosen`);

    // ---- A kitchen from a template ------------------------------------------------
    await page.goto(`${url}?start`);
    await page.getByRole("group", { name: "Cabinet type" }).getByRole("button", { name: /Kitchen/ }).click();
    await page.getByRole("group", { name: "Templates" }).getByRole("button", { name: /U kitchen/ }).click();
    await next(page);
    await page.getByRole("radiogroup", { name: "Material" }).getByRole("radio", { name: /walnut/i }).click();
    assert.equal(await page.getByRole("group", { name: "Kitchen shape" }).getByRole("button", { pressed: true }).textContent(), "U shape", `${size}: the kitchen setup opens on the template's shape`);
    await page.getByRole("button", { name: "Add a window" }).click();
    await page.getByRole("button", { name: "Create kitchen" }).click();
    const kitchen = await started(page);
    assert.equal(kitchen.layout, "u_shaped", `${size}: a U kitchen`);
    assert.equal(kitchen.carcass.board.id, "mdf-18-walnut", `${size}: in walnut`);
    assert.ok(kitchen.meta.assumptions.some((line) => /No wall cabinets across the window/.test(line)), `${size}: the window kept clear`);

    // ---- Opened from the gallery's Use Template ------------------------------------
    await page.goto(`${url}?start&template=shoe-tall`);
    await page.getByLabel("Width in mm").waitFor();
    assert.equal(await page.getByLabel("Depth in mm").inputValue(), "350", `${size}: a shoe cabinet's own space`);
    await next(page);
    assert.equal(await page.getByRole("group", { name: "Templates" }).getByRole("button", { pressed: true }).locator("span").nth(1).textContent(), "Tall shoe cabinet", `${size}: the gallery's template already chosen`);
    await next(page);
    await page.getByRole("button", { name: /^Create tall shoe cabinet/ }).click();
    const shoes = await started(page);
    assert.equal(shoes.cabinets[0].size.height, 2000, `${size}: built to the space`);

    assert.deepEqual(errors, [], `${size}: page errors`);
    await page.close();
  }

  // ---- The editor -----------------------------------------------------------------
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__spec && window.__scenes?.size > 0, null, { timeout: 20000 });
  const colours = () => page.evaluate(() => {
    const found = new Set();
    [...window.__scenes].at(-1).traverse((object) => { if (object.isMesh && object.material?.color) found.add(`#${object.material.color.getHexString()}`); });
    return [...found];
  });
  await page.waitForTimeout(400);
  const hex = await page.evaluate(() => window.__spec.carcass.board.appearance.hex.toLowerCase());
  assert.ok(!(await colours()).includes(hex), "Model view: boards in the white working colour, not their decor");
  await page.getByRole("group", { name: "Surface view" }).getByRole("button", { name: "Material" }).click();
  await page.waitForTimeout(400);
  assert.ok((await colours()).includes(hex), `Material view: boards in their own decor (${hex})`);
  if (shots) await page.screenshot({ path: join(shots, "cabinet_material_view.png") });
  await page.getByRole("group", { name: "Surface view" }).getByRole("button", { name: "Model" }).click();

  const name = await page.evaluate(() => window.__spec.cabinets[0].label);
  await page.getByRole("button", { name, exact: true }).click();
  const actions = page.getByRole("toolbar", { name: "Selected cabinet" });
  await actions.waitFor();
  assert.deepEqual(await actions.getByRole("button").allTextContents(), ["Move", "Resize", "Duplicate", "Delete"], "the selected cabinet's quick actions");
  const pad = () => page.getByRole("button", { name: new RegExp(`^Move ${name} `) }).count();
  assert.ok(await pad() > 0, "the move pad is shown with the selection");
  await actions.getByRole("button", { name: "Move" }).click();
  assert.equal(await pad(), 0, "Move hides it");
  await actions.getByRole("button", { name: "Move" }).click();
  assert.ok(await pad() > 0, "and shows it again");
  await actions.getByRole("button", { name: "Resize" }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Width in mm", "Resize goes to the width box");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("2399.5");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__spec.cabinets[0].size.width === 2399.5);
  await actions.getByRole("button", { name: "Duplicate" }).click();
  await page.waitForFunction(() => window.__spec.cabinets.length === 2);
  await actions.getByRole("button", { name: "Delete" }).click();
  await page.waitForFunction(() => window.__spec.cabinets.length === 1);

  // ---- Reset to Recommended ------------------------------------------------------------
  await page.goto(`${url}?design=moved`);
  await page.waitForFunction(() => window.__spec && window.__scenes?.size > 0, null, { timeout: 20000 });
  const moved = await page.evaluate(() => window.__spec.cabinets[0].label);
  await page.getByRole("button", { name: moved, exact: true }).click();
  const transport = page.getByRole("region", { name: "Transport modules" });
  await transport.waitFor();
  await transport.getByRole("button", { name: "Reset to Recommended" }).click();
  await page.waitForFunction(() => window.__spec.cabinets[0].transport.joints.map((joint) => joint.at).join() === "1600");
  assert.equal(await page.evaluate(() => window.__spec.cabinets[0].transport.auto), true, "back on the 1600 mm rule");
  assert.equal(await transport.getByRole("button", { name: "Reset to Recommended" }).count(), 0, "and the reset is not offered when there is nothing to reset");

  assert.deepEqual(errors, [], "editor page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Cabinet Design in the browser: a wardrobe from type to template to oak at phone and desktop width, a U kitchen in walnut with a window, a gallery template sized; Model and Material view, quick actions, a decimal width, joints reset to 1600");
