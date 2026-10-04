/**
 * The House Plan workspace on its own page, for the browser checks.
 *
 * Bundles the workspace with esbuild (no Next server, no auth), styles it with
 * the CSS the production build emitted, frames it like the app shell does on a
 * phone, and serves it. Supabase is the in-memory fake in
 * `house_fake_supabase.ts`; moderation and uploads are stubbed out.
 *
 *   const harness = await openHarness();   // { browser, url, close }
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

export const PLAN = 'svg[aria-label="House plan modeling canvas"]';
export const UNDER = 'svg[aria-label="Floor plan"]';

export async function openHarness() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    try {
      ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs"));
    } catch {
      return null;
    }
  }
  const cssDir = join(root, ".next/static/chunks");
  const css = existsSync(cssDir) ? readdirSync(cssDir).filter((file) => file.endsWith(".css")) : [];
  assert.ok(css.length, "Run `npm run build` first: the check styles the editor with the built CSS");

  const out = mkdtempSync(join(tmpdir(), "house_plan_"));
  writeFileSync(join(out, "entry.tsx"), `
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import * as THREE from "three";
import { HouseDesignerWorkspace } from "@/features/house-designer/components/house-designer-workspace";
import { FAKE_USER } from "${join(root, "scripts/house_fake_supabase.ts")}";
// Every scene the renderer draws, so a check can read the 3D model back.
const scenes = new Set<THREE.Scene>();
Object.assign(window, { __scenes: scenes, __THREE: THREE });
THREE.Scene.prototype.onBeforeRender = function () { scenes.add(this); };
const query = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(<><HouseDesignerWorkspace userId={FAKE_USER} planId={query.get("plan")} projectId={query.get("project")} pinId={query.get("pin")} sketchId={query.get("sketch")} /><Toaster /></>);
`);
  // The start screen's upload field talks to moderation; nothing here uploads through it.
  writeFileSync(join(out, "stub.ts"), `
export const createClient = () => ({});
export const requestUpload = async () => ({});
export const finalizeUpload = async () => ({});
export const moderateQuarantinedImage = async () => ({});
export const signQuarantinePreview = async () => ({});
`);
  dynamicShim(out);
  const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
  await build({
    absWorkingDir: root, entryPoints: [join(out, "entry.tsx")], bundle: true, outfile: join(out, "app.js"),
    format: "esm", jsx: "automatic", platform: "browser", logLevel: "error", nodePaths: [join(root, "node_modules")],
    define: { "process.env.NODE_ENV": '"development"' }, splitting: false,
    loader: { ".mjs": "js" },
    plugins: [{ name: "alias", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(root, "scripts/house_fake_supabase.ts") }));
      builder.onResolve({ filter: /^@\/(lib\/supabase|app\/moderation)/ }, () => ({ path: join(out, "stub.ts") }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind }));
      // next/dynamic needs the Next runtime; outside it, a lazy import is the same thing.
      builder.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: join(out, "dynamic.tsx") }));
    } }],
  });
  for (const file of css) copyFileSync(join(cssDir, file), join(out, file));
  // 56px: the shell's phone top bar. The workspace below it is what scrolls.
  writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map((file) => `<link rel="stylesheet" href="/${file}">`).join("")}</head>
<body class="bg-background text-foreground"><div style="display:flex;flex-direction:column;height:100dvh"><div style="height:56px;flex-shrink:0"></div><main id="workspace" style="flex:1;min-height:0;overflow-y:auto"><div id="root"></div></main></div><script type="module" src="/app.js"></script></body></html>`);

  const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".pdf": "application/pdf", ".dxf": "application/dxf", ".json": "application/json" };
  const server = createServer((request, response) => {
    // The workspace rewrites the address to /house-design?plan=…; a reload there is the same page.
    const page = /^\/(house-design)?(\?|$)/.test(request.url);
    const path = page ? "index.html" : decodeURIComponent(request.url.slice(1).split("?")[0]);
    try {
      // pdf.js finds its worker beside the bundle, as Next serves it beside the page.
      const body = path.startsWith("pdfjs-dist/") ? readFileSync(join(root, "node_modules", path)) : readFileSync(join(out, path));
      const extension = Object.keys(types).find((item) => path.endsWith(item));
      response.writeHead(200, { "content-type": types[extension] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  }).listen(0);
  const url = `http://localhost:${server.address().port}/`;
  const executablePath = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;
  // SwiftShader: WebGL without a GPU, so the 3D view renders headless.
  const browser = await chromium.launch({ executablePath, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  return {
    browser,
    url,
    out,
    async close() { await browser.close(); server.close(); },
  };
}

/** The stand-in for next/dynamic, written into the bundle's folder before building. */
function dynamicShim(out) {
  writeFileSync(join(out, "dynamic.tsx"), `
import { lazy, Suspense, type ComponentType } from "react";
export default function dynamic<P extends object>(load: () => Promise<ComponentType<P>>, options: { loading?: () => React.ReactNode } = {}) {
  const Lazy = lazy(async () => ({ default: await load() }));
  return function Dynamic(props: P) { return <Suspense fallback={options.loading?.() ?? null}><Lazy {...props} /></Suspense>; };
}
`);
}
