/**
 * The 3D cabinet with its dimensions, rendered: a selected wardrobe shows its
 * column widths, overall size, clear heights, rails and drawer fronts.
 *
 *   npm run build && node scripts/berchuma_dimensions_browser_check.mjs [screenshot-folder]
 */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
let chromium;
try { ({ chromium } = await import("playwright")); } catch { try { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); } catch { console.log("SKIP: needs Playwright"); process.exit(0); } }

const out = mkdtempSync(join(tmpdir(), "berchuma_dimensions_"));
writeFileSync(join(out, "entry.tsx"), `
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import Model from "@/features/berchuma-studio/components/viewer/model";
import { wardrobeExample } from "@/features/berchuma-studio/services/examples";
const scenes = new Set<THREE.Scene>();
Object.assign(window, { __scenes: scenes });
THREE.Scene.prototype.onBeforeRender = function () { scenes.add(this); };
const query = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(<div style={{ width: "100vw", height: "100vh" }}><Model spec={wardrobeExample()} selectedCabinetId={query.get("select")} hideFronts={query.has("open")} /></div>);
`);
const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
await build({
  absWorkingDir: root, entryPoints: [join(out, "entry.tsx")], bundle: true, outfile: join(out, "app.js"), format: "esm", jsx: "automatic", platform: "browser", logLevel: "error",
  nodePaths: [join(root, "node_modules")], define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "alias", setup(builder) { builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind })); } }],
});
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef0f3"><div id="root"></div><script type="module" src="/app.js"></script></body></html>`);
const server = createServer((request, response) => {
  const path = request.url.startsWith("/app.js") ? "app.js" : "index.html";
  response.writeHead(200, { "content-type": path.endsWith(".js") ? "text/javascript" : "text/html" });
  response.end(readFileSync(join(out, path)));
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const executablePath = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;
const browser = await chromium.launch({ executablePath, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const shots = process.argv[2];
const read = (page) => page.evaluate(() => {
  const scene = [...window.__scenes].at(-1);
  const group = scene?.getObjectByName("cabinet-dimensions");
  if (!group) return null;
  const lines = group.children.find((child) => child.type === "LineSegments");
  return { segments: lines.geometry.attributes.position.count / 2, labels: group.children.filter((child) => child.type === "Sprite").length };
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}?select=wardrobe&open`);
  await page.waitForFunction(() => window.__scenes?.size > 0, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const open = await read(page);
  assert.ok(open, "a selected wardrobe is drawn with its dimensions");
  // 3 columns + overall width + height, 10 clear heights (2 + 2 + 6), 2 rails with their hanging heights, 3 drawer fronts.
  assert.equal(open.labels, 3 + 1 + 1 + 10 + 2 + 2 + 3, "every dimension has its number");
  assert.ok(open.segments >= open.labels * 3, "each a line with a tick at either end");
  if (shots) await page.screenshot({ path: join(shots, "dimensions_open.png") });
  await page.goto(`${url}?select=wardrobe`);
  await page.waitForTimeout(1500);
  assert.deepEqual(await read(page), open, "with the doors on, the same dimensions, drawn over them");
  if (shots) await page.screenshot({ path: join(shots, "dimensions_doors.png") });
  await page.goto(url);
  await page.waitForTimeout(1500);
  assert.equal(await read(page), null, "nothing selected, no dimension lines");
  assert.deepEqual(errors, [], "page errors");
} finally {
  await browser.close();
  server.close();
}
console.log("Berchuma 3D: a selected wardrobe shows its column widths, overall width and height, clear heights, rails with hanging heights and drawer fronts — doors on or off");
