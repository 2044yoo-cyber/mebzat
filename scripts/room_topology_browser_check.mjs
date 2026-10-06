/**
 * Rooms follow the walls on the plan itself: walls dragged with a finger,
 * the blue room outlines read back from the page after each drag.
 *
 *   node scripts/room_topology_browser_check.mjs
 *
 * The bug: dragging a wall dragged the room polygons' corners with it, and
 * the blue floor stretched into triangles. Here a 9000 × 11000 house is split
 * in two and its walls dragged — the partition, then each outside wall, then
 * an outside wall in past the partition — and every room drawn must be a
 * rectangle exactly where the walls are, the shut-out room labelled "not
 * enclosed" with no floor, and undo must bring the rooms back as they were.
 *
 * Bundles the workspace on its own (see house_harness.mjs).
 */
import assert from "node:assert/strict";

import { openHarness, PLAN, UNDER } from "./house_harness.mjs";

const harness = await openHarness();
if (!harness) {
  console.log("SKIP: room topology browser check needs Playwright (npm i -g playwright)");
  process.exit(0);
}
const { browser, url } = harness;

let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const ok = (value, message) => { assert.ok(value, message); checks += 1; };

const screen = (page, x, y) => page.evaluate(([selector, x, y]) => {
  const point = new DOMPoint(x, y).matrixTransform(document.querySelector(selector).getScreenCTM());
  return [point.x, point.y];
}, [PLAN, x, y]);
const bar = (page) => page.getByRole("toolbar", { name: / actions$|^Split room$/ });
const rail = (page) => page.locator('nav[aria-label="Modeling tools"]');
const undo = (page) => page.getByRole("button", { name: "Undo", exact: true }).click();
const redo = (page) => page.getByRole("button", { name: "Redo", exact: true }).click();
/** The blue room outlines as drawn: each one's corners. */
const outlines = (page) => page.evaluate(() => [...document.querySelectorAll('svg[aria-label="Floor plan"] polygon')]
  .filter((polygon) => (polygon.getAttribute("class") ?? "").includes("fill-sky"))
  .map((polygon) => polygon.getAttribute("points").trim().split(/\s+/).map((pair) => pair.split(",").map(Number))));
const boxOf = (points) => { const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1]); return `${Math.round(Math.min(...xs))}..${Math.round(Math.max(...xs))} x ${Math.round(Math.min(...ys))}..${Math.round(Math.max(...ys))}`; };
/** The rooms the model has — what gets a floor, a ceiling and an area — from the object list. */
const modelRooms = (page) => page.evaluate(() => [...document.querySelectorAll("#house-properties option")].filter((option) => option.value.startsWith("room|")).length);
const openLabels = (page) => page.locator(`${UNDER} text[data-zone-open]`).evaluateAll((items) => items.map((item) => item.textContent));

/** Every room drawn is a clean rectangle — four square corners, no diagonal — and together they are `expected`. */
async function rectangles(page, expected, label) {
  const drawn = await outlines(page);
  for (const points of drawn) {
    ok(points.length === 4 && points.every((point, index) => { const next = points[(index + 1) % 4]; return Math.abs(point[0] - next[0]) < 0.5 || Math.abs(point[1] - next[1]) < 0.5; }), `${label}: a room is drawn as a clean rectangle (${points.map((point) => point.map(Math.round).join(",")).join(" ")})`);
  }
  equal(drawn.map(boxOf).sort(), [...expected].sort(), `${label}: the rooms are where the walls are`);
}

async function gestures(page) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const drag = async (from, to) => {
    const [ax, ay] = await screen(page, ...from);
    const [bx, by] = await screen(page, ...to);
    await touch("touchStart", [[ax, ay]]);
    for (let step = 1; step <= 8; step += 1) await touch("touchMove", [[ax + (bx - ax) * step / 8, ay + (by - ay) * step / 8]]);
    await page.waitForTimeout(80);
    await touch("touchEnd", []);
    await page.waitForTimeout(250);
  };
  const tapAt = async (x, y) => { const [sx, sy] = await screen(page, x, y); await page.touchscreen.tap(sx, sy); await page.waitForTimeout(150); };
  return { drag, tapAt };
}

const errors = [];
const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  const { drag, tapAt } = await gestures(page);
  const nothing = () => tapAt(-1200, 12500);

  // One 9000 × 11000 outline, split down the middle.
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
  await rectangles(page, ["0..9000 x 0..11000"], "one room");

  // Each outside wall of the single room dragged, then undone.
  for (const [name, from, to, expected] of [
    ["top", [3000, 0], [3000, -1000], "0..9000 x -1000..11000"],
    ["right", [9000, 4000], [10000, 4000], "0..10000 x 0..11000"],
    ["bottom", [3000, 11000], [3000, 10000], "0..9000 x 0..10000"],
    ["left", [0, 4000], [1000, 4000], "1000..9000 x 0..11000"],
  ]) {
    await nothing();
    await tapAt(...from);
    equal(await bar(page).getAttribute("aria-label"), "Wall actions", `${name} wall: selected`);
    await drag(from, to);
    await rectangles(page, [expected], `one room, ${name} wall dragged`);
    await undo(page);
    await rectangles(page, ["0..9000 x 0..11000"], `one room, ${name} wall undone`);
  }

  await nothing();
  await tapAt(2000, 8000);
  await bar(page).getByRole("button", { name: "Split" }).click();
  await bar(page).getByRole("button", { name: "│ Vertical" }).click();
  await rectangles(page, ["0..4500 x 0..11000", "4500..9000 x 0..11000"], "split");
  const names = await page.locator(`${UNDER} text`).evaluateAll((items) => items.map((item) => item.textContent).filter((text) => /^Room \d+$/.test(text)).sort());
  equal(names.length, 2, "(two named rooms)");

  equal(await modelRooms(page), 2, "(the model has both)");
  // The partition dragged out through the left wall: it closes nothing now.
  await nothing();
  await tapAt(4500, 9000);
  await drag([4500, 6000], [-1000, 6000]);
  await rectangles(page, ["0..9000 x 0..11000"], "partition dragged out of the house");
  equal((await openLabels(page)).length, 1, "partition dragged out of the house: the room it closed is not enclosed");
  await undo(page);
  await rectangles(page, ["0..4500 x 0..11000", "4500..9000 x 0..11000"], "partition back");

  // The partition dragged: both rooms follow it, each still a rectangle.
  await nothing();
  await tapAt(4500, 9000);
  await drag([4500, 6000], [3000, 6000]);
  await rectangles(page, ["0..3000 x 0..11000", "3000..9000 x 0..11000"], "partition dragged");
  // Then the outside wall on the right: only the room on it grows.
  await nothing();
  await tapAt(9000, 4000);
  await drag([9000, 4000], [10000, 4000]);
  await rectangles(page, ["0..3000 x 0..11000", "3000..10000 x 0..11000"], "outside wall dragged");
  // And the top, which both rooms share.
  await nothing();
  await tapAt(6000, 0);
  await drag([6000, 0], [6000, -1000]);
  await rectangles(page, ["0..3000 x -1000..11000", "3000..10000 x -1000..11000"], "top wall dragged");
  equal(await openLabels(page), [], "every room enclosed so far");

  // The right wall dragged in past the partition: the partition stands
  // outside the house and closes nothing. One room, a clean rectangle; the
  // other labelled not enclosed, with no floor.
  await nothing();
  await tapAt(10000, 4000);
  await drag([10000, 4000], [2000, 4000]);
  await rectangles(page, ["0..2000 x -1000..11000"], "right wall past the partition");
  const open = await openLabels(page);
  equal(open.length, 1, "right wall past the partition: one room labelled");
  ok(/^Room \d+ · Room not enclosed$/.test(open[0]), `as not enclosed (${open[0]})`);
  equal(await modelRooms(page), 1, "and the model has one room: the one shut out has no floor, ceiling or area");

  // Undo brings both rooms back exactly; redo shuts the one out again.
  await undo(page);
  await rectangles(page, ["0..3000 x -1000..11000", "3000..10000 x -1000..11000"], "undone");
  equal(await openLabels(page), [], "undone: every room enclosed again");
  const back = await page.locator(`${UNDER} text`).evaluateAll((items) => items.map((item) => item.textContent).filter((text) => /^Room \d+$/.test(text)).sort());
  equal(back, names, "undone: the same two rooms, by name");
  await redo(page);
  await rectangles(page, ["0..2000 x -1000..11000"], "redone");
  equal((await openLabels(page)).length, 1, "redone: the room not enclosed again");

  // Dragged back out past the partition: the room shut out comes back by itself.
  await nothing();
  await tapAt(2000, 4000);
  await drag([2000, 4000], [9000, 4000]);
  await rectangles(page, ["0..3000 x -1000..11000", "3000..9000 x -1000..11000"], "dragged back out");
  equal(await openLabels(page), [], "dragged back out: the room is enclosed again, with its floor");
  const again = await page.locator(`${UNDER} text`).evaluateAll((items) => items.map((item) => item.textContent).filter((text) => /^Room \d+$/.test(text)).sort());
  equal(again, names, "and its name");

  equal(errors, [], "no page errors");
} finally {
  await page.close();
  await harness.close();
}
console.log(`Room topology in the browser: ${checks} checks — the partition and each outside wall dragged, the rooms clean rectangles where the walls are, a room shut out labelled not enclosed and brought back by undo or by dragging back`);
