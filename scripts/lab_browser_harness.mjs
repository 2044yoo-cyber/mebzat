/**
 * What the browser checks of the construction lab share: the lab bundled the way
 * it ships, served on a local port, driven by Chromium with a software GL, and a
 * few readers that ask the three.js scene what it is really drawing.
 *
 *   import { openLab } from "./lab_browser_harness.mjs";
 *   const lab = await openLab({ withProject: true });
 *   const page = await lab.newPage({ viewport: { width: 390, height: 800 } });
 *
 * The built stylesheet is read from .next, so the screen is laid out as it ships
 * (`npm run build` first); `next/dynamic` is swapped for React.lazy, which is all
 * it does here. Exits 0 with a SKIP line when Playwright or the stylesheet is
 * missing, as the checks around it have always done.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

export async function openLab({ withProject = false } = {}) {
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
${withProject ? `
// A user's own house: the sample's plan under another id, so the two sources differ only by name.
const project = { ...buildLearningHouseProject().project, id: "users-own-house" };
const before = JSON.stringify(project);
const ids = new Set(buildConstructionModel(buildLearningHouseProject().project).components.map((c) => c.id));
Object.assign(window, { __ids: ids, __projectUntouched: () => JSON.stringify(project) === before });
` : "const project = null;"}
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
  /** The size of the box the drawn pieces stand in, metres: along the plan's x, up, and along the plan's y. */
  const extentOf = (page) => page.evaluate(() => {
    const scene = [...window.__scenes].at(-1);
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    const v = new window.THREE.Vector3(); const m = new window.THREE.Matrix4();
    scene.traverse((o) => { if (o.isInstancedMesh) for (let i = 0; i < o.count; i += 1) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m); [v.x, v.y, v.z].forEach((c, k) => { lo[k] = Math.min(lo[k], c); hi[k] = Math.max(hi[k], c); }); } });
    return { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] };
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
  /** A page on the lab, with the page errors collected, waiting until the first model is drawn. */
  const newPage = async (options) => {
    const page = await browser.newPage(options);
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error" && !/WebGL|GPU stall|swiftshader/i.test(message.text())) errors.push(message.text()); });
    await page.goto(url);
    await page.getByTestId("construction-lab").waitFor();
    await page.waitForFunction(() => window.__scenes?.size > 0, null, { timeout: 60000 });
    await settle(page);
    return page;
  };
  const close = async () => { await browser.close(); server.close(); };
  return { browser, url, out, errors, stats, topOf, extentOf, settle, until, newPage, close };
}
