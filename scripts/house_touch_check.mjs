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
import { Toaster } from "sonner";
import * as THREE from "three";
import { HouseDesignerWorkspace } from "@/features/house-designer/components/house-designer-workspace";
// Every scene the renderer draws, so the check can read the 3D model back.
const scenes = new Set<THREE.Scene>();
Object.assign(window, { __scenes: scenes, __THREE: THREE });
THREE.Scene.prototype.onBeforeRender = function () { scenes.add(this); };
createRoot(document.getElementById("root")!).render(<><HouseDesignerWorkspace userId="touch-check" /><Toaster /></>);
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
// SwiftShader: WebGL without a GPU, so the 3D view renders headless.
const browser = await chromium.launch({ executablePath, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

const PLAN = 'svg[aria-label="House plan modeling canvas"]';
const UNDER = 'svg[aria-label="Floor plan"]';

try {
  for (const width of [360, 375, 390, 393, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await newHouse(page);
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
    await newHouse(page);
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

    // Room-first drawing and typed sizes, from a fresh plan.
    await page.reload();
    await newHouse(page);
    await page.locator(PLAN).waitFor();
    await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
    const count = (pattern) => page.evaluate((source) => [...document.querySelectorAll("#house-properties option")].filter((option) => new RegExp(source).test(option.textContent)).length, pattern);
    const rooms = () => count("^Room \\d+$");
    const startWalls = await walls();
    const startRooms = await rooms();
    await page.getByRole("button", { name: "Room", exact: true }).click();
    assert.ok(await page.getByRole("radiogroup", { name: "Room shape" }).isVisible(), `${at}: the room tool offers shapes`);
    const [ax, ay] = await screen(1000, 1000);
    const [bx, by] = await screen(4000, 3500);
    await touch("touchStart", [[ax, ay]]);
    for (let step = 1; step <= 8; step += 1) await touch("touchMove", [[ax + (bx - ax) * step / 8, ay + (by - ay) * step / 8]]);
    assert.equal(await page.locator(`${PLAN} polygon[stroke="#1473e6"]`).count(), 1, `${at}: the room previews while dragging`);
    assert.match(await page.getByLabel("Typed width").getAttribute("placeholder"), /^\d+$/, `${at}: the live width is readable in the panel`);
    await touch("touchEnd", []);
    await page.waitForFunction((expected) => [...document.querySelectorAll("#house-properties option")].filter((option) => /^Wall \d+$/.test(option.textContent)).length === expected, startWalls + 4);
    assert.equal(await rooms(), startRooms + 1, `${at}: dragging made one room`);

    const [rx, ry] = await screen(5000, 1000);
    await page.touchscreen.tap(rx, ry);
    const panel = page.locator("form").filter({ has: page.getByLabel("Typed width") });
    assert.ok(await panel.evaluate((element) => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }), `${at}: the size panel fits the screen`);
    await page.getByLabel("Typed width").fill("2000");
    await page.getByLabel("Typed depth").fill("2000");
    await page.getByRole("button", { name: "Create" }).click();
    assert.equal(await walls(), startWalls + 8, `${at}: a typed room adds its four walls`);
    assert.equal(await rooms(), startRooms + 2);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await walls(), startWalls + 4, `${at}: one undo takes the whole room back`);
    assert.equal(await rooms(), startRooms + 1);

    await page.getByRole("button", { name: "Wall", exact: true }).click();
    const [wx, wy] = await screen(6000, 3000);
    await page.touchscreen.tap(wx, wy);
    await page.getByRole("button", { name: "Run ↓" }).click();
    await page.getByLabel("Typed length").fill("2500");
    await page.getByLabel("Typed length").press("Enter");
    assert.equal(await walls(), startWalls + 5, `${at}: a typed length adds a wall`);
    const run = await page.locator(`${PLAN} line[stroke-opacity="0.28"]`).evaluate((line) => ["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name))));
    assert.ok(Math.abs(run[0] - run[2]) < 1, `${at}: the wall runs the way picked (${run.map(Math.round)})`);
    assert.ok(Math.abs(run[3] - run[1] - 2500) < 0.01, `${at}: exactly the length typed (${run.map(Math.round)})`);
    assert.equal(await page.locator('input[aria-label^="Selected object temporary"]').count(), 0, `${at}: no editing fields while drawing`);
    assert.ok(await page.getByLabel("Typed length").isVisible(), `${at}: the chain carries on from the new end`);
    assert.equal(await page.locator("div.absolute.inset-x-2.bottom-2").isVisible(), false, `${at}: no selection bar while drawing`);

    // Phase 2, from a fresh plan: doors slide and take exact distances, walls
    // move and drag their neighbours, locks hold, floors are added.
    await page.reload();
    await newHouse(page);
    await page.locator(PLAN).waitFor();
    await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
    const drag = async (from, to) => {
      const [ax, ay] = await screen(...from);
      const [bx, by] = await screen(...to);
      await touch("touchStart", [[ax, ay]]);
      for (let step = 1; step <= 8; step += 1) await touch("touchMove", [[ax + (bx - ax) * step / 8, ay + (by - ay) * step / 8]]);
      await touch("touchEnd", []);
      await page.waitForTimeout(150);
    };
    const tapAt = async (x, y) => { const [sx, sy] = await screen(x, y); await page.touchscreen.tap(sx, sy); await page.waitForTimeout(150); };
    const field = (label) => page.locator(`input[aria-label="Selected object temporary ${label}"]`);
    const toasts = () => page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((toast) => toast.textContent).join(" | "));

    await page.getByRole("button", { name: "Door", exact: true }).click();
    await tapAt(4000, 0);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    assert.equal(await field("distance from start").inputValue(), "3550", `${at}: a door shows its distance from each end`);
    assert.equal(await field("distance to end").inputValue(), "3550");
    await drag([4000, 0], [5000, 0]);
    assert.equal(await field("distance from start").inputValue(), "4550", `${at}: dragging slides the door along its wall`);
    assert.equal(await field("distance to end").inputValue(), "2550");
    await field("distance from start").fill("500");
    await field("distance from start").press("Enter");
    assert.equal(await field("distance to end").inputValue(), "6600", `${at}: a typed distance places it exactly`);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await field("distance from start").inputValue(), "4550", `${at}: undo steps back one edit`);
    await tapAt(2000, 0);
    await page.getByText("Wall Properties").waitFor();
    await tapAt(4550 + 450, 0);
    await page.getByText("Door Properties").waitFor({ timeout: 2000 });

    await tapAt(2000, 0);
    await drag([2000, 0], [2000, -500]);
    await tapAt(0, 1500);
    assert.equal(await field("length").inputValue(), "7000", `${at}: moving a wall stretches the one beside it`);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await tapAt(0, 1500);
    assert.equal(await field("length").inputValue(), "6500");

    await page.locator("div.absolute.inset-x-2.bottom-2").getByRole("button", { name: "Lock" }).click();
    assert.equal(await page.locator(`${PLAN} text`, { hasText: "Locked" }).count(), 1, `${at}: a locked wall says so`);
    // Its fields sit off the wall, so a finger anywhere along it reaches the
    // wall: a field lying across a vertical wall took touches meant for it.
    for (const y of [2000, 2600, 3250, 3900, 4500]) {
      const [sx, sy] = await screen(0, y);
      const covering = await page.evaluate(([x, y]) => [-8, 0, 8].map((dx) => document.elementFromPoint(x + dx, y)?.tagName).filter((tag) => tag === "INPUT").length, [sx, sy]);
      assert.equal(covering, 0, `${at}: an editing field lies on the wall at y=${y}`);
    }
    await drag([0, 3000], [600, 3000]);
    assert.match(await toasts(), /This wall is locked/, `${at}: a locked wall refuses to move`);
    await field("length").fill("7000");
    await field("length").press("Enter");
    assert.equal(await field("length").inputValue(), "6500", `${at}: or to take a typed length`);
    await tapAt(2000, 0);
    await drag([2000, 0], [2000, -500]);
    assert.match(await toasts(), /locked wall joined to it/, `${at}: and so does its neighbour`);
    await tapAt(0, 1500);
    assert.equal(await field("length").inputValue(), "6500", `${at}: nothing moved`);

    await page.getByRole("button", { name: /Ground Floor/ }).first().click();
    await page.getByRole("menuitem", { name: "+ Add floor" }).click();
    await page.waitForFunction(() => document.querySelector("div.sticky button[aria-expanded]")?.textContent?.includes("1st Floor"));
    assert.equal(await walls(), 4, `${at}: the new floor has its walls`);

    if (width === 360) await checkStart(page, at);
    if (width === 390) await checkThreeD(page, at, { screen, touch, tapAt });
    if (width === 390) await checkSuggestions(page, at, { touch });
    if (width === 390) await checkRoomsAndRoofs(page, at, { touch });

    assert.deepEqual(errors, [], `${at}: page errors`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

/**
 * From a blank project: split a room with a wall, move an inside wall and
 * watch what is attached to it follow, merge two rooms, snap a wall parallel
 * to a diagonal one, and read a pitched and a hipped roof back from 3D.
 */
async function checkRoomsAndRoofs(page, at, { touch }) {
  await page.reload();
  await newHouse(page);
  const rail = page.locator('nav[aria-label="Modeling tools"]');
  const screenOf = (x, y) => page.evaluate(([selector, x, y]) => { const point = new DOMPoint(x, y).matrixTransform(document.querySelector(selector).getScreenCTM()); return [point.x, point.y]; }, [PLAN, x, y]);
  const tap = async (x, y) => { const [sx, sy] = await screenOf(x, y); await page.touchscreen.tap(sx, sy); await page.waitForTimeout(120); };
  const drag = async (from, to) => {
    const [ax, ay] = await screenOf(...from);
    const [bx, by] = await screenOf(...to);
    await touch("touchStart", [[ax, ay]]);
    for (let step = 1; step <= 8; step += 1) await touch("touchMove", [[ax + (bx - ax) * step / 8, ay + (by - ay) * step / 8]]);
    await touch("touchEnd", []);
    await page.waitForTimeout(200);
  };
  const rooms = () => page.evaluate(() => [...document.querySelectorAll('svg[aria-label="Floor plan"] polygon')]
    .filter((polygon) => (polygon.getAttribute("class") ?? "").includes("fill-sky"))
    .map((polygon) => { const points = polygon.getAttribute("points").trim().split(/\s+/).map((pair) => pair.split(",").map(Number)); const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1]); return `${Math.min(...xs)}..${Math.max(...xs)} x ${Math.min(...ys)}..${Math.max(...ys)}`; })
    .sort());
  const walls = () => page.evaluate(() => [...document.querySelectorAll("#house-properties option")].filter((option) => /^Wall \d+$/.test(option.textContent)).length);
  const selectedLine = () => page.locator(`${PLAN} line[stroke-opacity="0.28"]`).first().evaluate((line) => ["x1", "y1", "x2", "y2"].map((name) => Math.round(Number(line.getAttribute(name)) * 10) / 10));
  const snapOn = async (on) => {
    await page.getByRole("button", { name: "More actions", exact: true }).click();
    const snap = page.getByRole("button", { name: "Snap", exact: true });
    if ((await snap.getAttribute("aria-pressed")) !== String(on)) await snap.click();
    await page.getByRole("button", { name: "More actions", exact: true }).click();
  };

  assert.deepEqual(await rooms(), ["0..8000 x 0..6500"], `${at}: the outline drawn on blank space is one room`);

  // Split: a wall right across the house divides it.
  await rail.getByRole("button", { name: "Wall", exact: true }).click();
  await tap(3000, 0);
  await tap(3000, 6500);
  await rail.getByRole("button", { name: "Select", exact: true }).click();
  const split = await rooms();
  assert.deepEqual(split, ["0..3000 x 0..6500", "3000..8000 x 0..6500"], `${at}: a wall across a room splits it (${split.join(" | ")}; ${await walls()} walls)`);
  await rail.getByRole("button", { name: "Wall", exact: true }).click();
  await tap(3000, 3000);
  await tap(8000, 3000);
  await rail.getByRole("button", { name: "Select", exact: true }).click();
  assert.deepEqual(await rooms(), ["0..3000 x 0..6500", "3000..8000 x 0..3000", "3000..8000 x 3000..6500"], `${at}: and a wall from wall to wall splits again`);
  const before = await walls();

  // Move: the inside wall goes to x = 4000; the wall butting into it and the
  // rooms either side follow; the outside walls do not move.
  await tap(3000, 1500);
  await drag([3000, 1500], [4000, 1500]);
  await tap(4000, 1500);
  assert.deepEqual(await selectedLine(), [4000, 0, 4000, 6500], `${at}: the inside wall moved`);
  await tap(6000, 3000);
  assert.deepEqual(await selectedLine(), [4000, 3000, 8000, 3000], `${at}: the wall joined to it followed`);
  const followed = await rooms();
  assert.deepEqual(followed, ["0..4000 x 0..6500", "4000..8000 x 0..3000", "4000..8000 x 3000..6500"], `${at}: and so did the rooms (${followed.join(" | ")})`);

  // Merge: the two right-hand rooms become one; the wall between them goes.
  await tap(6000, 1500);
  await page.locator("div.absolute.inset-x-2.bottom-2").getByRole("button", { name: "Merge Rooms" }).click();
  await tap(6000, 5000);
  assert.deepEqual(await rooms(), ["0..4000 x 0..6500", "4000..8000 x 0..6500"], `${at}: two rooms merge into one`);
  assert.equal(await walls(), before - 1, `${at}: losing the wall between them`);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal((await rooms()).length, 3, `${at}: and undo divides them again`);
  await page.getByRole("button", { name: "Redo", exact: true }).click();

  // Parallel: a diagonal wall drawn freehand, then one aimed 1.5° off it.
  await snapOn(false);
  await rail.getByRole("button", { name: "Wall", exact: true }).click();
  await tap(500, 5900);
  await tap(2600, 4700);
  const diagonal = await selectedLine();
  await rail.getByRole("button", { name: "Select", exact: true }).click();
  await snapOn(true);
  await rail.getByRole("button", { name: "Wall", exact: true }).click();
  const angle = Math.atan2(diagonal[3] - diagonal[1], diagonal[2] - diagonal[0]);
  await tap(1000, 5000);
  await tap(1000 + Math.cos(angle + 0.026) * 2200, 5000 + Math.sin(angle + 0.026) * 2200);
  const parallel = await selectedLine();
  const difference = Math.abs(Math.atan2(parallel[3] - parallel[1], parallel[2] - parallel[0]) - angle) * 180 / Math.PI;
  assert.ok(difference < 0.01, `${at}: aimed 1.5° off, the wall lands parallel (${difference.toFixed(4)}°)`);
  assert.ok(parallel[2] % 1000 !== 0 || parallel[3] % 1000 !== 0, `${at}: on the parallel, not on the grid`);
  await rail.getByRole("button", { name: "Select", exact: true }).click();

  // Pitched and hipped roofs, read back from 3D.
  await page.getByRole("button", { name: "Both", exact: true }).click();
  await page.waitForFunction(() => [...window.__scenes].some((scene) => scene.getObjectByName("main-roof")), null, { timeout: 15000 });
  const object = page.locator("#house-properties select").first();
  await object.selectOption(await object.locator("option", { hasText: /^Roof/ }).first().getAttribute("value"));
  const roofType = page.locator("#house-properties select").filter({ has: page.locator('option[value="gable"]') });
  const roof = () => page.evaluate(() => {
    const scene = [...window.__scenes].filter((item) => item.getObjectByName("main-roof")).at(-1);
    scene.updateMatrixWorld(true);
    const points = [];
    scene.getObjectByName("main-roof").traverse((mesh) => { if (mesh.isMesh) { const position = mesh.geometry.attributes.position; for (let index = 0; index < position.count; index += 1) points.push(new window.__THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index)).applyMatrix4(mesh.matrixWorld)); } });
    const walls = new window.__THREE.Box3().setFromObject(scene.getObjectByName("walls:ground-floor"));
    const top = Math.max(...points.map((point) => point.y));
    const ridge = points.filter((point) => Math.abs(point.y - top) < 1e-4);
    const span = (values) => Math.max(...values) - Math.min(...values);
    const eaves = Math.min(...points.map((point) => point.y));
    const underside = points.filter((point) => Math.abs(point.y - eaves) < 1e-4);
    return { width: span(underside.map((point) => point.x)), depth: span(underside.map((point) => point.z)), eaves, top, ridge: span(ridge.map((point) => point.x)), wallTop: walls.max.y };
  });
  const near = (a, b) => Math.abs(a - b) < 0.005;
  const slope = 25 * Math.PI / 180;
  const rise = Math.tan(slope) * 7.3 / 2 + Math.cos(slope) * 0.18;
  await roofType.selectOption("gable");
  const gable = await roof();
  assert.ok(near(gable.width, 8.8) && near(gable.depth, 7.3), `${at}: a gable roof covers the house and its overhang (${gable.width} x ${gable.depth})`);
  assert.ok(near(gable.eaves, gable.wallTop), `${at}: its eaves sit on the walls`);
  assert.ok(near(gable.top - gable.eaves, rise), `${at}: and it rises at its 25° slope, 180 mm thick (${gable.top - gable.eaves})`);
  assert.ok(near(gable.ridge, 8.8), `${at}: with a ridge the full length — gable ends`);
  await roofType.selectOption("hip");
  const hip = await roof();
  assert.ok(near(hip.width, 8.8) && near(hip.depth, 7.3) && near(hip.eaves, hip.wallTop) && near(hip.top - hip.eaves, rise), `${at}: a hipped roof the same size and pitch`);
  assert.ok(near(hip.ridge, 1.5 + 2 * Math.sin(slope) * 0.18), `${at}: but its ridge stops short, every side sloping (${hip.ridge})`);

  // An L-shaped house, outlined with the Room tool on blank space, is roofed
  // as its two wings, not as one box over the gap.
  await page.reload();
  await page.getByRole("radio", { name: /Draw rooms/ }).click();
  await page.getByRole("button", { name: "Start drawing rooms" }).click();
  await page.locator(PLAN).waitFor();
  await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
  await page.getByRole("radio", { name: "L shape" }).click();
  await drag([0, 0], [8000, 6000]);
  await rail.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Both", exact: true }).click();
  await page.waitForFunction(() => [...window.__scenes].some((scene) => scene.getObjectByName("main-roof")), null, { timeout: 15000 });
  const lObject = page.locator("#house-properties select").first();
  await lObject.selectOption(await lObject.locator("option", { hasText: /^Roof/ }).first().getAttribute("value"));
  await page.locator("#house-properties select").filter({ has: page.locator('option[value="gable"]') }).selectOption("hip");
  const wings = await page.evaluate(() => {
    const scene = [...window.__scenes].filter((item) => item.getObjectByName("main-roof")).at(-1);
    scene.updateMatrixWorld(true);
    const roofs = [];
    scene.getObjectByName("main-roof").traverse((mesh) => { if (mesh.isMesh) roofs.push(new window.__THREE.Box3().setFromObject(mesh)); });
    const walls = new window.__THREE.Box3().setFromObject(scene.getObjectByName("walls:ground-floor"));
    return { count: roofs.length, wallTop: walls.max.y, eaves: Math.min(...roofs.map((box) => box.min.y)), width: Math.max(...roofs.map((box) => box.max.x)) - Math.min(...roofs.map((box) => box.min.x)), depth: Math.max(...roofs.map((box) => box.max.z)) - Math.min(...roofs.map((box) => box.min.z)) };
  });
  assert.equal(wings.count, 2, `${at}: an L-shaped house gets a roof over each wing`);
  assert.ok(near(wings.eaves, wings.wallTop), `${at}: on its walls`);
  assert.ok(wings.width > 8.8 && wings.width < 9.2 && wings.depth > 6.8 && wings.depth < 7.2, `${at}: covering the L and its overhang (${wings.width.toFixed(2)} x ${wings.depth.toFixed(2)})`);
}

/**
 * A new house, the way a person makes one: Draw manually opens genuinely
 * empty space — nothing but the grid and coordinates — and the outline is
 * drawn wall by wall with typed lengths, closing on its first point.
 */
function structureOptions(page) {
  return page.evaluate(() => [...document.querySelectorAll("#house-properties option")].map((option) => option.value).filter((value) => /^(column|beam|grid|foundation)\|/.test(value)));
}
function structureIn3D(page) {
  return page.evaluate(() => {
  const scene = [...window.__scenes].filter((item) => item.getObjectByName("level:ground-floor")).at(-1);
  const names = new Set();
  scene?.traverse((object) => { if (object.name) names.add(object.name); });
  const count = (pattern) => [...names].filter((name) => pattern.test(name)).length;
  return { walls: names.has("walls:ground-floor"), columns: count(/^[^:]+:column:/), beams: count(/^[^:]+:beam:/), footings: count(/^foundation:/) };
  });
}

async function newHouse(page) {
  await page.getByRole("button", { name: "Draw floor plan", exact: true }).click();
  await page.locator(PLAN).waitFor();
  await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
  const objects = await page.evaluate(() => [...document.querySelectorAll("#house-properties option")].map((option) => option.textContent).filter((text) => /^(Wall|Room|Slab|Roof|Column|Beam|Door|Window|Stair|Grid)/.test(text)));
  assert.deepEqual(objects, [], "a new project starts with nothing in it");
  assert.equal(await page.locator('svg[aria-label="Floor plan"]').count(), 0, "not even an outline");
  assert.equal(await page.locator(`${PLAN} [aria-label="Coordinates"]`).count(), 1, "only the grid and its coordinates");
  const [x, y] = await page.evaluate((selector) => { const point = new DOMPoint(0, 0).matrixTransform(document.querySelector(selector).getScreenCTM()); return [point.x, point.y]; }, PLAN);
  await page.touchscreen.tap(x, y);
  for (const [direction, length] of [["→", 8000], ["↓", 6500], ["←", 8000], ["↑", 6500]]) {
    await page.getByRole("button", { name: `Run ${direction}` }).click();
    await page.getByLabel("Typed length").fill(String(length));
    await page.getByLabel("Typed length").press("Enter");
  }
  await page.locator('svg[aria-label="Floor plan"]').waitFor();
  assert.deepEqual(await structureOptions(page), [], "a drawn plan has no columns, beams, grid or footings yet");
  await page.locator('nav[aria-label="Modeling tools"]').getByRole("button", { name: "Select", exact: true }).click();
}

/**
 * 2D and 3D are one model. Edits made on the plan are read back from the live
 * three.js scene: the walls' size, a door's position, a room's walls, a new
 * floor and its roof — and undo takes each back out of 3D too.
 */
async function checkThreeD(page, at, { touch, tapAt }) {
  await page.reload();
  await newHouse(page);
  await page.locator(PLAN).waitFor();
  await page.getByRole("button", { name: "Both", exact: true }).click();
  await page.waitForFunction(() => [...window.__scenes].some((scene) => scene.getObjectByName("level:ground-floor")), null, { timeout: 15000 });
  await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
  const screenOf = (x, y) => page.evaluate(([selector, x, y]) => { const point = new DOMPoint(x, y).matrixTransform(document.querySelector(selector).getScreenCTM()); return [point.x, point.y]; }, [PLAN, x, y]);
  const drag = async (from, to) => {
    const [ax, ay] = await screenOf(...from);
    const [bx, by] = await screenOf(...to);
    await touch("touchStart", [[ax, ay]]);
    for (let step = 1; step <= 8; step += 1) await touch("touchMove", [[ax + (bx - ax) * step / 8, ay + (by - ay) * step / 8]]);
    await touch("touchEnd", []);
    await page.waitForTimeout(250);
  };
  const undo = async () => { await page.getByRole("button", { name: "Undo", exact: true }).click(); await page.waitForTimeout(250); };
  const scene = () => page.evaluate(() => {
    const live = [...window.__scenes].filter((item) => item.getObjectByName("level:ground-floor")).at(-1);
    live.updateMatrixWorld(true);
    const boxes = {};
    live.traverse((object) => { if (object.name) { const box = new window.__THREE.Box3().setFromObject(object); boxes[object.name] = { min: box.min.toArray(), max: box.max.toArray() }; } });
    let meshes = 0;
    live.getObjectByName("level:ground-floor").traverse((object) => { if (object.isMesh) meshes += 1; });
    return { boxes, meshes };
  });
  const depth = (box) => box.max[2] - box.min[2];
  const near = (a, b) => Math.abs(a - b) < 0.005;

  const rail = page.locator('nav[aria-label="Modeling tools"]');
  const start = await scene();
  await tapAt(2000, 0);
  await drag([2000, 0], [2000, -500]);
  assert.ok(near(depth((await scene()).boxes["walls:ground-floor"]) - depth(start.boxes["walls:ground-floor"]), 0.5), `${at}: a wall moved on the plan moves in 3D`);
  await undo();
  assert.ok(near(depth((await scene()).boxes["walls:ground-floor"]), depth(start.boxes["walls:ground-floor"])), `${at}: and undo moves it back in 3D`);

  await rail.getByRole("button", { name: "Door", exact: true }).click();
  assert.ok(await page.locator("canvas").count(), `${at}: picking a tool keeps the 3D beside the plan`);
  await tapAt(4000, 0);
  await rail.getByRole("button", { name: "Select", exact: true }).click();
  const doorAt = (state) => { const name = Object.keys(state.boxes).find((key) => key.includes(":door:")); return state.boxes[name].min[0] - state.boxes["walls:ground-floor"].min[0]; };
  const placed = await scene();
  assert.ok(Object.keys(placed.boxes).some((key) => key.includes(":door:")), `${at}: a door placed on the plan appears in 3D`);
  await drag([4000, 0], [5000, 0]);
  assert.ok(near(doorAt(await scene()) - doorAt(placed), 1), `${at}: and slides with it`);

  const before = (await scene()).meshes;
  await rail.getByRole("button", { name: "Room", exact: true }).click();
  await drag([1000, 1000], [4000, 4000]);
  assert.equal((await scene()).meshes - before, 4, `${at}: a room drawn on the plan raises its four walls`);
  await undo();
  assert.equal((await scene()).meshes, before, `${at}: undo takes them down`);

  const roof = (await scene()).boxes["main-roof"];
  await page.getByRole("button", { name: /Ground Floor/ }).first().click();
  await page.getByRole("menuitem", { name: "+ Add floor" }).click();
  await page.waitForTimeout(300);
  const raised = await scene();
  assert.ok(raised.boxes["walls:floor-2"] && near(raised.boxes["walls:floor-2"].min[1], 3), `${at}: a new floor stands on the one below`);
  assert.ok(near(raised.boxes["main-roof"].min[1] - roof.min[1], 3), `${at}: the roof goes up with it`);
  assert.ok(raised.boxes["floor-2:slab"], `${at}: on its own slab`);
  await undo();
  assert.equal((await scene()).boxes["walls:floor-2"], undefined, `${at}: undo removes the floor from 3D`);
  assert.match(await page.locator("div.sticky button[aria-expanded]").first().innerText(), /Ground Floor/, `${at}: and the editor goes back to a floor that exists`);

  // Floor and roof cover the room tapped, once.
  const toasts = () => page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((toast) => toast.textContent).join(" | "));
  const slabs = async () => Object.keys((await scene()).boxes).filter((key) => key.startsWith("slab:"));
  await rail.getByRole("button", { name: "Floor", exact: true }).click();
  await tapAt(6000, 4500);
  assert.equal((await slabs()).length, 0, `${at}: no second floor under the house`);
  assert.match(await toasts(), /already has a floor/, `${at}: and it says why`);
  await rail.getByRole("button", { name: "Room", exact: true }).click();
  await tapAt(8000, 0);
  await page.getByLabel("Typed width").fill("3000");
  await page.getByLabel("Typed depth").fill("3000");
  await page.getByRole("button", { name: "Create" }).click();
  await rail.getByRole("button", { name: "Floor", exact: true }).click();
  await tapAt(8800, 1500);
  const extension = (await scene()).boxes[(await slabs())[0]];
  assert.ok(extension && near(extension.max[0] - extension.min[0], 3) && near(extension.max[2] - extension.min[2], 3), `${at}: an extension gets a floor its own size`);
  await rail.getByRole("button", { name: "Stair", exact: true }).click();
  await tapAt(2000, 3000);
  const stair = Object.entries((await scene()).boxes).find(([key]) => key.startsWith("stair:"))?.[1];
  assert.ok(stair && near(stair.max[0] - stair.min[0], 1), `${at}: a stair is a stair's width, whatever tool came before`);
}

/** "How do you want to start?" — every choice is real and fits a phone. */
async function checkStart(page, at) {
  await page.reload();
  const choices = page.getByRole("radiogroup", { name: "How to start" }).getByRole("radio");
  assert.equal(await page.getByText("Design setup").count() + await page.getByText("What are you modeling?").count() + await page.getByText("Original Floor Plan Strict").count(), 0, `${at}: no setup panel before there is a house`);
  assert.deepEqual((await choices.allInnerTexts()).map((text) => text.split("\n")[0]), ["Draw manually", "Draw rooms", "Upload floor plan", "Upload hand sketch", "Use a template", "Describe it (AI)"], `${at}: six ways to start`);
  assert.ok(await page.getByRole("button", { name: "Draw floor plan", exact: true }).isVisible() && await page.getByRole("button", { name: "Draw floor plan", exact: true }).evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight), `${at}: the choices and the way on fit one screen`);
  await page.getByRole("radio", { name: /Upload floor plan/ }).click();
  assert.ok(await page.getByRole("button", { name: "Convert with AI" }).isDisabled(), `${at}: nothing to convert until a plan is uploaded`);
  assert.ok(await page.getByRole("button", { name: "Trace it myself" }).isDisabled(), `${at}: or to trace`);
  await page.getByRole("radio", { name: /Draw rooms/ }).click();
  await page.getByRole("button", { name: "Start drawing rooms" }).click();
  assert.ok(await page.getByRole("radiogroup", { name: "Room shape" }).isVisible(), `${at}: drawing rooms opens with the Room tool ready`);
  await page.reload();
  await page.getByRole("radio", { name: /Use a template/ }).click();
  await page.getByRole("radio", { name: /Three-bedroom/ }).click();
  await page.getByRole("button", { name: "Use this template" }).click();
  await page.locator(PLAN).waitFor();
  const options = await page.evaluate(() => [...document.querySelectorAll("#house-properties option")].map((option) => option.textContent));
  assert.equal(options.filter((text) => /^Wall \d+$/.test(text)).length, 7, `${at}: a template arrives with its walls`);
  assert.equal(options.filter((text) => /^Door/.test(text)).length, 4, `${at}: doors`);
  assert.equal(options.filter((text) => /^Window/.test(text)).length, 4, `${at}: and windows`);
  assert.ok(await page.getByRole("button", { name: /Upload façade photo/ }).count(), `${at}: a façade reference photo is added in the Façade designer`);
  assert.deepEqual(await structureOptions(page), [], `${at}: nor any structure while it is being designed`);
  // Strict is off unless someone turns it on: past verification — where
  // Strict applies — an outside wall still moves like any other.
  await page.getByRole("button", { name: "Finish design → 3D" }).click();
  // Finishing the design generates no structure: there is none in 3D.
  await page.waitForFunction(() => [...window.__scenes].some((scene) => scene.getObjectByName("level:ground-floor")), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const finished = await structureIn3D(page);
  assert.deepEqual(finished, { walls: true, columns: 0, beams: 0, footings: 0 }, `${at}: finishing the design adds no columns, beams or footings`);
  await page.getByRole("button", { name: "2d", exact: true }).click();
  await page.locator(PLAN).waitFor();
  await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
  const [tx, ty] = await page.evaluate((selector) => { const point = new DOMPoint(4500, 0).matrixTransform(document.querySelector(selector).getScreenCTM()); return [point.x, point.y]; }, PLAN);
  await page.touchscreen.tap(tx, ty);
  await page.getByText("Wall Properties").waitFor();
  const [, ay] = await page.evaluate((selector) => { const point = new DOMPoint(4500, -500).matrixTransform(document.querySelector(selector).getScreenCTM()); return [point.x, point.y]; }, PLAN);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: tx, y: ty, id: 0 }] });
  for (let step = 1; step <= 8; step += 1) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: tx, y: ty + (ay - ty) * step / 8, id: 0 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(250);
  assert.doesNotMatch(await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((toast) => toast.textContent).join(" ")), /Strict/, `${at}: no hidden setting refuses the move`);

  // Describe it (AI). No model is reachable here, so the endpoint answers as
  // a model's checked plan would; what is tested is everything around it.
  const plan = { version: 1, corners: [{ id: "c1", x: 0, y: 0 }, { id: "c2", x: 9000, y: 0 }, { id: "c3", x: 9000, y: 7000 }, { id: "c4", x: 0, y: 7000 }], wallThickness: 200, ceilingHeight: 2800, openings: [{ id: "o1", kind: "door", wallId: "c3", offset: 4000, width: 1000, height: 2100, sill: 0, swing: "in-right", label: "Entrance" }], runWalls: [], interiorWalls: [{ id: "iw1", start: { x: 4500, y: 0 }, end: { x: 4500, y: 7000 }, thickness: 120, height: 2800, label: "Interior wall" }], zones: [{ id: "r1", name: "Bedroom", boundary: [{ x: 0, y: 0 }, { x: 4500, y: 0 }, { x: 4500, y: 7000 }, { x: 0, y: 7000 }], floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" }, { id: "r2", name: "Living", boundary: [{ x: 4500, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 7000 }, { x: 4500, y: 7000 }], floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" }], planColumns: [], planStairs: [], dimensions: [], planPlatforms: [] };
  let sent = null;
  let answer = { status: 502, body: { error: "A plan could not be drawn from that description. Try again, or draw it yourself." } };
  await page.route("**/api/house-design/generate-plan", async (route) => { sent = route.request().postDataJSON(); await route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) }); });
  await page.reload();
  await page.getByRole("radio", { name: /Describe it/ }).click();
  assert.ok(await page.getByRole("button", { name: "Generate plan" }).isDisabled(), `${at}: nothing to generate from yet`);
  const wish = "A two-room house about 9 by 7 metres: a bedroom and a living room";
  await page.getByLabel("House description").fill(wish);
  await page.getByRole("button", { name: "Generate plan" }).click();
  await page.locator("[data-sonner-toast]").first().waitFor();
  assert.equal(sent?.description, wish, `${at}: the description is what is sent`);
  assert.equal(await page.locator(PLAN).count(), 0, `${at}: a failed generation invents nothing — still choosing how to start`);
  assert.equal(await page.getByLabel("House description").inputValue(), wish, `${at}: with the description kept to try again`);
  answer = { status: 200, body: { plan, confidence: 0.8, notes: ["Assumed a single storey."] } };
  await page.getByRole("button", { name: "Generate plan" }).click();
  await page.locator(PLAN).waitFor();
  const drawn = await page.evaluate(() => [...document.querySelectorAll("#house-properties option")].map((option) => option.textContent));
  assert.equal(drawn.filter((text) => /^Wall \d+$/.test(text)).length, 5, `${at}: the generated plan opens to be checked, walls and all`);
  assert.equal(await page.locator('svg[aria-label="Floor plan"] polygon').filter({ hasNot: page.locator("x") }).evaluateAll((polygons) => polygons.filter((polygon) => (polygon.getAttribute("class") ?? "").includes("fill-sky")).length), 2, `${at}: with its rooms`);
  assert.match(await page.locator("#workspace").innerText(), /Assumed a single storey/, `${at}: and the AI's assumptions shown`);
  await page.unroute("**/api/house-design/generate-plan");
}

/**
 * Suggest Columns proposes; only Accept changes the model. Read back from
 * the 3D scene so "nothing changed" means nothing changed in the model.
 */
async function checkSuggestions(page, at, { touch }) {
  await page.reload();
  await newHouse(page);
  await page.locator(PLAN).waitFor();
  await page.getByRole("button", { name: "Both", exact: true }).click();
  await page.waitForFunction(() => [...window.__scenes].some((scene) => scene.getObjectByName("level:ground-floor")), null, { timeout: 15000 });
  await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
  const screenOf = (x, y) => page.evaluate(([selector, x, y]) => { const point = new DOMPoint(x, y).matrixTransform(document.querySelector(selector).getScreenCTM()); return [point.x, point.y]; }, [PLAN, x, y]);
  const live = () => page.evaluate(() => {
    const scene = [...window.__scenes].filter((item) => item.getObjectByName("level:ground-floor")).at(-1);
    scene.updateMatrixWorld(true);
    let columns = 0;
    scene.traverse((object) => { if (object.name && /column:/.test(object.name)) columns += 1; });
    const walls = new window.__THREE.Box3().setFromObject(scene.getObjectByName("walls:ground-floor"));
    return { columns, walls: [...walls.min.toArray(), ...walls.max.toArray()].map((value) => value.toFixed(3)).join() };
  });
  const marks = () => page.evaluate((selector) => [...document.querySelectorAll(`${selector} [aria-label^="Suggested column"] rect`)].map((rect) => `${Math.round(+rect.getAttribute("x") + +rect.getAttribute("width") / 2)}:${Math.round(+rect.getAttribute("y") + +rect.getAttribute("height") / 2)}`).sort(), PLAN);
  const panel = page.getByRole("region", { name: "Suggested columns" });
  const open = async () => {
    await page.locator('nav[aria-label="Modeling tools"]').getByRole("button", { name: "More tools" }).click();
    await page.getByPlaceholder("Search commands…").fill("suggest");
    await page.getByRole("button", { name: /Suggest Columns/ }).click();
  };

  const start = await live();
  await open();
  assert.deepEqual(await marks(), ["0:0", "0:3250", "0:6500", "4000:0", "4000:6500", "8000:0", "8000:3250", "8000:6500"], `${at}: with no structure yet, a column is suggested at each corner and mid-span on each long wall`);
  assert.deepEqual(await live(), start, `${at}: suggesting changes nothing in the model`);

  const [gx, gy] = await screenOf(4000, 0);
  await page.touchscreen.tap(gx, gy);
  assert.match(await panel.innerText(), /8\.0 m span/, `${at}: a chosen suggestion says why`);
  await panel.getByRole("button", { name: "Accept", exact: true }).click();
  assert.equal((await live()).columns, start.columns + 1, `${at}: accepting one adds one`);

  const [ax, ay] = await screenOf(0, 3250);
  const [, by] = await screenOf(0, 2250);
  await touch("touchStart", [[ax, ay]]);
  for (let step = 1; step <= 6; step += 1) await touch("touchMove", [[ax, ay + (by - ay) * step / 6]]);
  await touch("touchEnd", []);
  await page.waitForTimeout(150);
  assert.deepEqual(await marks(), ["0:0", "0:2250", "0:6500", "4000:6500", "8000:0", "8000:3250", "8000:6500"], `${at}: a suggestion drags to where you want it`);
  await page.getByRole("button", { name: "Accept all" }).click();
  const accepted = await live();
  assert.equal(accepted.columns, start.columns + 8, `${at}: accept all adds the rest`);
  assert.equal(accepted.walls, start.walls, `${at}: and no wall moves`);
  assert.equal(await panel.count(), 0, `${at}: nothing is left to suggest`);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal((await live()).columns, start.columns + 1, `${at}: one undo takes accept-all back`);

  await open();
  await page.getByLabel("Maximum span").selectOption("3000");
  assert.ok((await marks()).length > 7, `${at}: a shorter span asks for more columns`);
  await panel.getByRole("button", { name: "Clear" }).click();
  assert.equal((await marks()).length, 0, `${at}: and Clear takes the suggestions away`);
  assert.equal((await live()).columns, start.columns + 1, `${at}: without touching the model`);
}

console.log("House designer touch + 3D: layout, pinch, pan, tap, delete/undo, long-press, room drawing, typed lengths, doors, wall moves, locks, floors, 2D/3D sync, column suggestions, the start choices, split/merge rooms, inside-wall moves, parallel snapping and pitched/hipped roofs passed at 360–430px");
