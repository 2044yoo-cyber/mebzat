/**
 * The house designer, driven by touch at real phone widths.
 *
 *   npm run build && node scripts/house_touch_check.mjs
 *
 * Bundles the workspace on its own (no auth, no Supabase), styles it with the
 * CSS the production build emitted, frames it like the app shell does on a
 * phone, and drives it with real touch events through Chromium.
 *
 * Every assertion here has failed against real code at some point:
 * - pinch zoomed by about half the finger spread, and a two-finger pan zoomed
 *   out, because each of the two pointer moves in a batch read stale state;
 * - the plan drawn underneath stayed put while the model zoomed over it;
 * - a tap on a wall selected the structural grid line drawn on top of it;
 * - lifting the finger after a long press clicked the menu item that had just
 *   opened under it.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  try {
    ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs"));
  } catch {
    console.log("SKIP: house touch check needs Playwright (npm i -g playwright)");
    process.exit(0);
  }
}
const cssDir = join(root, ".next/static/chunks");
const css = existsSync(cssDir) ? readdirSync(cssDir).filter((file) => file.endsWith(".css")) : [];
assert.ok(css.length, "Run `npm run build` first: the check styles the editor with the built CSS");

const out = mkdtempSync(join(tmpdir(), "house_touch_"));
writeFileSync(join(out, "entry.tsx"), `
import { createRoot } from "react-dom/client";
import { HouseDesignerWorkspace } from "@/features/house-designer/components/house-designer-workspace";
createRoot(document.getElementById("root")!).render(<HouseDesignerWorkspace userId="touch-check" />);
`);
// The start screen's upload field talks to Supabase; nothing here uploads.
writeFileSync(join(out, "stub.ts"), `
export const createClient = () => ({});
export const requestUpload = async () => ({});
export const finalizeUpload = async () => ({});
export const moderateQuarantinedImage = async () => ({});
export const signQuarantinePreview = async () => ({});
`);
const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
await build({
  absWorkingDir: root, entryPoints: [join(out, "entry.tsx")], bundle: true, outfile: join(out, "app.js"),
  format: "esm", jsx: "automatic", platform: "browser", logLevel: "error", nodePaths: [join(root, "node_modules")],
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "alias", setup(builder) {
    builder.onResolve({ filter: /^@\/(lib\/supabase|app\/moderation)/ }, () => ({ path: join(out, "stub.ts") }));
    builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind }));
  } }],
});
for (const file of css) copyFileSync(join(cssDir, file), join(out, file));
// 56px: the shell's phone top bar. The workspace below it is what scrolls.
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map((file) => `<link rel="stylesheet" href="${file}">`).join("")}</head>
<body class="bg-background text-foreground"><div style="display:flex;flex-direction:column;height:100dvh"><div style="height:56px;flex-shrink:0"></div><main id="workspace" style="flex:1;min-height:0;overflow-y:auto"><div id="root"></div></main></div><script type="module" src="app.js"></script></body></html>`);

const server = createServer((request, response) => {
  const path = request.url === "/" ? "index.html" : request.url.slice(1).split("?")[0];
  try {
    const body = readFileSync(join(out, path));
    response.writeHead(200, { "content-type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const executablePath = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;
const browser = await chromium.launch({ executablePath });

const PLAN = 'svg[aria-label="House plan modeling canvas"]';
const UNDER = 'svg[aria-label="Floor plan"]';

try {
  for (const width of [360, 375, 390, 393, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.getByRole("button", { name: "Draw floor plan", exact: true }).click();
    await page.locator(PLAN).waitFor();
    await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
    const at = `${width}px`;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    const scrollTop = () => page.evaluate(() => document.getElementById("workspace").scrollTop);
    const frame = () => page.evaluate(([plan, under]) => {
      const read = (selector) => document.querySelector(selector).getAttribute("viewBox").split(" ").map(Number);
      const a = read(plan);
      const b = read(under);
      return { width: a[2], minX: a[0], synced: a.every((value, index) => Math.abs(value - b[index]) < 0.01) };
    }, [PLAN, UNDER]);
    const screen = (x, y) => page.evaluate(([selector, x, y]) => {
      const point = new DOMPoint(x, y).matrixTransform(document.querySelector(selector).getScreenCTM());
      return [point.x, point.y];
    }, [PLAN, x, y]);
    const walls = () => page.evaluate(() => [...document.querySelectorAll("#house-properties option")].filter((option) => /^Wall \d+$/.test(option.textContent)).length);

    // Layout: the drawing gets the screen.
    const layout = await page.evaluate((selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      const workspace = document.getElementById("workspace").getBoundingClientRect();
      return { share: box.height / workspace.height, top: box.top - workspace.top, scrollWidth: document.documentElement.scrollWidth };
    }, PLAN);
    assert.ok(layout.share >= 0.8, `${at}: canvas is ${Math.round(layout.share * 100)}% of the workspace`);
    assert.ok(layout.top <= 80, `${at}: ${Math.round(layout.top)}px of chrome above the canvas`);
    assert.equal(layout.scrollWidth, width, `${at}: no horizontal page scroll`);
    assert.equal(await page.getByRole("button", { name: "Snap", exact: true }).isVisible(), false, `${at}: secondary rows start hidden`);
    await page.getByRole("button", { name: "More actions" }).click();
    assert.equal(await page.getByRole("button", { name: "Snap", exact: true }).isVisible(), true, `${at}: More reveals them`);
    await page.getByRole("button", { name: "More actions" }).click();

    // Pinch: 60px apart to 240px apart is a 4x zoom.
    const start = await frame();
    const [cx, cy] = await screen(4000, 3250);
    await touch("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
    for (let step = 1; step <= 6; step += 1) await touch("touchMove", [[cx - 30 - step * 15, cy], [cx + 30 + step * 15, cy]]);
    await touch("touchEnd", []);
    const pinched = await frame();
    assert.ok(Math.abs(start.width / pinched.width - 4) < 0.05, `${at}: pinch zoomed ${(start.width / pinched.width).toFixed(2)}x, expected 4x`);
    assert.ok(pinched.synced, `${at}: the plan underneath follows the zoom`);

    // Two fingers moving together pan without zooming.
    await touch("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
    for (let step = 1; step <= 5; step += 1) await touch("touchMove", [[cx - 30 + step * 10, cy], [cx + 30 + step * 10, cy]]);
    await touch("touchEnd", []);
    const panned = await frame();
    assert.ok(Math.abs(panned.width - pinched.width) < 1, `${at}: pan changed the zoom (${pinched.width} → ${panned.width})`);
    assert.ok(panned.minX < pinched.minX, `${at}: content follows the fingers`);
    assert.ok(panned.synced, `${at}: the plan underneath follows the pan`);

    // One finger on the canvas never scrolls the page.
    await touch("touchStart", [[cx, cy + 100]]);
    for (let step = 1; step <= 5; step += 1) await touch("touchMove", [[cx, cy + 100 - step * 40]]);
    await touch("touchEnd", []);
    assert.equal(await scrollTop(), 0, `${at}: dragging on the plan scrolled the page`);

    // Back to the fitted view for the editing checks.
    await page.reload();
    await page.getByRole("button", { name: "Draw floor plan", exact: true }).click();
    await page.locator(PLAN).waitFor();
    await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));

    // Tap selects the wall — not the grid line on it — and offers a small bar.
    const [tx, ty] = await screen(4000, 0);
    await page.touchscreen.tap(tx, ty);
    await page.getByText("Wall Properties").waitFor();
    assert.equal(await page.getByRole("menu").isVisible().catch(() => false), false, `${at}: a tap does not open the full menu`);
    assert.equal(await page.locator('input[aria-label="Selected object temporary length"]').count(), 1, `${at}: the wall's length is tappable`);
    const bar = page.locator("div.absolute.inset-x-2.bottom-2");
    assert.ok(await bar.isVisible(), `${at}: the selection bar shows`);
    assert.ok(await bar.evaluate((element) => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }), `${at}: the bar fits the screen`);
    assert.equal(await walls(), 4);
    await bar.getByRole("button", { name: "Delete" }).click();
    await page.waitForFunction(() => [...document.querySelectorAll("#house-properties option")].filter((option) => /^Wall \d+$/.test(option.textContent)).length === 3);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await walls(), 4, `${at}: undo restores the wall`);

    // Long press opens the menu, and lifting the finger leaves it open.
    await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
    const [lx, ly] = await screen(0, 3250);
    await touch("touchStart", [[lx, ly]]);
    await page.waitForTimeout(650);
    await touch("touchEnd", []);
    await page.waitForTimeout(150);
    assert.equal(await page.getByRole("menu").isVisible().catch(() => false), true, `${at}: the long-press menu survives the finger lifting`);
    assert.equal(await scrollTop(), 0, `${at}: lifting the finger clicked something`);

    assert.deepEqual(errors, [], `${at}: page errors`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log("House designer touch: layout, pinch, pan, tap, delete/undo and long-press passed at 360–430px");
