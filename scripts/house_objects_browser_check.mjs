/**
 * The object library on a phone: place, move, turn, copy; stairs of three
 * kinds, reversed and re-counted; doors and windows by type; the plan
 * reloaded; and every object where it should be in 3D.
 *
 *   node scripts/house_objects_browser_check.mjs
 */
import assert from "node:assert/strict";

import { openHarness, PLAN } from "./house_harness.mjs";

const harness = await openHarness();
if (!harness) {
  console.log("SKIP: house objects check needs Playwright (npm i -g playwright)");
  process.exit(0);
}
const { browser, url } = harness;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

const screen = (x, y) => page.evaluate(([selector, x, y]) => { const point = new DOMPoint(x, y).matrixTransform(document.querySelector(selector).getScreenCTM()); return [point.x, point.y]; }, [PLAN, x, y]);
const tap = async (x, y) => { const [sx, sy] = await screen(x, y); await page.touchscreen.tap(sx, sy); await page.waitForTimeout(200); };
const cdp = await page.context().newCDPSession(page);
const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
const drag = async (from, to) => {
  const [ax, ay] = await screen(...from);
  const [bx, by] = await screen(...to);
  await touch("touchStart", [[ax, ay]]);
  for (let step = 1; step <= 8; step += 1) await touch("touchMove", [[ax + (bx - ax) * step / 8, ay + (by - ay) * step / 8]]);
  await touch("touchEnd", []);
  await page.waitForTimeout(250);
};
const rail = page.locator('nav[aria-label="Modeling tools"]');
const bar = () => page.getByRole("toolbar", { name: / actions$/ });
const count = (label) => page.locator(`${PLAN} g[aria-label="${label}"]`).count();
const properties = async () => { await bar().getByRole("button", { name: "More actions" }).click(); await page.getByRole("menuitem", { name: "Properties", exact: true }).click(); return page.locator('section[aria-label$=" properties"]'); };
const closeSheet = (sheet) => sheet.getByRole("button", { name: "Close" }).click();
const draft = () => page.evaluate(() => { for (let index = 0; index < localStorage.length; index += 1) { const text = localStorage.getItem(localStorage.key(index)) ?? ""; if (text.includes('"components"')) { const value = JSON.parse(text); return value.project ?? value; } } return null; });

async function place(tool, choose, x, y) {
  await rail.getByRole("button", { name: tool, exact: true }).click();
  const library = page.getByRole("dialog", { name: /library$/ });
  await library.waitFor();
  await choose(library);
  assert.equal(await library.count(), 0, `${tool}: the library closes once something is chosen`);
  await tap(x, y);
}
const furniture = (category, name) => async (library) => { await library.getByRole("tab", { name: category }).click(); await library.getByRole("button", { name, exact: true }).click(); };

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  // A plan to furnish: the 3-bedroom family house, 8.2 × 12.4 m.
  await page.getByRole("radio", { name: /Use a template/ }).click();
  await page.getByLabel("Plot width").fill("10");
  await page.getByLabel("Plot length").fill("20");
  await page.getByRole("button", { name: "Find plans" }).click();
  await page.getByRole("button", { name: "3-bedroom standard family house" }).click();
  await page.getByRole("button", { name: "Use this plan" }).click();
  await page.locator(PLAN).waitFor();

  // The library: a bottom sheet with categories, search, recent and favourites.
  await rail.getByRole("button", { name: "Furniture", exact: true }).click();
  const library = page.getByRole("dialog", { name: "Furniture library" });
  const sheetBox = await library.boundingBox();
  assert.ok(sheetBox.y + sheetBox.height >= 843 && sheetBox.height <= 844 * 0.71, "a bottom sheet, no taller than 70% of the screen");
  assert.deepEqual(await library.getByRole("tab").allInnerTexts(), ["Recently used", "Favourites", "Living", "Bedroom", "Dining", "Kitchen", "Bathroom", "Office", "Other"]);
  await library.getByLabel("Search objects").fill("basin");
  assert.deepEqual(await library.locator("button[aria-label]:not([aria-label*='favourites']):not([aria-label='Close library'])").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))), ["Wash basin", "Double basin"], "search finds by name");
  await library.getByLabel("Search objects").fill("");
  await library.getByRole("tab", { name: "Bedroom" }).click();
  assert.ok(await library.getByRole("button", { name: "Double bed", exact: true }).locator("svg rect").count() >= 4, "cards show a drawn symbol, not a photo");
  await library.getByRole("button", { name: "Add Double bed to favourites" }).click();
  await library.getByRole("button", { name: "Close library" }).click();

  // 1. A double bed.
  await place("Furniture", furniture("Bedroom", "Double bed"), 1600, 1700);
  assert.equal(await count("Double bed"), 1, "1. a double bed is placed");
  assert.equal(await bar().getAttribute("aria-label"), "Furniture actions", "and selected");
  assert.deepEqual(await bar().getByRole("button").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label") ?? item.textContent)), ["Move", "↻ 90°", "Mirror", "Duplicate", "More actions"]);
  assert.ok(await page.locator(`${PLAN} g[aria-label="Double bed"] rect`).count() >= 4, "drawn with its pillows");
  let sheet = await properties();
  const placedAt = [Number(await sheet.getByLabel("Position X").inputValue()), Number(await sheet.getByLabel("Position Y").inputValue())];
  assert.equal(await sheet.getByLabel("Width").inputValue(), "1400");
  assert.equal(await sheet.getByLabel("Depth").inputValue(), "2000");
  await closeSheet(sheet);

  // 2. Moved and turned.
  await drag([placedAt[0], placedAt[1]], [placedAt[0] + 1000, placedAt[1]]);
  sheet = await properties();
  assert.equal(Number(await sheet.getByLabel("Position X").inputValue()), placedAt[0] + 1000, "2. moved a metre");
  const rotation = Number(await sheet.getByLabel("Rotation").inputValue());
  await closeSheet(sheet);
  await bar().getByRole("button", { name: "↻ 90°" }).click();
  sheet = await properties();
  assert.equal(Number(await sheet.getByLabel("Rotation").inputValue()), (rotation + 90) % 360, "and turned 90°");
  await sheet.getByRole("radiogroup", { name: "Turn to" }).getByRole("radio", { name: "180°" }).click();
  assert.equal(await sheet.getByLabel("Rotation").inputValue(), "180", "or to a set angle");
  await sheet.getByLabel("Width").fill("1600");
  await sheet.getByLabel("Width").press("Enter");
  await page.waitForTimeout(150);
  assert.equal(await sheet.getByLabel("Width").inputValue(), "1600", "its width typed");
  await closeSheet(sheet);

  // 3. Duplicated.
  await bar().getByRole("button", { name: "Duplicate" }).click();
  assert.equal(await count("Double bed"), 2, "3. duplicated");

  // 4. An L-shaped sofa; 5. a toilet and a basin.
  await place("Furniture", furniture("Living", "L-shaped sofa"), 1600, 10500);
  assert.equal(await count("L-shaped sofa"), 1, "4. an L-shaped sofa");
  await place("Furniture", furniture("Bathroom", "Toilet"), 4300, 1000);
  await place("Furniture", furniture("Bathroom", "Wash basin"), 4500, 2600);
  assert.deepEqual([await count("Toilet"), await count("Wash basin")], [1, 1], "5. a toilet and a basin");
  await rail.getByRole("button", { name: "Furniture", exact: true }).click();
  assert.equal(await page.getByRole("dialog", { name: "Furniture library" }).getByRole("tab", { name: "Recently used" }).getAttribute("aria-selected"), "true", "the library opens on what was used last");
  assert.deepEqual((await page.getByRole("dialog", { name: "Furniture library" }).locator("button[aria-label]:not([aria-label*='favourites']):not([aria-label='Close library'])").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")))).slice(0, 4), ["Wash basin", "Toilet", "L-shaped sofa", "Double bed"]);
  await page.getByRole("dialog", { name: "Furniture library" }).getByRole("tab", { name: "Favourites" }).click();
  assert.equal(await page.getByRole("dialog", { name: "Furniture library" }).getByRole("button", { name: "Double bed", exact: true }).count(), 1, "and keeps favourites");
  await page.getByRole("button", { name: "Close library" }).click();

  // 6–8. Straight, L and U stairs.
  const stairChoice = (name) => async (sheetLibrary) => sheetLibrary.getByRole("button", { name, exact: true }).click();
  await place("Stair", stairChoice("Straight stair"), 6500, 3000);
  await place("Stair", stairChoice("L-shaped stair"), 2000, 7800);
  await place("Stair", stairChoice("U-shaped stair"), 6200, 10000);
  assert.deepEqual([await count("Stair straight"), await count("Stair l-shaped"), await count("Stair u-shaped")], [1, 1, 1], "6–8. straight, L and U stairs");
  assert.ok(await page.locator(`${PLAN} g[aria-label="Stair straight"] polygon`).count() >= 17, "drawn tread by tread");
  assert.match(await page.locator(`${PLAN} g[aria-label="Stair straight"]`).textContent(), /UP/, "with UP");

  // 9. Reverse; 10. a new floor height re-counts the risers.
  const walk = () => page.locator(`${PLAN} g[aria-label="Stair u-shaped"] polyline[aria-label="Stair direction"]`).getAttribute("points");
  const before = await walk();
  await bar().getByRole("button", { name: "Reverse" }).click();
  const after = await walk();
  assert.equal(after, before.trim().split(/\s+/).reverse().join(" "), "9. reversed: the arrow runs the other way");
  await bar().getByRole("button", { name: "↻ 90°" }).click();
  assert.match(await page.locator(`${PLAN} g[aria-label="Stair u-shaped"]`).getAttribute("transform"), /rotate\(90\)$/, "and a stair turns like anything else");
  sheet = await properties();
  assert.equal(await sheet.getByLabel("Number of risers").inputValue(), "18", "18 risers for 3000 mm");
  assert.equal(await sheet.getByLabel("Riser height").inputValue(), "166.7");
  await sheet.getByLabel("Floor-to-floor height").fill("3300");
  await sheet.getByLabel("Floor-to-floor height").press("Enter");
  await page.waitForTimeout(200);
  assert.equal(await sheet.getByLabel("Number of risers").inputValue(), "19", "10. 3300 mm: 19 risers");
  assert.equal(await sheet.getByLabel("Riser height").inputValue(), "173.7");
  await closeSheet(sheet);

  // Auto fit: a space and a floor height, and only what fits.
  await rail.getByRole("button", { name: "Stair", exact: true }).click();
  const stairs = page.getByRole("dialog", { name: "Stairs library" });
  await stairs.getByLabel("Space width").fill("2800");
  await stairs.getByLabel("Space length").fill("4500");
  await stairs.getByRole("button", { name: "Find stairs that fit" }).click();
  const options = await stairs.getByRole("list", { name: "Stairs that fit" }).getByRole("listitem").allInnerTexts();
  for (const kind of ["Straight stair", "L-shaped stair", "U-shaped stair"]) assert.ok(options.some((text) => text.startsWith(kind)), `auto fit offers a ${kind}`);
  await stairs.getByLabel("Space width").fill("1500");
  await stairs.getByLabel("Space length").fill("1500");
  await stairs.getByRole("button", { name: "Find stairs that fit" }).click();
  assert.match(await stairs.getByRole("status").innerText(), /No stair fits/, "and nothing forced into a space too small");
  await page.getByRole("button", { name: "Close library" }).click();

  // 11. Doors and windows into walls, by type.
  await place("Door", async (doors) => doors.getByRole("button", { name: "Sliding", exact: true }).click(), 1500, 12200);
  sheet = await properties();
  assert.equal(await sheet.getByRole("radiogroup", { name: "Type" }).getByRole("radio", { name: "Sliding", exact: true }).getAttribute("aria-checked"), "true", "11. a sliding door in the front wall");
  await sheet.getByRole("button", { name: "Flip inside / outside" }).click();
  assert.equal(await sheet.getByRole("radiogroup", { name: "Swing" }).getByRole("radio", { name: "Out · right" }).getAttribute("aria-checked"), "true", "flipped to open out");
  await closeSheet(sheet);
  await place("Window", async (windows) => windows.getByRole("button", { name: "Awning", exact: true }).click(), 8000, 9000);
  sheet = await properties();
  assert.equal(await sheet.getByRole("radiogroup", { name: "Type" }).getByRole("radio", { name: "Awning", exact: true }).getAttribute("aria-checked"), "true", "an awning window in the side wall");
  assert.equal(await sheet.getByLabel("Sill height").inputValue(), "1500");
  await closeSheet(sheet);
  await place("Column", async (columns) => { await columns.getByRole("radio", { name: "Circular column" }).click(); await columns.getByRole("button", { name: "Ø 300" }).click(); }, 4000, 7000);
  assert.equal(await page.locator(`${PLAN} g[aria-label="Column"] circle`).count(), 1, "a round column");

  // Furniture against furniture: a second base cabinet put down a little off lands edge to edge.
  await place("Furniture", furniture("Kitchen", "Base cabinet"), 6000, 10000);
  await place("Furniture", furniture("Kitchen", "Base cabinet"), 6680, 10060);
  await page.waitForTimeout(1200);
  const cabinets = (await draft()).components.filter((item) => item.family === "base-cabinet");
  assert.equal(cabinets.length, 2);
  assert.deepEqual([Math.abs(cabinets[1].x - cabinets[0].x), cabinets[1].y - cabinets[0].y], [600, 0], "the second cabinet snaps beside the first, in line");
  // Dragged to just below the first and a little off, it lands flush under it and lined up.
  await drag([cabinets[1].x, cabinets[1].y], [cabinets[0].x + 40, cabinets[0].y + 680]);
  await page.waitForTimeout(1200);
  const dragged = (await draft()).components.filter((item) => item.family === "base-cabinet");
  assert.deepEqual([dragged[1].x, dragged[1].y], [cabinets[0].x, cabinets[0].y + 600], "a dragged cabinet snaps edge to edge, lined up");

  // A corner window: both walls at the corner.
  const windowsBefore = (await draft()).windows.length;
  await place("Window", async (windows) => windows.getByRole("button", { name: "Corner window", exact: true }).click(), 7700, 0);
  await page.waitForTimeout(1200);
  const corner = (await draft()).windows.filter((item) => item.style === "corner");
  assert.equal((await draft()).windows.length, windowsBefore + 2, "a corner window is a window on each wall");
  assert.notEqual(corner[0].wallId, corner[1].wallId);

  // Auto fit into a space drawn on the plan.
  await rail.getByRole("button", { name: "Stair", exact: true }).click();
  await page.getByRole("dialog", { name: "Stairs library" }).getByRole("button", { name: "Draw the space" }).click();
  assert.equal(await page.getByRole("dialog", { name: "Stairs library" }).count(), 0, "the sheet gets out of the way to draw");
  const stairsBefore = (await draft()).stairs.length;
  await drag([1000, 9000], [4000, 12000]);
  const fitted = page.getByRole("dialog", { name: "Stairs library" });
  await fitted.getByRole("list", { name: "Stairs that fit" }).waitFor();
  assert.match(await fitted.innerText(), /Drawn on the plan: 3000 × 3000 mm/, "the space drawn is measured");
  await fitted.getByRole("list", { name: "Stairs that fit" }).getByRole("listitem").first().click();
  assert.equal(await fitted.count(), 0);
  await page.waitForTimeout(1200);
  const all = (await draft()).stairs;
  assert.equal(all.length, stairsBefore + 1, "the stair chosen is placed");
  const put = all.at(-1);
  const turned = Math.abs(Math.round(put.rotation / 90)) % 2 === 1;
  assert.deepEqual([put.x, put.y], [2500, 10500], "in the middle of the space drawn");
  assert.ok((turned ? put.length : put.width) <= 3000 && (turned ? put.width : put.length) <= 3000, "and inside it");

  // 12–13. Reloaded: everything still there.
  await page.waitForTimeout(1500);
  const saved = await draft();
  assert.ok(saved, "the plan is kept on the device");
  const counts = async () => [await count("Double bed"), await count("L-shaped sofa"), await count("Toilet"), await count("Wash basin"), await count("Stair straight"), await count("Stair l-shaped"), await count("Stair u-shaped")];
  const placed = await counts();
  await page.reload();
  await page.getByRole("button", { name: /Continue the plan on this device/ }).click();
  await page.locator(PLAN).waitFor();
  assert.deepEqual(await counts(), placed, "13. after a reload every object remains");
  const reopened = await draft();
  assert.deepEqual(reopened.stairs.map((item) => [item.type, item.steps, item.reversed ?? false]), saved.stairs.map((item) => [item.type, item.steps, item.reversed ?? false]), "stairs with their parameters");
  assert.deepEqual(reopened.doors.filter((item) => item.style === "sliding").map((item) => item.swing), ["out-right"], "the door with its type and swing");

  // 14–15. 3D: the same objects, where the plan has them.
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForFunction(() => window.__scenes?.size && [...window.__scenes].at(-1).getObjectByName("level:ground-floor"), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const where = await page.evaluate((ids) => {
    const scene = [...window.__scenes].filter((item) => item.getObjectByName("level:ground-floor")).at(-1);
    scene.updateMatrixWorld(true);
    return ids.map((id) => { const holder = scene.getObjectByName(id); if (!holder) return null; const target = holder.children[0]; const point = new window.__THREE.Vector3(); target.getWorldPosition(point); return { x: point.x, z: point.z, turn: target.rotation.y }; });
  }, [...reopened.components.map((item) => item.id), ...reopened.stairs.map((item) => item.id), ...reopened.structuralColumns.map((item) => item.id)]);
  assert.ok(where.every(Boolean), "14. every piece of furniture, stair and column is in the 3D view");
  const plan = [...reopened.components, ...reopened.stairs, ...reopened.structuralColumns];
  const origin = where[0];
  plan.forEach((item, index) => {
    const dx = (where[index].x - origin.x) * 1000;
    const dy = -(where[index].z - origin.z) * 1000;
    assert.ok(Math.abs(dx - (item.x - plan[0].x)) < 2 && Math.abs(dy - (item.y - plan[0].y)) < 2, `15. ${item.name ?? item.type} sits in 3D where it is on the plan`);
    if (item.rotation !== undefined) assert.ok(Math.abs(Math.cos(where[index].turn) - Math.cos(item.rotation * Math.PI / 180)) < 1e-6 && Math.abs(Math.sin(where[index].turn) - Math.sin(item.rotation * Math.PI / 180)) < 1e-6, `and turned the same way (${item.rotation}°)`);
  });
  assert.ok(plan.some((item) => item.type === "u-shaped" && item.rotation === 90), "a turned stair is among them");

  assert.deepEqual(errors, [], "page errors");
} finally {
  await page.close();
  await harness.close();
}
console.log("House objects on a phone: the library sheet with search, recent and favourites; a double bed placed, moved, turned, sized and copied; an L sofa, toilet and basin; straight, L and U stairs, reversed and re-counted for a new floor height; auto fit; a sliding door and an awning window by type; a round column; all kept through a reload and standing in 3D where the plan has them");
