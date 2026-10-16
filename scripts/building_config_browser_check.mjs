/**
 * The building configurator in a real browser, at phone width: four buildings,
 * any size, with the areas read off the geometry and a 3D model that really
 * changes when a number does.
 *
 *   npm run build && node scripts/building_config_browser_check.mjs
 */
import assert from "node:assert/strict";

import { openLab } from "./lab_browser_harness.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
/** The number a row of the areas table shows, square metres. */
const areaRow = async (page, key) => Number(await page.getByTestId("building-areas").locator(`[data-area="${key}"] td`).getAttribute("data-value"));

const lab = await openLab({ withProject: true });
try {
  const page = await lab.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1, hasTouch: true });
  // The lab opens on the Existing Building at stage 5, the finished frame: the structure alone, whatever the template.
  await page.locator('[role=tab][data-stage="5"]').click();
  await page.getByRole("radio", { name: "Completed", exact: true }).click();
  await lab.settle(page);

  // ---- The building configurator: four buildings, any size, areas that are read off the geometry -----------------------------------
  const originalBuilding = await lab.stats(page);
  const originalSummary = await page.getByTestId("building-summary").innerText();
  equal(originalSummary, "Existing Building · 12.0 × 9.0 m · 3 floors · 108.0 m² a floor · 324.0 m² in all", "the lab opens on the Existing Building, with its size and areas on one line");
  await page.getByTestId("settings-toggle").click();
  const config = page.getByTestId("settings-panel");
  await config.waitFor();
  const templates = config.getByRole("radiogroup", { name: "Building template" });
  equal(await templates.getByRole("radio").count(), 4, "four building templates are offered");
  const names = await templates.getByRole("radio").evaluateAll((els) => els.map((el) => el.querySelector("span")?.textContent));
  equal(names, ["Existing Building", "Modern House", "Modern Villa", "G+2 Building"], "the Existing Building first, then the three new ones");
  equal(await templates.locator('[aria-checked="true"]').getAttribute("data-template"), "existing", "the existing building is the one selected");
  for (const box of await templates.getByRole("radio").all()) ok((await box.boundingBox()).height >= 44, "a template is a touch-sized target");
  // The areas, each its own number.
  equal([await areaRow(page, "footprint"), await areaRow(page, "floor-0"), await areaRow(page, "floor-2"), await areaRow(page, "gfa")], [108, 108, 108, 324], "footprint, area per floor and gross floor area are listed separately");
  ok(/Footprint/.test(await page.getByTestId("building-areas").innerText()) && /Total gross floor area/.test(await page.getByTestId("building-areas").innerText()) && /Roof/.test(await page.getByTestId("building-areas").innerText()), "with the roof and each named");

  // Modern House: two floors, 140 m² each.
  let was = await lab.stats(page);
  let heightWas = await lab.topOf(page);
  await templates.locator('[data-template="modern-house"]').click();
  equal(await page.getByTestId("building-summary").innerText(), "Modern House · 14.0 × 10.0 m · 2 floors · 140.0 m² a floor · 280.0 m² in all", "choosing the Modern House says what it is");
  await lab.until(async () => (await lab.stats(page)).sum !== was.sum, "the 3D model changes to the Modern House");
  await lab.settle(page);
  ok((await lab.topOf(page)) < heightWas - 2, "the Modern House is a storey lower than the Existing Building");
  equal([await areaRow(page, "floor-0"), await areaRow(page, "gfa")], [140, 280], "its areas follow");
  ok((await areaRow(page, "balconies")) > 5, "its cantilever balcony is counted apart from the floors");

  // Modern Villa: a pitched roof.
  was = await lab.stats(page);
  await templates.locator('[data-template="modern-villa"]').click();
  equal(await page.getByTestId("building-summary").innerText(), "Modern Villa · 16.0 × 12.0 m · 2 floors · 192.0 m² a floor · 384.0 m² in all", "the Modern Villa is larger");
  await lab.until(async () => (await lab.stats(page)).sum !== was.sum, "the 3D model changes to the Modern Villa");
  ok(/Roof covering, along the slope/.test(await page.getByTestId("building-areas").innerText()), "and has a pitched roof, whose area is measured along the slope");
  ok((await areaRow(page, "roof")) > 218, "which is more than its plan");

  // G+2: three floors of 150 m² make 450 m².
  was = await lab.stats(page);
  await templates.locator('[data-template="g-plus-2"]').click();
  equal(await page.getByTestId("building-summary").innerText(), "G+2 Building · 15.0 × 10.0 m · 3 floors · 150.0 m² a floor · 450.0 m² in all", "the G+2 Building is three floors of 150 m², 450 m² in all");
  ok(await config.locator('[data-field="floors"]').isDisabled(), "and its number of floors cannot be changed");
  ok(/three floors by definition/.test(await config.innerText()), "with the reason given");
  await lab.until(async () => (await lab.stats(page)).sum !== was.sum, "the 3D model changes to the G+2 Building");
  await lab.settle(page);

  // Resizing redraws the building: 200 m² a floor is a bigger plan, not a bigger number.
  const smallExtent = await lab.extentOf(page);
  was = await lab.stats(page);
  await config.locator('[data-field="areaPerFloor"]').fill("200");
  await page.waitForFunction(() => /200\.\d m² a floor/.test(document.querySelector('[data-testid="building-summary"]')?.textContent ?? ""));
  const asked = await page.getByTestId("building-summary").innerText();
  ok(/ 200\.0 m² a floor · 600\.0 m² in all$/.test(asked), `200 m² a floor gives 600 m² in all (${asked})`);
  ok(Math.abs((await areaRow(page, "floor-0")) - 200) <= 0.05 && Math.abs((await areaRow(page, "gfa")) - 600) <= 0.15, "the areas table agrees");
  const lengthNow = Number(await config.locator('[data-field="length"]').inputValue());
  const widthNow = Number(await config.locator('[data-field="width"]').inputValue());
  ok(Math.abs((lengthNow * widthNow) / 1e6 - 200) <= 0.05, `length ${lengthNow} × width ${widthNow} is that area`);
  await lab.until(async () => (await lab.stats(page)).sum !== was.sum, "the 3D model grows");
  await lab.settle(page);
  const bigExtent = await lab.extentOf(page);
  const grew = [(bigExtent.x - smallExtent.x), (bigExtent.z - smallExtent.z)];
  ok(grew.every((d) => d > 0.8), `the model itself is bigger in both directions (${grew.map((d) => d.toFixed(2)).join(" m, ")} m more)`);
  ok(Math.abs(grew[0] - (lengthNow - 15000) / 1000) < 0.6 && Math.abs(grew[1] - (widthNow - 10000) / 1000) < 0.6, "by about as much as the length and width grew");

  // The storey height.
  const tallBefore = await lab.topOf(page);
  await config.locator('[data-field="floorToFloor"]').fill("3600");
  await lab.until(async () => (await lab.topOf(page)) > tallBefore + 1, "the building grows taller with the storey height");
  ok(Math.abs((await lab.topOf(page)) - tallBefore - 3 * 0.4) < 0.15, "three storeys 400 mm taller is 1.2 m more");
  // Length and width, typed: each changes its own side of the plan.
  await config.locator('[data-field="length"]').fill("18000");
  await page.waitForFunction(() => /18\.0 × \d+\.\d+ m/.test(document.querySelector('[data-testid="building-summary"]')?.textContent ?? ""));
  const widthBefore = Number(await config.locator('[data-field="width"]').inputValue());
  const metres = (mm) => (mm / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  equal(await page.getByTestId("building-summary").innerText(), `G+2 Building · 18.0 × ${metres(widthBefore)} m · 3 floors · ${((18000 * widthBefore) / 1e6).toFixed(1)} m² a floor · ${((3 * 18000 * widthBefore) / 1e6).toFixed(1)} m² in all`, `typing a length sets the length and leaves the width at ${widthBefore} mm`);
  await config.locator('[data-field="width"]').fill("12000");
  await page.waitForFunction(() => /× 12\.0 m/.test(document.querySelector('[data-testid="building-summary"]')?.textContent ?? ""));
  equal(await page.getByTestId("building-summary").innerText(), "G+2 Building · 18.0 × 12.0 m · 3 floors · 216.0 m² a floor · 648.0 m² in all", `and a width sets the width (it was ${widthBefore} mm): 18 m × 12 m is 216 m² a floor`);
  // An impossible length is brought into range when the box is left, to the shortest the template allows.
  await config.locator('[data-field="length"]').fill("1000");
  await config.locator('[data-field="length"]').blur();
  equal(await config.locator('[data-field="length"]').inputValue(), "11000", "a length that is too short becomes the shortest the template can be");
  await config.locator('[data-field="length"]').fill("90000");
  await config.locator('[data-field="length"]').blur();
  equal(await config.locator('[data-field="length"]').inputValue(), "28000", "and one that is too long the longest");
  // The total floor area sets the area of each floor.
  await page.getByRole("button", { name: "Back to the example dimensions" }).click();
  await config.locator('[data-field="totalFloorArea"]').fill("600");
  await page.waitForFunction(() => /20\d\.\d m² a floor/.test(document.querySelector('[data-testid="building-summary"]')?.textContent ?? ""));
  ok(/ 200\.0 m² a floor · 600\.0 m² in all$/.test(await page.getByTestId("building-summary").innerText()), `600 m² in all over three floors is 200 m² a floor (${await page.getByTestId("building-summary").innerText()})`);
  // Back to the example size, then the first template again: exactly the building we started with.
  await page.getByRole("button", { name: "Back to the example dimensions" }).click();
  equal(await page.getByTestId("building-summary").innerText(), "G+2 Building · 15.0 × 10.0 m · 3 floors · 150.0 m² a floor · 450.0 m² in all", "the example dimensions put the template back");
  await templates.locator('[data-template="existing"]').click();
  equal(await page.getByTestId("building-summary").innerText(), originalSummary, "the Existing Building is as it was");
  await lab.until(async () => { const now = await lab.stats(page); return now.sum === originalBuilding.sum && now.instances === originalBuilding.instances; }, "the Existing Building is drawn exactly as before");
  ok(true, "and draws exactly the pieces it drew before");

  // Floors, where the template allows them: a fourth floor is a fourth floor of area, and a taller house.
  was = await lab.stats(page);
  heightWas = await lab.topOf(page);
  await config.locator('[data-field="floors"]').fill("4");
  await page.waitForFunction(() => /4 floors/.test(document.querySelector('[data-testid="building-summary"]')?.textContent ?? ""));
  equal(await page.getByTestId("building-summary").innerText(), "Existing Building · 12.0 × 9.0 m · 4 floors · 108.0 m² a floor · 432.0 m² in all", "a fourth floor adds a fourth floor of area");
  equal(await areaRow(page, "floor-3"), 108, "which the areas table lists");
  await lab.until(async () => (await lab.topOf(page)) > heightWas + 2.5, "the model gets a fourth storey");
  ok((await lab.topOf(page)) - heightWas < 3.9, "of about one storey's height");
  // Sizes typed into the structure belong to the building they were typed for.
  await config.getByRole("button", { name: /Structure and openings/ }).click();
  await config.locator('[data-field="slabThickness"]').fill("20");
  ok(/slabThickness was 20/.test(await page.getByTestId("param-issues").innerText()), "an impossible slab thickness is corrected with a message");
  await templates.locator('[data-template="modern-house"]').click();
  equal(await page.locator('[data-testid="param-issues"]').count(), 0, "and choosing another building starts that building from its own sizes");

  // The user's own plan is read as drawn, with its areas and none of the configurator.
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("radio", { name: "My project" }).click();
  await page.getByTestId("settings-toggle").click();
  await config.waitFor();
  equal(await page.getByTestId("building-panel").count(), 0, "a project of your own has no template to choose");
  ok(/never changes your house/.test(await config.innerText()), "and is said to be read and never changed");
  equal([await areaRow(page, "footprint"), await areaRow(page, "gfa")], [108, 324], "but its areas are worked out the same way");
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("radio", { name: "Sample house" }).click();
  await page.getByTestId("settings-toggle").click();
  equal(await page.getByTestId("building-summary").innerText(), "Modern House · 14.0 × 10.0 m · 2 floors · 140.0 m² a floor · 280.0 m² in all", "the sample house is as it was left");
  ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, "no sideways scrolling with the configurator open");
  await page.getByTestId("settings-toggle").click();

  assert.deepEqual(lab.errors, [], `no page errors: ${lab.errors.join("\n")}`);
  checks += 1;
  console.log(`Building configurator in the browser: ${checks} checks passed.`);
} finally {
  await lab.close();
}
