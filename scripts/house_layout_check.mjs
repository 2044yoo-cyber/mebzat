/**
 * The fast layout on a phone: one outline, then rooms by splitting, a
 * partition duplicated and placed by a typed distance, walls lengthened from
 * either end, ends dragged onto snaps, a room copied into place — every step
 * one undo.
 *
 *   node scripts/house_layout_check.mjs
 *
 * Bundles the workspace on its own (see house_harness.mjs).
 */
import assert from "node:assert/strict";

import { openHarness, PLAN, UNDER } from "./house_harness.mjs";

const harness = await openHarness();
if (!harness) {
  console.log("SKIP: house layout check needs Playwright (npm i -g playwright)");
  process.exit(0);
}
const { browser, url } = harness;

const screen = (page, x, y) => page.evaluate(([selector, x, y]) => {
  const point = new DOMPoint(x, y).matrixTransform(document.querySelector(selector).getScreenCTM());
  return [point.x, point.y];
}, [PLAN, x, y]);
const bar = (page) => page.getByRole("toolbar", { name: / actions$|^Split room$/ });
const rail = (page) => page.locator('nav[aria-label="Modeling tools"]');
const lengthField = (page) => page.locator('input[aria-label="Selected object temporary length"]');
const undo = (page) => page.getByRole("button", { name: "Undo", exact: true }).click();
const rooms = (page) => page.evaluate(() => [...document.querySelectorAll('svg[aria-label="Floor plan"] polygon')]
  .filter((polygon) => (polygon.getAttribute("class") ?? "").includes("fill-sky"))
  .map((polygon) => { const points = polygon.getAttribute("points").trim().split(/\s+/).map((pair) => pair.split(",").map(Number)); const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1]); return `${Math.round(Math.min(...xs))}..${Math.round(Math.max(...xs))} x ${Math.round(Math.min(...ys))}..${Math.round(Math.max(...ys))}`; })
  .sort());
const selectedLine = (page) => page.locator(`${PLAN} line[stroke-opacity="0.28"]`).first().evaluate((line) => { const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((name) => Math.round(Number(line.getAttribute(name)))); return x1 < x2 || (x1 === x2 && y1 < y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1]; });
const texts = (page, selector) => page.locator(`${PLAN} ${selector}`).evaluateAll((items) => items.map((item) => item.textContent));
/** Centre of an overlay element on screen. */
const centreOf = (page, selector) => page.locator(`${PLAN} ${selector}`).evaluateAll((items) => items.map((item) => { const box = item.getBoundingClientRect(); return [box.left + box.width / 2, box.top + box.height / 2]; }));

async function gestures(page) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  /** Screen-space drag, left open when `hold` is given so the live state can be read before release. */
  const slide = async ([ax, ay], [bx, by], during) => {
    await touch("touchStart", [[ax, ay]]);
    for (let step = 1; step <= 8; step += 1) await touch("touchMove", [[ax + (bx - ax) * step / 8, ay + (by - ay) * step / 8]]);
    await page.waitForTimeout(80);
    const seen = during ? await during() : undefined;
    await touch("touchEnd", []);
    await page.waitForTimeout(200);
    return seen;
  };
  const drag = async (from, to, during) => slide(await screen(page, ...from), await screen(page, ...to), during);
  const tapAt = async (x, y) => { const [sx, sy] = await screen(page, x, y); await page.touchscreen.tap(sx, sy); await page.waitForTimeout(150); };
  const press = async ([x, y], ms) => { await touch("touchStart", [[x, y]]); await page.waitForTimeout(ms); const live = await texts(page, 'text[aria-label="Live length"]'); await touch("touchEnd", []); await page.waitForTimeout(200); return live; };
  return { drag, slide, tapAt, press };
}

const errors = [];
const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  const { drag, slide, tapAt, press } = await gestures(page);
  const nothing = () => tapAt(-1200, 12500);

  // One exterior rectangle, 9000 × 11000, by typed lengths.
  await page.getByRole("button", { name: "Draw floor plan", exact: true }).click();
  await page.locator(PLAN).waitFor();
  await page.evaluate(() => document.getElementById("workspace").scrollTo(0, 0));
  const [ox, oy] = await screen(page, 0, 0);
  await page.touchscreen.tap(ox, oy);
  for (const [direction, length] of [["→", 9000], ["↓", 11000], ["←", 9000], ["↑", 11000]]) {
    await page.getByRole("button", { name: `Run ${direction}` }).click();
    await page.getByLabel("Typed length").fill(String(length));
    await page.getByLabel("Typed length").press("Enter");
  }
  await page.locator(UNDER).waitFor();
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
  assert.deepEqual(await rooms(page), ["0..9000 x 0..11000"]);

  // Tap the room: Split → Vertical. One tap, at the centre.
  await tapAt(2000, 8000);
  assert.equal(await bar(page).getAttribute("aria-label"), "Room actions");
  for (const box of await bar(page).getByRole("button").evaluateAll((buttons) => buttons.map((button) => { const rect = button.getBoundingClientRect(); return [rect.width, rect.height]; }))) assert.ok(box[0] >= 44 && box[1] >= 44, `every action is at least 44 px (${box})`);
  await bar(page).getByRole("button", { name: "Split" }).click();
  assert.equal(await bar(page).getAttribute("aria-label"), "Split room");
  await bar(page).getByRole("button", { name: "│ Vertical" }).click();
  assert.deepEqual(await rooms(page), ["0..4500 x 0..11000", "4500..9000 x 0..11000"], "split down the middle: 4500 | 4500");
  assert.deepEqual(await selectedLine(page), [4500, 0, 4500, 11000], "the new partition is selected");
  assert.equal(await bar(page).getAttribute("aria-label"), "Wall actions");
  await undo(page);
  assert.deepEqual(await rooms(page), ["0..9000 x 0..11000"], "one undo takes the split back");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal((await rooms(page)).length, 2);

  // Split the left half horizontally.
  await nothing();
  await tapAt(2000, 8000);
  await bar(page).getByRole("button", { name: "Split" }).click();
  await bar(page).getByRole("button", { name: "─ Horizontal" }).click();
  assert.deepEqual(await rooms(page), ["0..4500 x 0..5500", "0..4500 x 5500..11000", "4500..9000 x 0..11000"], "and the left half across");

  // The floor's X and Y chains show while something is selected.
  assert.deepEqual(await texts(page, 'g[aria-label="X chain"] text'), ["4500", "4500"], "X chain along the top");
  assert.deepEqual(await texts(page, 'g[aria-label="Y chain"] text'), ["5500", "5500"], "Y chain down the side");
  await nothing();
  assert.equal(await page.locator(`${PLAN} g[aria-label="Dimension chains"]`).count(), 0, "and only then");

  // Duplicate the partition: a parallel copy, halfway to the next wall, selected.
  await tapAt(4500, 9000);
  assert.deepEqual(await selectedLine(page), [4500, 0, 4500, 11000]);
  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  assert.deepEqual(await selectedLine(page), [6750, 0, 6750, 11000], "the copy lands halfway to the next wall");
  assert.equal(await page.locator(`${PLAN} input[aria-label="Distance before"]`).inputValue(), "2250", "the space to the partition");
  assert.equal(await page.locator(`${PLAN} input[aria-label="Distance after"]`).inputValue(), "2250", "and to the outside wall");
  assert.deepEqual(await texts(page, 'text[aria-label="Overall"]'), ["Overall 9000"]);

  // Drag it: the chain reads live, before the finger lifts.
  const live = await drag([6750, 4000], [7750, 4000], () => texts(page, 'g[aria-label="Distances"] text[aria-label="Distance"]'));
  assert.deepEqual(live, ["4500", "3250", "1250"], "while dragging, the spaces either side update");
  assert.deepEqual(await selectedLine(page), [7750, 0, 7750, 11000], "and the copy is where it was let go");
  await undo(page);
  assert.deepEqual(await selectedLine(page), [6750, 0, 6750, 11000], "one undo puts it back");

  // Tap the space, type 2800: the copy moves, the partition stays.
  await page.locator(`${PLAN} input[aria-label="Distance before"]`).fill("2800");
  await page.locator(`${PLAN} input[aria-label="Distance before"]`).press("Enter");
  assert.deepEqual(await selectedLine(page), [7300, 0, 7300, 11000], "2800 from the partition");
  assert.ok((await rooms(page)).includes("4500..7300 x 0..11000"), "the room between is 2800 wide");
  await undo(page);
  assert.deepEqual(await selectedLine(page), [6750, 0, 6750, 11000], "a typed distance is one undo");

  // A narrow gap: the fields either side of the wall do not sit on each other.
  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  assert.deepEqual(await selectedLine(page), [7875, 0, 7875, 11000], "a second copy, halfway again");
  const boxes = await page.locator(`${PLAN} input[aria-label^="Distance "]`).evaluateAll((inputs) => inputs.map((input) => input.getBoundingClientRect().toJSON()));
  assert.equal(boxes.length, 2);
  const [one, two] = boxes;
  assert.ok(one.right <= two.left || two.right <= one.left || one.bottom <= two.top || two.bottom <= one.top, `1125 either side: the two fields apart (${JSON.stringify(boxes.map((box) => [Math.round(box.left), Math.round(box.top)]))})`);
  await undo(page);

  // + / − at the ends of the wall across the left half.
  await nothing();
  await tapAt(2000, 5500);
  assert.deepEqual(await selectedLine(page), [0, 5500, 4500, 5500]);
  assert.equal(await lengthField(page).inputValue(), "4500");
  const minus = await centreOf(page, 'g[aria-label="Shorten from end"]');
  const [end] = await centreOf(page, 'circle[aria-label="Wall end handle"]');
  assert.equal(minus.length, 1);
  const shortenStart = await centreOf(page, 'g[aria-label="Shorten from start"]');
  assert.ok(Math.abs(minus[0][0] - end[0]) < Math.abs(shortenStart[0][0] - end[0]), "the end's − sits by the end");
  await page.touchscreen.tap(...minus[0]);
  await page.waitForTimeout(150);
  assert.equal(await lengthField(page).inputValue(), "4450", "a tap on − takes 50 off the end");
  assert.deepEqual(await selectedLine(page), [0, 5500, 4450, 5500], "the other end stays");
  await undo(page);
  assert.equal(await lengthField(page).inputValue(), "4500", "one undo");
  const held = await press(minus[0], 1400);
  assert.ok(held.length === 1 && Number(held[0].split(" ")[0]) < 4000, `held, it keeps going, with the live length shown (${held})`);
  const after = Number(await lengthField(page).inputValue());
  assert.ok(after < 4000 && after % 50 === 0, `and lands on what was shown (${after})`);
  assert.equal(held[0], `${after} mm`);
  await undo(page);
  assert.equal(await lengthField(page).inputValue(), "4500", "the whole hold is one undo");
  const plus = await centreOf(page, 'g[aria-label="Lengthen from start"]');
  await page.touchscreen.tap(...plus[0]);
  await page.waitForTimeout(150);
  assert.deepEqual(await selectedLine(page), [-50, 5500, 4500, 5500], "+ at the start grows it from that end");
  await undo(page);

  // Drag the end handle near a grid point: it snaps there.
  const [ex, ey] = end;
  const [gx, gy] = await screen(page, 3000, 5500);
  const snap = await slide([ex, ey], [gx + 0.4, gy + 2], () => page.locator(PLAN).textContent());
  assert.match(snap, /Grid|Midpoint|Intersection|Endpoint|Perpendicular|Parallel|Room corner/, "the snap is named while dragging");
  assert.deepEqual(await selectedLine(page), [0, 5500, 3000, 5500], "and the end lands on it, exactly");
  assert.equal(await lengthField(page).inputValue(), "3000");

  // ↻ 90°: an inside wall turns about its middle.
  await bar(page).getByRole("button", { name: "↻ 90°" }).click();
  assert.deepEqual(await selectedLine(page), [1500, 4000, 1500, 7000], "turned upright, the same length");
  await undo(page);
  assert.deepEqual(await selectedLine(page), [0, 5500, 3000, 5500], "one undo");
  await undo(page);
  assert.deepEqual(await selectedLine(page), [0, 5500, 4500, 5500], "and the end drag was one too");

  // Duplicate a room: a copy to place, turned, snapping to the floor's lines.
  await nothing();
  await tapAt(8000, 8000);
  assert.equal(await bar(page).getAttribute("aria-label"), "Room actions");
  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  const placing = page.getByRole("region", { name: "Place room copy" });
  await placing.waitFor();
  assert.equal(await page.locator(`${PLAN} g[aria-label="Room copy"]`).count(), 1, "the copy is shown, to drag");
  await placing.getByRole("button", { name: "↻ 90°" }).click();
  const ghost = () => page.locator(`${PLAN} g[aria-label="Room copy"] rect`).evaluate((rect) => ["x", "y", "width", "height"].map((name) => Math.round(Number(rect.getAttribute(name)))));
  assert.deepEqual(await ghost(), [9000, 0, 11000, 2250], "turned a quarter, beside the house");
  // Dragged down, let go a few pixels short of the 5500 line: it snaps onto it.
  const [sx, sy] = await screen(page, 9800, 1000);
  const [, ty] = await screen(page, 9800, 6500);
  await slide([sx, sy], [sx, ty - 6]);
  assert.deepEqual(await ghost(), [9000, 5500, 11000, 2250], "dragged, its edge snaps to the floor's line");
  await placing.getByRole("button", { name: "Place" }).click();
  const placed = await rooms(page);
  assert.ok(placed.includes("9000..20000 x 5500..7750"), `placed where it was shown (${placed})`);
  await undo(page);
  assert.ok(!(await rooms(page)).some((room) => room.startsWith("9000..20000")), "one undo removes the copy");

  // The Split tool: tap a room's side, set the first part exactly.
  await rail(page).getByRole("button", { name: "Split", exact: true }).click();
  await tapAt(8000, 300);
  const form = page.getByRole("form", { name: "Split" });
  await form.waitFor();
  assert.equal(await page.locator(`${PLAN} g[aria-label="Split preview"]`).count(), 1, "a preview of the line");
  assert.equal(await form.getByRole("button", { name: "50 / 50" }).getAttribute("aria-pressed"), "true", "50 / 50 to begin with");
  await form.getByLabel("First part").fill("1000");
  await form.getByLabel("First part").press("Enter");
  await form.getByRole("button", { name: "Split", exact: true }).click();
  const split = await rooms(page);
  assert.ok(split.includes("6750..7750 x 0..11000") && split.includes("7750..9000 x 0..11000"), `the first part exactly 1000 (${split})`);
  await undo(page);
  assert.ok((await rooms(page)).includes("6750..9000 x 0..11000"), "one undo");

  // A room apart from the house: dragged to a new place, then deleted.
  const wallCount = () => page.evaluate(() => [...document.querySelectorAll("#house-properties option")].filter((option) => /^Wall \d+$/.test(option.textContent)).length);
  const before = await wallCount();
  await rail(page).getByRole("button", { name: "Room", exact: true }).click();
  await drag([10000, 7000], [12000, 9000]);
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
  assert.ok((await rooms(page)).includes("10000..12000 x 7000..9000"), `a room drawn apart (${await rooms(page)})`);
  assert.equal(await wallCount(), before + 4);
  await nothing();
  await tapAt(11000, 8000);
  assert.equal(await bar(page).getAttribute("aria-label"), "Room actions");
  await drag([11000, 8000], [11000, 9000]);
  assert.ok((await rooms(page)).includes("10000..12000 x 8000..10000"), `a selected room is dragged to a new place (${await rooms(page)})`);
  assert.equal(await wallCount(), before + 4, "its walls with it");
  await undo(page);
  assert.ok((await rooms(page)).includes("10000..12000 x 7000..9000"), "one undo");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await nothing();
  await tapAt(11000, 9000);
  await bar(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  assert.ok(!(await rooms(page)).some((room) => room.startsWith("10000..")), "a room is deleted");
  assert.equal(await wallCount(), before, "with its walls");
  await undo(page);
  assert.equal(await wallCount(), before + 4, "and undo brings it back");
  await undo(page);
  await undo(page);
  assert.equal(await wallCount(), before);

  // Drawn freehand, a wall's length is a fraction; its field reads whole millimetres.
  await page.getByRole("button", { name: "Snap", exact: true }).click();
  await rail(page).getByRole("button", { name: "Wall", exact: true }).click();
  await tapAt(1234, 2345);
  await tapAt(3456, 4321);
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
  const freehand = await lengthField(page).inputValue();
  assert.match(freehand, /^\d+$/, `a freehand length to the millimetre (${freehand})`);
  await page.getByRole("button", { name: "Snap", exact: true }).click();

  // A template adjusted to a tight plot, faced to a road on the north.
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.getByRole("radio", { name: /Use a template/ }).click();
  await page.getByLabel("Plot width").fill("9.6");
  await page.getByLabel("Plot length").fill("20");
  await page.getByRole("radiogroup", { name: "Which side is the road/front?" }).getByRole("radio", { name: "↑ North" }).click();
  await page.getByRole("button", { name: "Find plans" }).click();
  const adjustable = page.getByRole("region", { name: "Can be adjusted" }).getByRole("button", { name: "3-bedroom standard family house" });
  assert.equal(await adjustable.count(), 1, "8.2 m into 8.0 m: offered as one to adjust");
  await adjustable.click();
  const previewed = page.getByRole("region", { name: "3-bedroom standard family house preview" });
  assert.equal(await previewed.getByLabel("Fit status").innerText(), "DOES NOT FIT AS IS");
  await previewed.getByRole("button", { name: "Adjust to my plot" }).click();
  assert.equal(await previewed.getByLabel("Fit status").innerText(), "ADJUSTED · FITS", "adjusted, it fits");
  assert.match(await previewed.getByRole("status").innerText(), /House 8\.2 × 12\.4 m → 8 × [\d.]+ m[\s\S]*Doors and windows keep their sizes/, "and says what changed");
  await previewed.getByRole("button", { name: "Use this plan" }).click();
  await page.locator(PLAN).waitFor();
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
  const outline = await page.evaluate(() => { const polygon = document.querySelector('svg[aria-label="Floor plan"] polygon'); const points = polygon.getAttribute("points").trim().split(/\s+/).map((pair) => pair.split(",").map(Number)); return [Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]))]; });
  assert.ok(outline.includes(7800), `the adjusted house is 7.8 m between wall centres across (${outline})`);

  assert.deepEqual(errors, [], "page errors");
} finally {
  await page.close();
  await harness.close();
}
console.log("House Plan fast layout: split a room vertically and across, X/Y chains, duplicate a partition, drag it with live distances, type a distance, + / − tap and hold, end handle snapping, rotate 90°, duplicate and place a room, the Split tool — each one undo, at 390px");
