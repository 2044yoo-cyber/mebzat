/**
 * The House Plan editor, driven by touch at real phone widths.
 *
 *   npm run build && node scripts/house_touch_check.mjs
 *
 * Bundles the workspace on its own (see house_harness.mjs), and drives it with
 * real touch events through Chromium.
 *
 * Every assertion here has failed against real code at some point:
 * - pinch zoomed by about half the finger spread, and a two-finger pan zoomed
 *   out, because each of the two pointer moves in a batch read stale state;
 * - the plan drawn underneath stayed put while the model zoomed over it;
 * - a tap on a wall selected the structural grid line drawn on top of it;
 * - lifting the finger after a long press clicked what had appeared under it.
 */
import assert from "node:assert/strict";

import { openHarness, PLAN, UNDER } from "./house_harness.mjs";

const harness = await openHarness();
if (!harness) {
  console.log("SKIP: house touch check needs Playwright (npm i -g playwright)");
  process.exit(0);
}
const { browser, url } = harness;

const screen = (page, x, y) => page.evaluate(([selector, x, y]) => {
  const point = new DOMPoint(x, y).matrixTransform(document.querySelector(selector).getScreenCTM());
  return [point.x, point.y];
}, [PLAN, x, y]);
const optionCount = (page, pattern) => page.evaluate((source) => [...document.querySelectorAll("#house-properties option")].filter((option) => new RegExp(source).test(option.textContent)).length, pattern);
const walls = (page) => optionCount(page, "^Wall \\d+$");
const sheet = (page) => page.locator('section[aria-label$=" properties"]');
const bar = (page) => page.getByRole("toolbar", { name: / actions$|^Split room$/ });
const barButtons = (page) => bar(page).getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent));
async function more(page, item) {
  await bar(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}
const lengthField = (page) => page.locator('input[aria-label="Selected object temporary length"]');
const rail = (page) => page.locator('nav[aria-label="Modeling tools"]');
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((toast) => toast.textContent).join(" | "));

function touchOf(cdp) {
  return (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
}

async function gestures(page) {
  const cdp = await page.context().newCDPSession(page);
  const touch = touchOf(cdp);
  const drag = async (from, to, wait = 200) => {
    const [ax, ay] = await screen(page, ...from);
    const [bx, by] = await screen(page, ...to);
    await touch("touchStart", [[ax, ay]]);
    for (let step = 1; step <= 8; step += 1) await touch("touchMove", [[ax + (bx - ax) * step / 8, ay + (by - ay) * step / 8]]);
    await touch("touchEnd", []);
    await page.waitForTimeout(wait);
  };
  const tapAt = async (x, y) => { const [sx, sy] = await screen(page, x, y); await page.touchscreen.tap(sx, sy); await page.waitForTimeout(150); };
  return { touch, drag, tapAt };
}

async function fresh(page) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
}

/**
 * A new plan, the way a person makes one: Draw manually opens genuinely empty
 * space — nothing but the grid and coordinates — and the outline is drawn wall
 * by wall with typed lengths, closing on its first point.
 */
async function newHouse(page) {
  await page.getByRole("button", { name: "Draw floor plan", exact: true }).click();
  await page.locator(PLAN).waitFor();
  await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
  const objects = await page.evaluate(() => [...document.querySelectorAll("#house-properties option")].map((option) => option.textContent).filter((text) => /^(Wall|Room|Slab|Roof|Column|Beam|Door|Window|Stair|Grid)/.test(text)));
  assert.deepEqual(objects, [], "a new project starts with nothing in it");
  assert.equal(await page.locator(UNDER).count(), 0, "not even an outline");
  assert.equal(await page.locator(`${PLAN} [aria-label="Coordinates"]`).count(), 1, "only the grid and its coordinates");
  const [x, y] = await screen(page, 0, 0);
  await page.touchscreen.tap(x, y);
  for (const [direction, length] of [["→", 8000], ["↓", 6500], ["←", 8000], ["↑", 6500]]) {
    await page.getByRole("button", { name: `Run ${direction}` }).click();
    await page.getByLabel("Typed length").fill(String(length));
    await page.getByLabel("Typed length").press("Enter");
  }
  await page.locator(UNDER).waitFor();
  const structure = await page.evaluate(() => [...document.querySelectorAll("#house-properties option")].map((option) => option.value).filter((value) => /^(column|beam|grid|foundation)\|/.test(value)));
  assert.deepEqual(structure, [], "a drawn plan has no columns, beams, grid or footings");
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
}

/** The 3D tab, rendered: resolves once a scene with the ground floor has been drawn since `since`. */
async function open3D(page) {
  const before = await page.evaluate(() => window.__scenes.size);
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForFunction((count) => window.__scenes.size > count && [...window.__scenes].at(-1).getObjectByName("level:ground-floor"), before, { timeout: 20000 });
  await page.waitForTimeout(200);
}

const liveScene = (page) => page.evaluate(() => {
  const live = [...window.__scenes].filter((item) => item.getObjectByName("level:ground-floor")).at(-1);
  live.updateMatrixWorld(true);
  const boxes = {};
  live.traverse((object) => { if (object.name) { const box = new window.__THREE.Box3().setFromObject(object); boxes[object.name] = { min: box.min.toArray(), max: box.max.toArray() }; } });
  let meshes = 0;
  live.getObjectByName("level:ground-floor").traverse((object) => { if (object.isMesh) meshes += 1; });
  return { boxes, meshes };
});

try {
  for (const width of [360, 375, 390, 393, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fresh(page);
    await newHouse(page);
    const at = `${width}px`;
    const { touch, drag, tapAt } = await gestures(page);
    const scrollTop = () => page.evaluate(() => document.getElementById("workspace").scrollTop);
    const frame = () => page.evaluate(([plan, under]) => {
      const read = (selector) => document.querySelector(selector).getAttribute("viewBox").split(" ").map(Number);
      const a = read(plan);
      const b = read(under);
      return { width: a[2], minX: a[0], synced: a.every((value, index) => Math.abs(value - b[index]) < 0.01) };
    }, [PLAN, UNDER]);

    // The screen: nine tools, the secondary row, and Save / View 3D — and
    // nothing else permanent. Move, Delete and the rest belong to a selection.
    assert.deepEqual(await rail(page).getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))), ["Select", "Wall", "Room", "Door", "Window", "Column", "Stair", "Furniture", "Measure", "Split"], `${at}: the plan toolbar is the frequent tools`);
    for (const name of ["Undo", "Redo", "Snap", "Grid", "More"]) assert.ok(await page.getByRole("button", { name, exact: true }).isVisible(), `${at}: ${name} is on the secondary row`);
    for (const name of ["Move", "Rotate", "Scale", "Duplicate", "Delete", "Pan", "Roof", "Beam", "Façade"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 0, `${at}: no permanent ${name} button`);
    assert.deepEqual(await page.getByRole("tab").allInnerTexts(), ["PLAN", "SKETCH", "3D", "FILES", "AGENDA"], `${at}: the project's sections`);
    const layout = await page.evaluate((selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      const workspace = document.getElementById("workspace").getBoundingClientRect();
      const save = [...document.querySelectorAll("button")].find((button) => button.textContent === "Save project").getBoundingClientRect();
      return { share: box.height / workspace.height, saveBottom: save.bottom, scrollWidth: document.documentElement.scrollWidth };
    }, PLAN);
    assert.ok(layout.share >= 0.5, `${at}: canvas is ${Math.round(layout.share * 100)}% of the workspace`);
    assert.ok(layout.saveBottom <= 800, `${at}: Save project is on screen without scrolling (${Math.round(layout.saveBottom)}px)`);
    assert.equal(layout.scrollWidth, width, `${at}: no horizontal page scroll`);
    const tools = await rail(page).getByRole("button").evaluateAll((buttons) => buttons.map((button) => { const box = button.getBoundingClientRect(); return Math.min(box.width, box.height); }));
    assert.ok(Math.min(...tools) >= 44, `${at}: tool buttons are at least 44px (${Math.min(...tools)})`);

    // Grid on and off; snapping is separate.
    assert.equal(await page.locator(`${PLAN} rect[aria-label="Grid"]`).count(), 1);
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    assert.equal(await page.locator(`${PLAN} rect[aria-label="Grid"]`).count(), 0, `${at}: Grid hides the grid`);
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    assert.equal(await page.locator(`${PLAN} rect[aria-label="Grid"]`).count(), 1, `${at}: and shows it again`);

    // Pinch: 60px apart to 240px apart is a 4x zoom.
    const start = await frame();
    const [cx, cy] = await screen(page, 4000, 3250);
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
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Zoom to fit" }).click();
    await page.waitForTimeout(150);

    // Tap selects the wall — not the grid line on it — and its sheet opens
    // with its measurements and what can be done to it.
    await tapAt(4000, 0);
    await bar(page).waitFor();
    assert.equal(await bar(page).getAttribute("aria-label"), "Wall actions", `${at}: a tap on a wall offers the wall's actions, beside it`);
    assert.deepEqual(await barButtons(page), ["Duplicate", "↻ 90°", "Split", "More actions"], `${at}: Duplicate, Rotate 90°, Split, and the rest under ⋮`);
    assert.equal(await sheet(page).count(), 0, `${at}: no sheet across the screen`);
    const barBox = await bar(page).evaluate((element) => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, height: box.height }; });
    assert.ok(barBox.left >= 0 && barBox.right <= width && barBox.height <= 52, `${at}: the bar is small and on screen (${JSON.stringify(barBox)})`);
    assert.equal(await lengthField(page).inputValue(), "8000", `${at}: the wall's length is on it`);
    await lengthField(page).fill("7000");
    await lengthField(page).press("Enter");
    await page.waitForTimeout(150);
    assert.equal(await lengthField(page).inputValue(), "7000", `${at}: a typed length is the wall's length`);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await tapAt(4000, 0);
    assert.equal(await lengthField(page).inputValue(), "8000", `${at}: undo puts it back`);
    assert.equal(await walls(page), 4);
    await more(page, "Delete");
    await page.waitForFunction(() => [...document.querySelectorAll("#house-properties option")].filter((option) => /^Wall \d+$/.test(option.textContent)).length === 3);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await walls(page), 4, `${at}: undo restores the wall`);

    // Long press selects, and lifting the finger leaves the sheet open and
    // presses nothing on it.
    const [lx, ly] = await screen(page, 0, 3250);
    await touch("touchStart", [[lx, ly]]);
    await page.waitForTimeout(650);
    await touch("touchEnd", []);
    await page.waitForTimeout(150);
    assert.ok(await bar(page).isVisible(), `${at}: a long press selects`);
    assert.equal(await walls(page), 4, `${at}: lifting the finger pressed nothing`);
    assert.equal(await scrollTop(), 0, `${at}: and scrolled nothing`);

    // Room-first drawing and typed sizes, from a fresh plan.
    await fresh(page);
    await newHouse(page);
    const rooms = () => optionCount(page, "^Room \\d+$");
    const startWalls = await walls(page);
    const startRooms = await rooms();
    await rail(page).getByRole("button", { name: "Room", exact: true }).click();
    assert.ok(await page.getByRole("radiogroup", { name: "Room shape" }).isVisible(), `${at}: the room tool offers shapes`);
    const [ax, ay] = await screen(page, 1000, 1000);
    const [bx, by] = await screen(page, 4000, 3500);
    await touch("touchStart", [[ax, ay]]);
    for (let step = 1; step <= 8; step += 1) await touch("touchMove", [[ax + (bx - ax) * step / 8, ay + (by - ay) * step / 8]]);
    assert.equal(await page.locator(`${PLAN} polygon[stroke="#1473e6"]`).count(), 1, `${at}: the room previews while dragging`);
    assert.match(await page.getByLabel("Typed width").getAttribute("placeholder"), /^\d+$/, `${at}: the live width is readable in the panel`);
    await touch("touchEnd", []);
    await page.waitForFunction((expected) => [...document.querySelectorAll("#house-properties option")].filter((option) => /^Wall \d+$/.test(option.textContent)).length === expected, startWalls + 4);
    assert.equal(await rooms(), startRooms + 1, `${at}: dragging made one room`);

    await tapAt(5000, 1000);
    const panel = page.locator("form").filter({ has: page.getByLabel("Typed width") });
    assert.ok(await panel.evaluate((element) => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }), `${at}: the size panel fits the screen`);
    await page.getByLabel("Typed width").fill("2000");
    await page.getByLabel("Typed depth").fill("2000");
    await page.getByRole("button", { name: "Create" }).click();
    assert.equal(await walls(page), startWalls + 8, `${at}: a typed room adds its four walls`);
    assert.equal(await rooms(), startRooms + 2);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await walls(page), startWalls + 4, `${at}: one undo takes the whole room back`);
    assert.equal(await rooms(), startRooms + 1);

    await rail(page).getByRole("button", { name: "Wall", exact: true }).click();
    await tapAt(6000, 3000);
    await page.getByRole("button", { name: "Run ↓" }).click();
    await page.getByLabel("Typed length").fill("2500");
    await page.getByLabel("Typed length").press("Enter");
    assert.equal(await walls(page), startWalls + 5, `${at}: a typed length adds a wall`);
    const run = await page.locator(`${PLAN} line[stroke-opacity="0.28"]`).evaluate((line) => ["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name))));
    assert.ok(Math.abs(run[0] - run[2]) < 1, `${at}: the wall runs the way picked (${run.map(Math.round)})`);
    assert.ok(Math.abs(run[3] - run[1] - 2500) < 0.01, `${at}: exactly the length typed (${run.map(Math.round)})`);
    assert.equal(await page.locator('input[aria-label^="Selected object temporary"]').count(), 0, `${at}: no editing fields while drawing`);
    assert.ok(await page.getByLabel("Typed length").isVisible(), `${at}: the chain carries on from the new end`);
    assert.equal(await bar(page).count(), 0, `${at}: no selection actions while drawing`);

    // Doors slide and take exact distances, walls move and drag their
    // neighbours, locks hold, floors are added.
    await fresh(page);
    await newHouse(page);
    const field = (label) => page.locator(`input[aria-label="Selected object temporary ${label}"]`);

    await rail(page).getByRole("button", { name: "Door", exact: true }).click();
    await tapAt(4000, 0);
    await rail(page).getByRole("button", { name: "Select", exact: true }).click();
    assert.equal(await field("distance from start").inputValue(), "3550", `${at}: a door shows its distance from each end`);
    assert.equal(await field("distance to end").inputValue(), "3550");
    assert.deepEqual(await barButtons(page), ["Flip", "Duplicate", "Move", "More actions"], `${at}: a door is flipped, duplicated, moved`);
    await more(page, "Properties");
    assert.match(await sheet(page).getAttribute("aria-label"), /^Door D1/, `${at}: the new door is selected, as Door D1`);
    assert.equal(await sheet(page).getByLabel("Width").inputValue(), "900", `${at}: 900 wide`);
    assert.equal(await sheet(page).getByLabel("Height").inputValue(), "2100", `${at}: 2100 high`);
    await sheet(page).getByRole("button", { name: "Close" }).click();
    await drag([4000, 0], [5000, 0]);
    assert.equal(await field("distance from start").inputValue(), "4550", `${at}: dragging slides the door along its wall`);
    assert.equal(await field("distance to end").inputValue(), "2550");
    await field("distance from start").fill("500");
    await field("distance from start").press("Enter");
    assert.equal(await field("distance to end").inputValue(), "6600", `${at}: a typed distance places it exactly`);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await field("distance from start").inputValue(), "4550", `${at}: undo steps back one edit`);
    await tapAt(2000, 0);
    assert.equal(await bar(page).getAttribute("aria-label"), "Wall actions");
    await tapAt(4550 + 450, 0);
    assert.equal(await bar(page).getAttribute("aria-label"), "Door actions", `${at}: a door in the selected wall can still be tapped`);

    await rail(page).getByRole("button", { name: "Window", exact: true }).click();
    await tapAt(0, 3000);
    await rail(page).getByRole("button", { name: "Select", exact: true }).click();
    assert.deepEqual(await barButtons(page), ["Duplicate", "Move", "More actions"], `${at}: a window is duplicated or moved`);
    await more(page, "Properties");
    assert.match(await sheet(page).getAttribute("aria-label"), /^Window W1/, `${at}: a window is Window W1`);
    assert.equal(await sheet(page).getByLabel("Sill height").inputValue(), "900", `${at}: with its sill height`);
    await sheet(page).getByLabel("Sill height").fill("1100");
    await sheet(page).getByLabel("Sill height").press("Enter");
    await page.waitForTimeout(100);
    assert.equal(await sheet(page).getByLabel("Sill height").inputValue(), "1100", `${at}: which can be changed`);
    await sheet(page).getByRole("button", { name: "Close" }).click();

    await tapAt(2000, 0);
    await drag([3000, 0], [3000, -500]);
    await tapAt(0, 1500);
    assert.equal(await field("length").inputValue(), "7000", `${at}: moving a wall stretches the one beside it`);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await field("length").inputValue(), "6500", `${at}: the wall stays selected through undo`);

    await more(page, "Lock");
    assert.equal(await page.locator(`${PLAN} text`, { hasText: "Locked" }).count(), 1, `${at}: a locked wall says so`);
    await bar(page).getByRole("button", { name: "More actions" }).click();
    assert.equal(await page.getByRole("menuitem", { name: "Unlock" }).count(), 1, `${at}: and offers Unlock`);
    await bar(page).getByRole("button", { name: "More actions" }).click();
    await drag([0, 1500], [600, 1500]);
    assert.match(await toasts(page), /This wall is locked/, `${at}: a locked wall refuses to move`);
    await tapAt(2000, 0);
    await drag([3000, 0], [3000, -500]);
    assert.match(await toasts(page), /locked wall joined to it/, `${at}: and so does its neighbour`);
    await tapAt(0, 1500);
    assert.equal(await field("length").inputValue(), "6500", `${at}: nothing moved`);

    await page.getByRole("button", { name: /^Floor: Ground Floor/ }).click();
    await page.getByRole("menuitem", { name: "+ Add floor" }).click();
    await page.getByRole("button", { name: /^Floor: 1st Floor/ }).waitFor();
    assert.equal(await walls(page), 4, `${at}: the new floor has its walls`);

    if (width === 360) await checkStart(page, at);
    if (width === 375) await checkFurnitureAndMeasure(page, at);
    if (width === 390) await checkThreeD(page, at);
    if (width === 390) await checkSuggestions(page, at);
    if (width === 393) await checkRooms(page, at);
    if (width === 430) await checkKeyboard(page, at);

    assert.deepEqual(errors, [], `${at}: page errors`);
    await page.close();
  }
} finally {
  await harness.close();
}

/** Furniture from the catalogue, its sheet, and the Measure tool with the Measurements drawer. */
async function checkFurnitureAndMeasure(page, at) {
  await fresh(page);
  await newHouse(page);
  const { drag, tapAt } = await gestures(page);
  await rail(page).getByRole("button", { name: "Furniture", exact: true }).click();
  const picker = page.getByRole("radiogroup", { name: "Furniture" });
  assert.deepEqual((await picker.getByRole("radio").allInnerTexts()).map((text) => text.split("\n")[0]), ["Bed", "Single bed", "Sofa", "Chair", "Table", "Wardrobe", "Kitchen counter", "Refrigerator", "Sink", "Toilet", "Shower", "Cabinet"], `${at}: basic furniture to choose from`);
  await picker.getByRole("radio", { name: /^Sofa/ }).click();
  await tapAt(4000, 3000);
  const sofa = page.locator(`${PLAN} g[aria-label="Sofa"]`);
  assert.equal(await sofa.count(), 1, `${at}: the sofa is on the plan, named`);
  assert.equal(await bar(page).getAttribute("aria-label"), "Furniture actions", `${at}: and selected`);
  assert.deepEqual(await barButtons(page), ["Move", "↻ 90°", "Duplicate", "More actions"], `${at}: furniture moves, rotates, duplicates`);
  await more(page, "Properties");
  assert.equal(await sheet(page).getAttribute("aria-label"), "Sofa properties");
  assert.equal(await sheet(page).getByLabel("Width").inputValue(), "2000");
  assert.equal(await sheet(page).getByLabel("Depth").inputValue(), "900");
  await sheet(page).getByRole("button", { name: "Close" }).click();
  await bar(page).getByRole("button", { name: "↻ 90°" }).click();
  assert.match(await sofa.getAttribute("transform"), /^rotate\(90 4000 3000\)$/, `${at}: Rotate turns it a quarter`);
  await drag([4000, 3000], [5000, 3500]);
  assert.match(await sofa.getAttribute("transform"), /^rotate\(90 5000 3500\)$/, `${at}: dragging the selected sofa moves it`);
  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  assert.equal(await page.locator(`${PLAN} g[aria-label="Sofa"]`).count(), 2, `${at}: Duplicate makes a second`);
  await more(page, "Delete");
  assert.equal(await page.locator(`${PLAN} g[aria-label="Sofa"]`).count(), 1, `${at}: Delete removes the copy`);
  await tapAt(5000, 3500);
  await bar(page).getByRole("button", { name: "Move" }).click();
  await tapAt(2000, 2000);
  assert.match(await page.locator(`${PLAN} g[aria-label="Sofa"]`).getAttribute("transform"), /^rotate\(90 2000 2000\)$/, `${at}: Move then a tap puts it there`);

  // Measure: two taps, and the distance is recorded.
  await rail(page).getByRole("button", { name: "Measure", exact: true }).click();
  await tapAt(0, 1000);
  await tapAt(3625, 1000);
  await page.getByRole("button", { name: /^Measurements/ }).click();
  const drawer = page.getByRole("region", { name: "Measurements" });
  const text = await drawer.innerText();
  assert.match(text, /Measurement M1\s+3625 mm/, `${at}: a measurement is listed`);
  assert.match(text, /Room 1\s+8000 × 6500 mm · 52\.00 m² · perimeter 29000 mm/, `${at}: the room's size, area and perimeter`);
  assert.match(text, /Wall A \(Room 1\)\s+8000 mm · thickness 150 mm · height 3000 mm/, `${at}: each wall, named with its room`);
  assert.match(text, /Sofa\s+2000 × 900 mm · height 850 mm/, `${at}: the furniture`);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await drawer.getByRole("button", { name: "Copy all" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /^My house — Ground Floor\nRoom 1: 8000 × 6500 mm/, `${at}: Copy all copies a heading and every line`);
  assert.match(copied, /Measurement M1: 3625 mm/);
  await drawer.getByRole("button", { name: "Copy Measurement M1" }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Measurement M1: 3625 mm", `${at}: one line copies one line`);
  assert.ok(await drawer.getByRole("button", { name: "Send to Agenda" }).isDisabled(), `${at}: Send to Agenda waits for the plan to be in a project`);

  // Units follow the project's setting.
  await page.getByRole("button", { name: "Project menu" }).click();
  await page.getByRole("menuitem", { name: /^Units: mm/ }).click();
  await page.getByRole("button", { name: "Project menu" }).click();
  await page.getByRole("menuitem", { name: /^Units: cm/ }).click();
  assert.match(await drawer.innerText(), /Room 1\s+8\.00 × 6\.50 m · 52\.00 m² · perimeter 29\.00 m/, `${at}: in metres, the room as 8.00 × 6.50 m`);
  assert.match(await drawer.innerText(), /Measurement M1\s+3\.625 m/, `${at}: and a measurement to the millimetre`);
}

/**
 * 2D and 3D are one model, and 3D is only for looking. Edits made on the plan
 * are read back from the live three.js scene.
 */
async function checkThreeD(page, at) {
  await fresh(page);
  await newHouse(page);
  const { drag, tapAt } = await gestures(page);
  const plan = async () => { await page.getByRole("tab", { name: "Plan" }).click(); await page.locator(PLAN).waitFor(); };
  const depth = (box) => box.max[2] - box.min[2];
  const near = (a, b) => Math.abs(a - b) < 0.005;
  const undo = async () => { await page.getByRole("button", { name: "Undo", exact: true }).click(); await page.waitForTimeout(150); };

  assert.equal(await page.locator("canvas").count(), 0, `${at}: the 3D engine is not loaded with the plan`);
  await page.getByRole("button", { name: "View 3D" }).click();
  await page.waitForFunction(() => [...window.__scenes].some((scene) => scene.getObjectByName("level:ground-floor")), null, { timeout: 20000 });
  const start = await liveScene(page);
  assert.ok(start.boxes["walls:ground-floor"], `${at}: View 3D shows the walls`);
  assert.equal(start.boxes["main-roof"], undefined, `${at}: and no roof over the rooms`);
  for (const view of ["Orbit", "Top", "Walk", "Reset"]) assert.ok(await page.getByRole("button", { name: view, exact: true }).isVisible(), `${at}: 3D offers ${view}`);
  const [cx, cy] = await page.locator("canvas").evaluate((canvas) => { const box = canvas.getBoundingClientRect(); return [box.left + box.width / 2, box.top + box.height / 2]; });
  await page.touchscreen.tap(cx, cy);
  assert.equal(await bar(page).count(), 0, `${at}: tapping the 3D view selects nothing — editing is on the plan`);
  await page.getByRole("button", { name: "Back to plan" }).click();
  await page.locator(PLAN).waitFor();

  await tapAt(2000, 0);
  await drag([3000, 0], [3000, -500]);
  await open3D(page);
  assert.ok(near(depth((await liveScene(page)).boxes["walls:ground-floor"]) - depth(start.boxes["walls:ground-floor"]), 0.5), `${at}: a wall moved on the plan moves in 3D`);
  await plan();
  await undo();
  await open3D(page);
  assert.ok(near(depth((await liveScene(page)).boxes["walls:ground-floor"]), depth(start.boxes["walls:ground-floor"])), `${at}: and undo moves it back in 3D`);
  await plan();

  await rail(page).getByRole("button", { name: "Door", exact: true }).click();
  await tapAt(4000, 0);
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
  await open3D(page);
  const doorAt = (state) => { const name = Object.keys(state.boxes).find((key) => key.includes(":door:")); return state.boxes[name].min[0] - state.boxes["walls:ground-floor"].min[0]; };
  const placed = await liveScene(page);
  assert.ok(Object.keys(placed.boxes).some((key) => key.includes(":door:")), `${at}: a door placed on the plan appears in 3D`);
  await plan();
  await tapAt(4000, 0);
  await drag([4000, 0], [5000, 0]);
  await open3D(page);
  assert.ok(near(doorAt(await liveScene(page)) - doorAt(placed), 1), `${at}: and slides with it`);
  await plan();

  await open3D(page);
  const before = (await liveScene(page)).meshes;
  await plan();
  await rail(page).getByRole("button", { name: "Room", exact: true }).click();
  await drag([1000, 1000], [4000, 4000]);
  await open3D(page);
  assert.equal((await liveScene(page)).meshes - before, 4, `${at}: a room drawn on the plan raises its four walls`);
  await plan();
  await undo();
  await open3D(page);
  assert.equal((await liveScene(page)).meshes, before, `${at}: undo takes them down`);
  await plan();

  await page.getByRole("button", { name: /^Floor: Ground Floor/ }).click();
  await page.getByRole("menuitem", { name: "+ Add floor" }).click();
  await open3D(page);
  const raised = await liveScene(page);
  assert.ok(raised.boxes["walls:floor-2"] && near(raised.boxes["walls:floor-2"].min[1], 3), `${at}: a new floor stands on the one below`);
  assert.ok(raised.boxes["floor-2:slab"], `${at}: on its own slab`);
  await plan();
  await undo();
  assert.match(await page.getByRole("button", { name: /^Floor: / }).getAttribute("aria-label"), /Ground Floor/, `${at}: undo goes back to a floor that exists`);
  await open3D(page);
  assert.equal((await liveScene(page)).boxes["walls:floor-2"], undefined, `${at}: and removes the floor from 3D`);
  await plan();

  await rail(page).getByRole("button", { name: "Stair", exact: true }).click();
  await tapAt(2000, 3000);
  await rail(page).getByRole("button", { name: "Furniture", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Furniture" }).getByRole("radio", { name: /^Bed/ }).click();
  await tapAt(6000, 3500);
  await open3D(page);
  const shown = await liveScene(page);
  const stair = Object.entries(shown.boxes).find(([key]) => key.startsWith("stair:"))?.[1];
  assert.ok(stair && near(stair.max[0] - stair.min[0], 1), `${at}: a stair is a stair's width, whatever tool came before`);
  const bed = Object.entries(shown.boxes).find(([key]) => key.startsWith("furniture:"))?.[1];
  assert.ok(bed && near(bed.max[0] - bed.min[0], 1.6) && near(bed.max[2] - bed.min[2], 2), `${at}: furniture appears in 3D at its size`);

  // Walk: a person's eye height, inside the house.
  await page.getByRole("button", { name: "Walk", exact: true }).click();
  await page.waitForTimeout(300);
  const eye = await page.evaluate(() => window.__houseCamera?.position.y);
  assert.ok(eye > 1.5 && eye < 1.7, `${at}: Walk puts the camera at eye height (${eye})`);
  const from = await page.evaluate(() => window.__houseCamera.position.toArray());
  await page.getByRole("button", { name: "Walk forward" }).click();
  await page.waitForTimeout(200);
  const to = await page.evaluate(() => window.__houseCamera.position.toArray());
  assert.ok(Math.abs(Math.hypot(to[0] - from[0], to[2] - from[2]) - 0.75) < 1e-6, `${at}: a step forward is 0.75 m (${JSON.stringify([from, to])})`);
  assert.ok(Math.abs(to[1] - eye) < 1e-6, `${at}: and keeps the eye height`);
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => window.__houseCamera.position.y > 5), `${at}: Top looks down on the plan`);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await plan();
}

/** "How do you want to start?" — every choice is real and fits a phone. */
async function checkStart(page, at) {
  await fresh(page);
  const choices = page.getByRole("radiogroup", { name: "How to start" }).getByRole("radio");
  assert.equal(await page.getByText("Design setup").count() + await page.getByText("Original Floor Plan Strict").count(), 0, `${at}: no setup panel before there is a plan`);
  assert.deepEqual((await choices.allInnerTexts()).map((text) => text.split("\n")[0]), ["Draw manually", "Draw rooms", "Upload floor plan", "Upload hand sketch", "Use a template", "Describe it (AI)"], `${at}: six ways to start`);
  assert.ok(await page.getByRole("button", { name: "Draw floor plan", exact: true }).evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight), `${at}: the choices and the way on fit one screen`);
  await page.getByRole("radio", { name: /Upload floor plan/ }).click();
  assert.ok(await page.getByRole("button", { name: "Convert with AI" }).isDisabled(), `${at}: nothing to convert until a plan is uploaded`);
  assert.ok(await page.getByRole("button", { name: "Trace it myself" }).isDisabled(), `${at}: or to trace`);
  await page.getByRole("radio", { name: /Draw rooms/ }).click();
  await page.getByRole("button", { name: "Start drawing rooms" }).click();
  assert.ok(await page.getByRole("radiogroup", { name: "Room shape" }).isVisible(), `${at}: drawing rooms opens with the Room tool ready`);
  await fresh(page);
  await page.getByRole("radio", { name: /Use a template/ }).click();
  await page.getByRole("radio", { name: /Three-bedroom/ }).click();
  await page.getByRole("button", { name: "Use this template" }).click();
  await page.locator(PLAN).waitFor();
  const options = await page.evaluate(() => [...document.querySelectorAll("#house-properties option")].map((option) => option.textContent));
  assert.equal(options.filter((text) => /^Wall \d+$/.test(text)).length, 7, `${at}: a template arrives with its walls`);
  assert.equal(options.filter((text) => /^Door/.test(text)).length, 4, `${at}: doors`);
  assert.equal(options.filter((text) => /^Window/.test(text)).length, 4, `${at}: and windows`);
  assert.equal(await page.getByRole("button", { name: /Finish design/ }).count(), 0, `${at}: there is no "finish": a plan is saved and keeps changing`);
  const structure = await page.evaluate(() => [...document.querySelectorAll("#house-properties option")].map((option) => option.value).filter((value) => /^(column|beam|grid|foundation)\|/.test(value)));
  assert.deepEqual(structure, [], `${at}: nor any structure`);
  // An outside wall moves like any other: nothing hidden refuses it.
  const { drag } = await gestures(page);
  await drag([4500, 0], [4500, -500]);
  assert.doesNotMatch(await toasts(page), /Strict/, `${at}: no hidden setting refuses the move`);

  // Describe it (AI). No model is reachable here, so the endpoint answers as
  // a model's checked plan would; what is tested is everything around it.
  const plan = { version: 1, corners: [{ id: "c1", x: 0, y: 0 }, { id: "c2", x: 9000, y: 0 }, { id: "c3", x: 9000, y: 7000 }, { id: "c4", x: 0, y: 7000 }], wallThickness: 200, ceilingHeight: 2800, openings: [{ id: "o1", kind: "door", wallId: "c3", offset: 4000, width: 1000, height: 2100, sill: 0, swing: "in-right", label: "Entrance" }], runWalls: [], interiorWalls: [{ id: "iw1", start: { x: 4500, y: 0 }, end: { x: 4500, y: 7000 }, thickness: 120, height: 2800, label: "Interior wall" }], zones: [{ id: "r1", name: "Bedroom", boundary: [{ x: 0, y: 0 }, { x: 4500, y: 0 }, { x: 4500, y: 7000 }, { x: 0, y: 7000 }], floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" }, { id: "r2", name: "Living", boundary: [{ x: 4500, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 7000 }, { x: 4500, y: 7000 }], floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" }], planColumns: [], planStairs: [], dimensions: [], planPlatforms: [] };
  let sent = null;
  let answer = { status: 502, body: { error: "A plan could not be drawn from that description. Try again, or draw it yourself." } };
  await page.route("**/api/house-design/generate-plan", async (route) => { sent = route.request().postDataJSON(); await route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) }); });
  await fresh(page);
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
  // The refusal's toast sits over the button on a phone (the app's toasts are
  // at the bottom everywhere), so the button is pressed from the keyboard.
  await page.getByRole("button", { name: "Generate plan" }).press("Enter");
  await page.locator(PLAN).waitFor();
  const drawn = await page.evaluate(() => [...document.querySelectorAll("#house-properties option")].map((option) => option.textContent));
  assert.equal(drawn.filter((text) => /^Wall \d+$/.test(text)).length, 5, `${at}: the generated plan opens to be checked, walls and all`);
  assert.match(await page.locator("#workspace").innerText(), /Assumed a single storey/, `${at}: and the AI's assumptions shown`);
  await page.unroute("**/api/house-design/generate-plan");
}

/**
 * Suggest Columns proposes; only Accept changes the model. Read back from the
 * plan's own object list, so "nothing changed" means nothing changed.
 */
async function checkSuggestions(page, at) {
  await fresh(page);
  await newHouse(page);
  const { touch } = await gestures(page);
  const columns = () => optionCount(page, "^Column \\d+$");
  const marks = () => page.evaluate((selector) => [...document.querySelectorAll(`${selector} [aria-label^="Suggested column"] rect`)].map((rect) => `${Math.round(+rect.getAttribute("x") + +rect.getAttribute("width") / 2)}:${Math.round(+rect.getAttribute("y") + +rect.getAttribute("height") / 2)}`).sort(), PLAN);
  const panel = page.getByRole("region", { name: "Suggested columns" });
  const open = async () => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Suggest columns" }).click();
  };

  const start = await columns();
  await open();
  assert.deepEqual(await marks(), ["0:0", "0:3250", "0:6500", "4000:0", "4000:6500", "8000:0", "8000:3250", "8000:6500"], `${at}: a column is suggested at each corner and mid-span on each long wall`);
  assert.equal(await columns(), start, `${at}: suggesting changes nothing in the model`);

  const [gx, gy] = await screen(page, 4000, 0);
  await page.touchscreen.tap(gx, gy);
  assert.match(await panel.innerText(), /8\.0 m span/, `${at}: a chosen suggestion says why`);
  await panel.getByRole("button", { name: "Accept", exact: true }).click();
  assert.equal(await columns(), start + 1, `${at}: accepting one adds one`);

  const [ax, ay] = await screen(page, 0, 3250);
  const [, by] = await screen(page, 0, 2250);
  await touch("touchStart", [[ax, ay]]);
  for (let step = 1; step <= 6; step += 1) await touch("touchMove", [[ax, ay + (by - ay) * step / 6]]);
  await touch("touchEnd", []);
  await page.waitForTimeout(150);
  assert.deepEqual(await marks(), ["0:0", "0:2250", "0:6500", "4000:6500", "8000:0", "8000:3250", "8000:6500"], `${at}: a suggestion drags to where you want it`);
  await page.getByRole("button", { name: "Accept all" }).click();
  assert.equal(await columns(), start + 8, `${at}: accept all adds the rest`);
  assert.equal(await panel.count(), 0, `${at}: nothing is left to suggest`);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await columns(), start + 1, `${at}: one undo takes accept-all back`);

  await open();
  await page.getByLabel("Maximum span").selectOption("3000");
  assert.ok((await marks()).length > 7, `${at}: a shorter span asks for more columns`);
  await panel.getByRole("button", { name: "Clear" }).click();
  assert.equal((await marks()).length, 0, `${at}: and Clear takes the suggestions away`);
  assert.equal(await columns(), start + 1, `${at}: without touching the model`);
}

/**
 * From a blank project: split a room with a wall, move an inside wall and
 * watch what is attached to it follow, merge two rooms, snap a wall parallel
 * to a diagonal one.
 */
async function checkRooms(page, at) {
  await fresh(page);
  await newHouse(page);
  const { drag, tapAt: tap } = await gestures(page);
  const rooms = () => page.evaluate(() => [...document.querySelectorAll('svg[aria-label="Floor plan"] polygon')]
    .filter((polygon) => (polygon.getAttribute("class") ?? "").includes("fill-sky"))
    .map((polygon) => { const points = polygon.getAttribute("points").trim().split(/\s+/).map((pair) => pair.split(",").map(Number)); const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1]); return `${Math.min(...xs)}..${Math.max(...xs)} x ${Math.min(...ys)}..${Math.max(...ys)}`; })
    .sort());
  const selectedLine = () => page.locator(`${PLAN} line[stroke-opacity="0.28"]`).first().evaluate((line) => ["x1", "y1", "x2", "y2"].map((name) => Math.round(Number(line.getAttribute(name)) * 10) / 10));
  const snapOn = async (on) => {
    const snap = page.getByRole("button", { name: "Snap", exact: true });
    if ((await snap.getAttribute("aria-pressed")) !== String(on)) await snap.click();
  };

  assert.deepEqual(await rooms(), ["0..8000 x 0..6500"], `${at}: the outline drawn on blank space is one room`);

  // Split: a wall right across the house divides it.
  await rail(page).getByRole("button", { name: "Wall", exact: true }).click();
  await tap(3000, 0);
  await tap(3000, 6500);
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
  assert.deepEqual(await rooms(), ["0..3000 x 0..6500", "3000..8000 x 0..6500"], `${at}: a wall across a room splits it`);
  await rail(page).getByRole("button", { name: "Wall", exact: true }).click();
  await tap(3000, 3000);
  await tap(8000, 3000);
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
  assert.deepEqual(await rooms(), ["0..3000 x 0..6500", "3000..8000 x 0..3000", "3000..8000 x 3000..6500"], `${at}: and a wall from wall to wall splits again`);
  const before = await walls(page);

  // Move: the inside wall goes to x = 4000; the wall butting into it and the
  // rooms either side follow; the outside walls do not move.
  await tap(3000, 1500);
  await drag([3000, 1500], [4000, 1500]);
  await tap(4000, 2500);
  assert.deepEqual(await selectedLine(), [4000, 0, 4000, 6500], `${at}: the inside wall moved`);
  await tap(6000, 3000);
  assert.deepEqual(await selectedLine(), [4000, 3000, 8000, 3000], `${at}: the wall joined to it followed`);
  assert.deepEqual(await rooms(), ["0..4000 x 0..6500", "4000..8000 x 0..3000", "4000..8000 x 3000..6500"], `${at}: and so did the rooms`);

  // Rename a room in its sheet; merge two rooms. The selected wall's
  // distances sit in the rooms beside it, so let go of it first.
  await tap(-700, 7200);
  assert.equal(await bar(page).count(), 0, `${at}: a tap on nothing lets go`);
  await tap(6000, 1500);
  assert.deepEqual(await barButtons(page), ["Split", "Duplicate", "Rename", "More actions"], `${at}: a room is split, duplicated, renamed`);
  await bar(page).getByRole("button", { name: "Rename" }).click();
  assert.match(await sheet(page).getAttribute("aria-label"), /^Room \d+ properties$/);
  assert.match(await sheet(page).innerText(), /4000 × 3000 mm[\s\S]*12\.00 m²[\s\S]*14000 mm/, `${at}: a room's sheet gives its size, area and perimeter`);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Name", `${at}: Rename starts on the name`);
  await sheet(page).getByLabel("Name").fill("Kitchen");
  await sheet(page).getByLabel("Name").press("Enter");
  await page.waitForTimeout(100);
  assert.equal(await sheet(page).getAttribute("aria-label"), "Kitchen properties", `${at}: a room is renamed in place`);
  await sheet(page).getByRole("button", { name: "Close" }).click();
  await more(page, "Merge with…");
  await tap(6000, 5000);
  assert.deepEqual(await rooms(), ["0..4000 x 0..6500", "4000..8000 x 0..6500"], `${at}: two rooms merge into one`);
  assert.equal(await walls(page), before - 1, `${at}: losing the wall between them`);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal((await rooms()).length, 3, `${at}: and undo divides them again`);
  await page.getByRole("button", { name: "Redo", exact: true }).click();

  // Parallel: a diagonal wall drawn freehand, then one aimed 1.5° off it.
  await snapOn(false);
  await rail(page).getByRole("button", { name: "Wall", exact: true }).click();
  await tap(500, 5900);
  await tap(2600, 4700);
  const diagonal = await selectedLine();
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
  await snapOn(true);
  await rail(page).getByRole("button", { name: "Wall", exact: true }).click();
  const angle = Math.atan2(diagonal[3] - diagonal[1], diagonal[2] - diagonal[0]);
  await tap(1000, 5000);
  await tap(1000 + Math.cos(angle + 0.026) * 2200, 5000 + Math.sin(angle + 0.026) * 2200);
  const parallel = await selectedLine();
  const difference = Math.abs(Math.atan2(parallel[3] - parallel[1], parallel[2] - parallel[0]) - angle) * 180 / Math.PI;
  assert.ok(difference < 0.01, `${at}: aimed 1.5° off, the wall lands parallel (${difference.toFixed(4)}°)`);
  assert.ok(parallel[2] % 1000 !== 0 || parallel[3] % 1000 !== 0, `${at}: on the parallel, not on the grid`);
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
}

/** Desktop keys: Delete, Ctrl+Z, Ctrl+Shift+Z, Esc, V and M. */
async function checkKeyboard(page, at) {
  await fresh(page);
  await newHouse(page);
  const { tapAt } = await gestures(page);
  await tapAt(4000, 0);
  await page.locator(PLAN).focus();
  await page.keyboard.press("Delete");
  assert.equal(await walls(page), 3, `${at}: Delete deletes the selection`);
  await page.keyboard.press("Control+z");
  assert.equal(await walls(page), 4, `${at}: Ctrl+Z undoes`);
  await page.keyboard.press("Control+Shift+z");
  assert.equal(await walls(page), 3, `${at}: Ctrl+Shift+Z redoes`);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("m");
  assert.equal(await rail(page).getByRole("button", { name: "Measure" }).getAttribute("aria-pressed"), "true", `${at}: M picks Measure`);
  await page.keyboard.press("Escape");
  assert.equal(await rail(page).getByRole("button", { name: "Select" }).getAttribute("aria-pressed"), "true", `${at}: Esc leaves the tool`);
  await rail(page).getByRole("button", { name: "Wall" }).click();
  await page.locator(PLAN).focus();
  await page.keyboard.press("v");
  assert.equal(await rail(page).getByRole("button", { name: "Select" }).getAttribute("aria-pressed"), "true", `${at}: V picks Select`);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Text label" }).click();
  await page.keyboard.press("v");
  assert.equal(await rail(page).getByRole("button", { name: "Select" }).getAttribute("aria-pressed"), "true", `${at}: from any tool`);
}

console.log("House Plan touch + 3D: the nine-tool toolbar, contextual sheets, layout, pinch, pan, tap, delete/undo, long-press, room drawing, typed lengths, doors and windows, wall moves, locks, floors, furniture, Measure and the Measurements drawer, units, view-only 3D with walk and top view, column suggestions, the start choices, split/merge/rename rooms, inside-wall moves, parallel snapping and desktop keys passed at 360–430px");
