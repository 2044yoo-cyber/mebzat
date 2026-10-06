/**
 * The Zekolo in the real editor, at phone width: a 2400 × 2700 wardrobe in
 * two height modules with a side display. The wardrobe's Zekolo turned off —
 * gone from the elevation and the parts, the sides to the floor — and on
 * again with its height, setback, thickness and material set; an upper module
 * offered none; the whole design all off, then the side display alone back on
 * under Customize, then all on.
 *
 *   npm run build && node scripts/zekolo_browser_check.mjs [screenshot-folder]
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

const out = mkdtempSync(join(tmpdir(), "zekolo_"));
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
import { DesignEditor } from "@/features/berchuma-studio/components/editor/design-editor";
import { buildParts } from "@/features/berchuma-studio/services/geometry";
import { addSideDisplay, applyHeightModules } from "@/features/berchuma-studio/services/operations";
import { startingDesign } from "@/features/berchuma-studio/services/starting-designs";
const base = startingDesign("wardrobe", { width: 2400 });
const start = addSideDisplay(applyHeightModules(base, base.cabinets[0]!.id, [2100, 600]), base.cabinets[0]!.id, { side: "right", width: 300 });
function App() {
  const [spec, setSpec] = useState(start);
  useEffect(() => {
    Object.assign(window, {
      __spec: spec,
      __parts: () => buildParts(spec).parts.map((part) => ({ role: part.role, label: part.label, board: part.board.id, cabinetId: part.cabinetId, length: part.length, width: part.width, size: part.size })),
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
const type = async (locator, value) => { await locator.fill(String(value)); await locator.press("Enter"); };

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__spec);
  const ids = await page.evaluate(() => ({ wardrobe: window.__spec.cabinets[0].id, side: window.__spec.cabinets.find((cabinet) => cabinet.kind === "open" && !cabinet.stackedOn).id }));
  const plinthsOf = (cabinetId) => page.evaluate((cabinetId) => window.__parts().filter((part) => (part.role === "plinth" || part.role === "leg") && part.cabinetId === cabinetId), cabinetId);
  const heightOf = (cabinetId) => page.evaluate((cabinetId) => window.__spec.cabinets.find((cabinet) => cabinet.id === cabinetId).plinthHeight, cabinetId);

  await page.getByRole("tab", { name: "Elevation" }).click();
  await page.locator("svg[role=img]").first().waitFor();
  assert.equal(await page.locator(`[data-plinth="${ids.wardrobe}"]`).count(), 1, "the wardrobe stands on its Zekolo in the elevation");
  assert.ok((await plinthsOf(ids.wardrobe)).length >= 3, "and its plinth parts are there");

  // ---- One cabinet: off, then on with its own dimensions ---------------------
  await page.getByRole("button", { name: "Wardrobe", exact: true }).click();
  const panel = page.getByRole("region", { name: "Zekolo / plinth" });
  await panel.waitFor();
  const toggle = panel.getByRole("group", { name: "Zekolo" });
  assert.equal(await toggle.getByRole("button", { name: "ON" }).getAttribute("aria-pressed"), "true", "ON by default");
  await toggle.getByRole("button", { name: "OFF" }).click();
  await page.waitForFunction((id) => window.__spec.cabinets.find((cabinet) => cabinet.id === id).plinthHeight === 0, ids.wardrobe);
  assert.equal((await plinthsOf(ids.wardrobe)).length, 0, "off: no plinth parts left");
  assert.equal(await page.locator(`[data-plinth="${ids.wardrobe}"]`).count(), 0, "and none drawn in the elevation");
  const gables = await page.evaluate((id) => window.__parts().filter((part) => part.cabinetId === id && part.role === "gable").map((part) => part.length), ids.wardrobe);
  assert.ok(gables.every((length) => length === 2100), `the sides run to the floor (${gables.join(", ")})`);
  assert.equal(await page.evaluate(() => window.__spec.envelope.height), 2700, "the overall height kept");
  assert.match(await panel.textContent(), /On the floor, no Zekolo/, "the panel says where it stands");
  if (shots) await page.screenshot({ path: join(shots, "zekolo_off.png"), fullPage: false });

  await toggle.getByRole("button", { name: "ON" }).click();
  await page.waitForFunction((id) => window.__spec.cabinets.find((cabinet) => cabinet.id === id).plinthHeight === 100, ids.wardrobe);
  await type(panel.getByLabel("Zekolo height in mm"), 150);
  await page.waitForFunction((id) => window.__spec.cabinets.find((cabinet) => cabinet.id === id).plinthHeight === 150, ids.wardrobe);
  assert.ok((await plinthsOf(ids.wardrobe)).every((part) => part.width === 150), "height 150: 150 mm plinth panels");
  await type(panel.getByLabel("Zekolo setback in mm"), 40);
  await page.waitForFunction((id) => window.__spec.cabinets.find((cabinet) => cabinet.id === id).zekolo?.setback === 40, ids.wardrobe);
  await panel.getByRole("group", { name: "Zekolo thickness" }).getByRole("button", { name: "15 mm" }).click();
  await page.waitForFunction((id) => window.__spec.cabinets.find((cabinet) => cabinet.id === id).zekolo?.boardId === "pvc-foam-15-white", ids.wardrobe);
  assert.ok((await plinthsOf(ids.wardrobe)).every((part) => part.board === "pvc-foam-15-white" && Math.min(part.size.x, part.size.y, part.size.z) === 15), "thickness 15: PVC foam panels, 15 mm thick");
  await panel.getByLabel("Zekolo material").selectOption("mdf-18-oak");
  await page.waitForFunction((id) => window.__parts().filter((part) => part.cabinetId === id && part.role === "plinth").every((part) => part.board === "mdf-18-oak"), ids.wardrobe);

  // ---- An upper module has none to offer ----------------------------------------------
  await page.getByRole("button", { name: "Upper module", exact: true }).click();
  await page.getByRole("region", { name: "Zekolo / plinth" }).waitFor();
  assert.match(await page.getByRole("region", { name: "Zekolo / plinth" }).textContent(), /an upper module stands on the module below it/, "the upper module: off, and why");
  assert.equal(await page.getByRole("region", { name: "Zekolo / plinth" }).getByRole("group", { name: "Zekolo" }).count(), 0, "with no switch to turn on");

  // ---- The whole design ------------------------------------------------------------
  const design = page.getByRole("region", { name: "Zekolo", exact: true });
  await design.getByRole("button", { name: "Zekolo" }).click();
  await design.getByRole("button", { name: "All OFF" }).click();
  await page.waitForFunction(() => window.__spec.cabinets.every((cabinet) => cabinet.plinthHeight === 0));
  assert.equal(await page.evaluate(() => window.__parts().filter((part) => part.role === "plinth" || part.role === "leg").length), 0, "All OFF: no Zekolo anywhere");
  await design.getByRole("button", { name: "Customize" }).click();
  await design.getByRole("group", { name: "Zekolo, Side display, right" }).getByRole("button", { name: "ON" }).click();
  await page.waitForFunction((id) => window.__spec.cabinets.find((cabinet) => cabinet.id === id).plinthHeight > 0, ids.side);
  assert.ok((await plinthsOf(ids.side)).length > 0 && (await plinthsOf(ids.wardrobe)).length === 0, "Customize: the side display alone back on its Zekolo");
  assert.equal(await heightOf(ids.wardrobe), 0, "the wardrobe still off");
  await design.getByRole("button", { name: "All ON" }).click();
  await page.waitForFunction(() => window.__spec.cabinets.filter((cabinet) => !cabinet.stackedOn).every((cabinet) => cabinet.plinthHeight > 0) && window.__spec.cabinets.filter((cabinet) => cabinet.stackedOn).every((cabinet) => cabinet.plinthHeight === 0));
  assert.equal(await heightOf(ids.wardrobe), 150, "All ON: the wardrobe back on the 150 mm it was given");

  assert.deepEqual(errors, [], "page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Zekolo in the editor: off with no plinth drawn or cut and the sides to the floor, on again at 150 mm, set back 40, 15 mm PVC then oak; an upper module offered none; all off, the side display alone on, all on");
