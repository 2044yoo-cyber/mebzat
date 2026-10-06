/**
 * Shelves in a wardrobe's upper module, through the real editor at phone
 * width: the upper module selected, Section 1 set to Shelves, the count
 * stepped from 2 to 3 — and each time the shelves are there in the parts the
 * 3D view, cut list and price are made from, inside the upper carcass, and in
 * the elevation. The wardrobe below keeps its own sections.
 *
 *   npm run build && node scripts/upper_module_shelves_browser_check.mjs [screenshot-folder]
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

const out = mkdtempSync(join(tmpdir(), "upper_shelves_"));
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
import { applyHeightModules } from "@/features/berchuma-studio/services/operations";
import { startingDesign } from "@/features/berchuma-studio/services/starting-designs";
const base = startingDesign("wardrobe", { width: 2400 });
const start = applyHeightModules(base, base.cabinets[0]!.id, [2100, 600]);
function App() {
  const [spec, setSpec] = useState(start);
  useEffect(() => {
    Object.assign(window, {
      __spec: spec,
      __parts: () => buildParts(spec).parts.map((part) => ({ role: part.role, label: part.label, cabinetId: part.cabinetId, bayId: part.bayId, quantity: part.quantity, ys: part.placements.map((at) => at.y) })),
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

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__spec);
  const ids = await page.evaluate(() => {
    const upper = window.__spec.cabinets.find((cabinet) => cabinet.stackedOn);
    const lower = window.__spec.cabinets.find((cabinet) => !cabinet.stackedOn);
    return { upper: upper.id, bay: upper.bays[0].id, lower: lower.id, lowerFittings: lower.bays.map((bay) => JSON.stringify(bay.fitting)), top: upper.position.y, height: upper.size.height };
  });
  const shelves = () => page.evaluate((ids) => window.__parts().filter((part) => part.role === "shelf" && part.cabinetId === ids.upper && part.bayId === ids.bay), ids);
  const shelfCount = async () => (await shelves()).reduce((sum, part) => sum + part.quantity, 0);
  const drawn = () => page.locator('svg[role=img] [data-fitting="shelves"] line').count();
  assert.equal(await shelfCount(), 0, "the upper module starts with no shelves");

  await page.getByRole("tab", { name: "Elevation" }).click();
  await page.locator("svg[role=img]").first().waitFor();
  const drawnBefore = await drawn();
  await page.getByRole("button", { name: "Upper module", exact: true }).click();
  await page.waitForFunction(() => document.body.textContent.includes("Section 1"));
  await page.getByRole("button", { name: "Shelves", exact: true }).first().click();
  await page.waitForFunction((ids) => window.__spec.cabinets.find((cabinet) => cabinet.id === ids.upper).bays[0].fitting.kind === "shelves", ids);
  const fitting = await page.evaluate((ids) => window.__spec.cabinets.find((cabinet) => cabinet.id === ids.upper).bays[0].fitting, ids);
  const start = fitting.count;
  assert.ok(start >= 1, `Shelves on the upper module's Section 1: ${start} shelves set`);
  assert.equal(await shelfCount(), start, "and that many shelf parts made for it");
  assert.equal((await drawn()) - drawnBefore, start, "and drawn in the elevation");
  const ys = (await shelves()).flatMap((part) => part.ys);
  assert.ok(ys.every((y) => y > ids.top && y < ids.top + ids.height), `inside the upper module (${ys.join(", ")} within ${ids.top}–${ids.top + ids.height})`);

  // To 2, then 3, with the stepper.
  const step = async (target) => {
    while (true) {
      const now = await page.evaluate((ids) => window.__spec.cabinets.find((cabinet) => cabinet.id === ids.upper).bays[0].fitting.count, ids);
      if (now === target) return;
      await page.getByRole("button", { name: now < target ? "One more shelves" : "One fewer shelves" }).first().click();
      await page.waitForFunction(([ids, now]) => window.__spec.cabinets.find((cabinet) => cabinet.id === ids.upper).bays[0].fitting.count !== now, [ids, now]);
    }
  };
  await step(2);
  assert.equal(await shelfCount(), 2, "A: count 2 — exactly two shelves in the upper module");
  assert.equal((await drawn()) - drawnBefore, 2, "and two drawn");
  await step(3);
  assert.equal(await shelfCount(), 3, "B: count 3 — exactly three, at once");
  assert.equal((await drawn()) - drawnBefore, 3, "and three drawn");
  if (shots) await page.screenshot({ path: join(shots, "upper_shelves.png") });
  const lowerNow = await page.evaluate((ids) => window.__spec.cabinets.find((cabinet) => cabinet.id === ids.lower).bays.map((bay) => JSON.stringify(bay.fitting)), ids);
  assert.deepEqual(lowerNow, ids.lowerFittings, "D: the wardrobe below keeps its own sections");

  // The 3D view is drawn from the same parts; it must open on them cleanly.
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForTimeout(800);
  assert.deepEqual(errors, [], "page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Upper-module shelves in the editor: Shelves on the upper module's section made real shelves inside it, 2 then 3 with the stepper, in the parts and the elevation; the wardrobe below unchanged");
