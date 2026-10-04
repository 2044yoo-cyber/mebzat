/**
 * Saving a plan into a Medosha project, in the browser.
 *
 *   npm run build && node scripts/house_project_check.mjs
 *
 * Save Project, autosave (and that it waits while a wall is half drawn),
 * reopening from the link, a save refused because somebody else saved first,
 * a save that fails and is retried. Supabase is the in-memory fake in
 * house_fake_supabase.ts; the rules it does not imitate — who may read and
 * write — are tested on PostgreSQL by supabase/tests/agenda-plans.sql.
 */
import assert from "node:assert/strict";

import { openHarness, PLAN, UNDER } from "./house_harness.mjs";

const harness = await openHarness();
if (!harness) {
  console.log("SKIP: house project check needs Playwright (npm i -g playwright)");
  process.exit(0);
}
const { browser, url } = harness;
const USER = "00000000-0000-4000-8000-0000000000aa";
const EXISTING = "11111111-1111-4111-8111-111111111111";

const screen = (page, x, y) => page.evaluate(([selector, x, y]) => {
  const point = new DOMPoint(x, y).matrixTransform(document.querySelector(selector).getScreenCTM());
  return [point.x, point.y];
}, [PLAN, x, y]);
const tapAt = async (page, x, y) => { const [sx, sy] = await screen(page, x, y); await page.touchscreen.tap(sx, sy); await page.waitForTimeout(150); };
const db = (page) => page.evaluate(() => window.__fakeDb.read());
const status = (page) => page.getByRole("button", { name: /^Save status:/ }).getAttribute("aria-label");
const walls = (page) => page.evaluate(() => [...document.querySelectorAll("#house-properties option")].filter((option) => /^Wall \d+$/.test(option.textContent)).length);
const sheet = (page) => page.locator('section[aria-label$=" properties"]');
const rail = (page) => page.locator('nav[aria-label="Modeling tools"]');

async function drawOutline(page) {
  await page.getByRole("button", { name: "Draw floor plan", exact: true }).click();
  await page.locator(PLAN).waitFor();
  const [x, y] = await screen(page, 0, 0);
  await page.touchscreen.tap(x, y);
  for (const [direction, length] of [["→", 8000], ["↓", 6500], ["←", 8000], ["↑", 6500]]) {
    await page.getByRole("button", { name: `Run ${direction}` }).click();
    await page.getByLabel("Typed length").fill(String(length));
    await page.getByLabel("Typed length").press("Enter");
  }
  await page.locator(UNDER).waitFor();
  await rail(page).getByRole("button", { name: "Select", exact: true }).click();
}

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  // One project the person is already on.
  await page.evaluate(([id, owner]) => { localStorage.clear(); window.__fakeDb.write({ agenda_projects: [{ id, owner_id: owner, name: "Bole Villa", archived_at: null, updated_at: "2026-01-01T00:00:00Z" }] }); }, [EXISTING, USER]);
  await page.goto(url);

  // ---------------------------------------------------------------------
  // A new plan is not in a project until it is saved into one.
  // ---------------------------------------------------------------------
  await drawOutline(page);
  assert.equal(await status(page), "Save status: Not in a project yet", "a new plan says it is not in a project");
  assert.equal((await db(page)).agenda_plans, undefined, "and nothing is written until it is saved");
  await page.getByRole("button", { name: "Save project" }).click();
  const dialog = page.getByRole("dialog", { name: "Save project" });
  await dialog.getByText("Bole Villa").waitFor();
  assert.deepEqual(await dialog.getByRole("radio").evaluateAll((items) => items.length), 2, "the dialog offers a new project and the person's projects");
  await dialog.getByLabel("Plan name").fill("Ground floor plan");
  await dialog.getByLabel("New project name").fill("Kebede residence");
  await dialog.getByRole("button", { name: "Save" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label^="Save status:"]')?.getAttribute("aria-label") === "Save status: Saved ✓");
  let state = await db(page);
  const created = state.agenda_projects.find((item) => item.name === "Kebede residence");
  assert.ok(created && created.owner_id === USER, "a new project is created, owned by the person saving");
  assert.equal(state.agenda_plans.length, 1);
  const saved = state.agenda_plans[0];
  assert.equal(saved.project_id, created.id, "the plan is saved into it");
  assert.equal(saved.title, "Ground floor plan", "under the name given");
  assert.equal(saved.data.levels[0].plan.corners.length, 4, "with the plan itself");
  assert.equal(saved.revision, 1);
  assert.match(page.url(), new RegExp(`\\?plan=${saved.id}$`), "and the address is the plan's link");

  // ---------------------------------------------------------------------
  // Autosave: a change shows as unsaved, then saves itself.
  // ---------------------------------------------------------------------
  await tapAt(page, 4000, 0);
  await sheet(page).getByRole("button", { name: "Delete" }).click();
  assert.equal(await status(page), "Save status: Unsaved changes", "a change shows as unsaved");
  await page.waitForFunction(() => document.querySelector('[aria-label^="Save status:"]')?.getAttribute("aria-label") === "Save status: Saved ✓", null, { timeout: 8000 });
  state = await db(page);
  assert.equal(state.agenda_plans[0].revision, 2, "autosave saves it, one revision on");
  assert.equal(state.agenda_plans[0].data.walls.filter((wall) => wall.levelId === "ground-floor").length, 3, "with the change in it");

  // ...but not while a wall is half drawn.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await rail(page).getByRole("button", { name: "Wall", exact: true }).click();
  await tapAt(page, 2000, 2000);
  await page.waitForTimeout(4500);
  assert.equal((await db(page)).agenda_plans[0].revision, 2, "autosave waits while a wall is being drawn");
  assert.equal(await status(page), "Save status: Unsaved changes");
  await page.getByRole("button", { name: "Cancel drafting" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label^="Save status:"]')?.getAttribute("aria-label") === "Save status: Saved ✓", null, { timeout: 8000 });
  assert.equal((await db(page)).agenda_plans[0].revision, 3, "and saves once the gesture is over");
  assert.equal((await db(page)).agenda_plans[0].data.walls.filter((wall) => wall.levelId === "ground-floor").length, 4);

  // ---------------------------------------------------------------------
  // The link reopens the plan, from the project.
  // ---------------------------------------------------------------------
  await page.goto(page.url());
  await page.locator(UNDER).waitFor();
  assert.equal(await walls(page), 4, "the link opens the saved plan");
  assert.equal(await status(page), "Save status: Saved ✓", "saved, as it was left");
  await page.getByRole("button", { name: "Project menu" }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Open Kebede residence in Agenda" }).count(), 1, "and knows its project");
  await page.getByRole("button", { name: "Project menu" }).click();

  // ---------------------------------------------------------------------
  // Somebody else saved first: this save is refused, not lost silently.
  // ---------------------------------------------------------------------
  await page.evaluate(() => { const value = window.__fakeDb.read(); value.agenda_plans[0].revision += 1; window.__fakeDb.write(value); });
  await tapAt(page, 4000, 0);
  await sheet(page).getByLabel("Length").fill("7500");
  await sheet(page).getByLabel("Length").press("Enter");
  await page.waitForFunction(() => document.querySelector('[aria-label^="Save status:"]')?.getAttribute("aria-label") === "Save status: Changed elsewhere", null, { timeout: 8000 });
  assert.match(await page.locator("[data-sonner-toast]").first().innerText(), /changed somewhere else/, "the person is told");
  assert.equal((await db(page)).agenda_plans[0].revision, 4, "and the other save stands");

  // ---------------------------------------------------------------------
  // A save that fails is shown, and retried from the status.
  // ---------------------------------------------------------------------
  await page.goto(page.url());
  await page.locator(UNDER).waitFor();
  await page.evaluate(() => { window.__fakeDb.fail = (table, op) => table === "agenda_plans" && op === "update"; });
  await tapAt(page, 0, 3000);
  await sheet(page).getByRole("button", { name: "Delete" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label^="Save status:"]')?.getAttribute("aria-label") === "Save status: Not saved — retry", null, { timeout: 8000 });
  await page.evaluate(() => { window.__fakeDb.fail = null; });
  await page.getByRole("button", { name: /^Save status:/ }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label^="Save status:"]')?.getAttribute("aria-label") === "Save status: Saved ✓", null, { timeout: 8000 });
  assert.equal((await db(page)).agenda_plans[0].data.walls.filter((wall) => wall.levelId === "ground-floor").length, 3, "the retried save has the change");

  // ---------------------------------------------------------------------
  // A second plan, into the project that was already there; both are
  // listed on the start screen and open from it.
  // ---------------------------------------------------------------------
  await page.getByRole("button", { name: "Project menu" }).click();
  await page.getByRole("menuitem", { name: "Start a new plan" }).click();
  await drawOutline(page);
  await page.getByRole("button", { name: "Save project" }).click();
  await dialog.getByText("Bole Villa").click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label^="Save status:"]')?.getAttribute("aria-label") === "Save status: Saved ✓");
  state = await db(page);
  assert.equal(state.agenda_plans.length, 2);
  assert.equal(state.agenda_plans[1].project_id, EXISTING, "a plan can go into an existing project");
  assert.equal(state.agenda_projects.length, 2, "without making another");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByText("Saved plans").waitFor();
  const listed = await page.getByRole("button", { name: /Bole Villa|Kebede residence/ }).allInnerTexts();
  assert.equal(listed.length, 2, "the start screen lists saved plans");
  await page.getByRole("button", { name: /Ground floor plan/ }).click();
  await page.locator(UNDER).waitFor();
  assert.equal(await walls(page), 3, "and opens one");
  assert.match(page.url(), new RegExp(`\\?plan=${saved.id}$`));

  assert.deepEqual(errors, [], "page errors");
  await page.close();
} finally {
  await harness.close();
}

console.log("House Plan project: Save Project into a new or existing Medosha project, autosave (waiting out a half-drawn wall), reopening by link, a stale save refused, a failed save retried, saved plans listed");
