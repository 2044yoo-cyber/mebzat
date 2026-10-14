/**
 * The Collaborative Studio, driven in a browser by several people at once.
 *
 *   node scripts/collab_studio_browser_check.mjs
 *
 * The real screens and the real server actions, against the fake database in
 * collab_fake_supabase.ts (which imitates 0105's rules; the rules themselves
 * are tested on PostgreSQL in supabase/tests/collab-studio.sql). Each tab is
 * signed in as a different person and sees the others' changes live.
 *
 * The owner's workflow, end to end: a board with the architecture sections
 * and a card that survives a reload and a drag to another column; a canvas
 * with a sticky note, a shape and a connector whose coordinates do not move
 * when the view zooms or the page reloads; a render uploaded and a pin
 * placed on it at an exact spot; a client who sees it, replies, and gets
 * the designer's correction back; a comment turned into an assigned task; a
 * revision uploaded with the original kept; an approval; a stale save
 * refused; offline and retry; what a viewer and an outsider may not do; and
 * the phone layout with pinch zoom that does not move objects.
 */
import assert from "node:assert/strict";
import { join } from "node:path";

import { openStudio, PROJECT } from "./collab_harness.mjs";

const harness = await openStudio();
if (!harness) {
  console.log("SKIP: Studio browser check needs Playwright");
  process.exit(0);
}
const { browser, url, people } = harness;
const root = new URL("../", import.meta.url).pathname;
const RENDER_A = join(root, "public/images/property_samples/house.webp");
const RENDER_B = join(root, "public/images/property_samples/duplex.webp");

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (a, b, message, tolerance = 1e-6) => ok(Math.abs(a - b) <= tolerance, `${message} (${a} ≈ ${b})`);

const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const errors = [];
async function open(as, query = "") {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${as}: ${error.message}`));
  await page.goto(`${url}?as=${as}${query}`);
  await page.locator('nav[aria-label="Studio"], #not-found').first().waitFor();
  return page;
}
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__collab_fake_db") ?? "{}"));
const tab = (page, name) => page.locator('nav[aria-label="Studio"]').getByRole("button", { name, exact: false }).first().click();
// A phone zooms out to fit a page that is too wide, so "fits" means the page is still 390 wide.
// Exactly "Saved": a text filter is a case-insensitive substring, and "unsaved" contains it.
const SAVED = /^\s*Saved\s*$/;
const saved = (page) => page.getByRole("status").filter({ hasText: SAVED }).first().waitFor({ timeout: 8000 });

try {
  // -------------------------------------------------------------------------
  // 1. The owner makes a board with the architecture sections, and a card.
  // -------------------------------------------------------------------------
  const owner = await open("owner");
  await owner.getByRole("button", { name: "New board" }).click();
  await owner.getByLabel("Name").fill("Kitchen design");
  ok(await owner.getByLabel("Start with architecture sections").isChecked(), "1: a new board offers the architecture sections, ticked");
  await owner.getByRole("button", { name: "Create", exact: true }).click();
  const columns = owner.locator('[aria-label="Columns"] > section');
  await columns.first().waitFor();
  equal(await columns.evaluateAll((list) => list.map((node) => node.getAttribute("aria-label"))), ["Concept", "Floor Plans", "Interior Design", "Materials", "3D Renders", "Client Feedback", "Approved Designs"], "1: seven starter columns, in order");

  await owner.getByRole("region", { name: "Concept" }).getByRole("button", { name: "Card" }).click();
  const editor = owner.getByRole("dialog", { name: "Edit card" });
  await editor.getByLabel("Title").fill("Walnut cabinets");
  await editor.getByLabel("Text").fill("Warm, matte, vertical grain");
  await editor.getByLabel("Labels").fill("kitchen, finishes");
  await editor.getByRole("button", { name: "Save" }).click();
  const card = owner.getByRole("article", { name: "Walnut cabinets" });
  await card.waitFor();
  ok(await owner.getByRole("status").filter({ hasText: /Saving|Saved/ }).count(), "1: the board says whether it is saved");
  await saved(owner);
  const afterCard = await db(owner);
  const cardRow = afterCard.collab_items.find((item) => item.data.title === "Walnut cabinets");
  const concept = afterCard.collab_items.find((item) => item.kind === "column" && item.data.title === "Concept");
  ok(cardRow && cardRow.parent_id === concept.id, "1: the card is saved, in Concept");
  equal(cardRow.data.labels, ["kitchen", "finishes"], "1: with its labels");
  ok(cardRow.created_by === people.owner.id, "1: stamped as the owner's");

  // Reloaded: exactly as it was.
  await owner.reload();
  await owner.getByRole("article", { name: "Walnut cabinets" }).waitFor();
  ok(await owner.getByRole("region", { name: "Concept" }).getByRole("article", { name: "Walnut cabinets" }).count() === 1, "1: reopened, the card is still in Concept");

  // Dragged to Materials.
  const grip = owner.getByRole("article", { name: "Walnut cabinets" }).getByRole("button", { name: "Drag to move" });
  const from = await grip.boundingBox();
  const target = await owner.getByRole("region", { name: "Materials" }).locator("ol").boundingBox();
  await owner.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await owner.mouse.down();
  for (let step = 1; step <= 12; step += 1) await owner.mouse.move(from.x + (target.x + 40 - from.x) * step / 12, from.y + (target.y + 30 - from.y) * step / 12);
  await owner.mouse.up();
  await owner.getByRole("region", { name: "Materials" }).getByRole("article", { name: "Walnut cabinets" }).waitFor();
  await saved(owner);
  await owner.reload();
  await owner.getByRole("region", { name: "Materials" }).getByRole("article", { name: "Walnut cabinets" }).waitFor();
  equal(await owner.getByRole("region", { name: "Materials" }).getByRole("article", { name: "Walnut cabinets" }).count(), 1, "1: dragged to Materials, it stays there after a reload");

  // Free layout: the cards are laid out from their columns, then saved where they are.
  await owner.getByRole("button", { name: "Free", exact: true }).click();
  await owner.getByRole("article", { name: "Walnut cabinets" }).waitFor();
  await saved(owner);
  const free = (await db(owner)).collab_items.find((item) => item.data.title === "Walnut cabinets");
  ok(free.x !== 0 || free.y !== 0, "1: switched to the free layout, cards are given places rather than piled at the origin");
  await owner.getByRole("button", { name: "Columns", exact: true }).click();
  await owner.getByRole("region", { name: "Materials" }).getByRole("article", { name: "Walnut cabinets" }).waitFor();
  equal(await owner.getByRole("region", { name: "Materials" }).getByRole("article", { name: "Walnut cabinets" }).count(), 1, "1: and back in columns, the card is still in Materials");

  // Undo.
  await owner.getByRole("article", { name: "Walnut cabinets" }).getByRole("button", { name: "Card actions" }).click();
  await owner.getByRole("menuitem", { name: "Delete" }).click();
  ok(await owner.getByRole("article", { name: "Walnut cabinets" }).count() === 0, "1: a card deleted leaves the board");
  await owner.getByRole("button", { name: "Undo" }).click();
  await owner.getByRole("article", { name: "Walnut cabinets" }).waitFor();
  await saved(owner);
  ok(!(await db(owner)).collab_items.find((item) => item.data.title === "Walnut cabinets").archived_at, "1: undo brings it back, saved");

  // -------------------------------------------------------------------------
  // 2. A canvas: a sticky note, a shape, a connector; coordinates that stay.
  // -------------------------------------------------------------------------
  await tab(owner, "Canvas");
  await owner.getByRole("button", { name: "New canvas" }).click();
  await owner.getByLabel("Name").fill("Site workshop");
  await owner.getByRole("button", { name: "Create", exact: true }).click();
  const surface = owner.getByLabel(/^Canvas Site workshop/);
  await surface.waitFor();
  const box = await surface.boundingBox();
  await owner.getByRole("button", { name: "Sticky note" }).click();
  await owner.mouse.click(box.x + 300, box.y + 250);
  const text = owner.getByLabel("Edit text");
  await text.waitFor();
  await text.fill("Walnut or oak?");
  await owner.mouse.click(box.x + box.width - 40, box.y + box.height - 120);
  await owner.getByRole("button", { name: "Rectangle" }).click();
  await owner.mouse.move(box.x + 650, box.y + 200);
  await owner.mouse.down();
  await owner.mouse.move(box.x + 760, box.y + 260, { steps: 6 });
  await owner.mouse.move(box.x + 850, box.y + 330, { steps: 6 });
  await owner.mouse.up();
  await saved(owner);
  let rows = (await db(owner)).collab_items.filter((item) => item.board_id === (owner.url().match(/canvas=([0-9a-f-]+)/) ?? [])[1] || item.kind === "sticky" || item.kind === "rect");
  const sticky = rows.find((item) => item.kind === "sticky");
  const rect = rows.find((item) => item.kind === "rect");
  ok(sticky && sticky.data.text === "Walnut or oak?", "2: a sticky note with its text");
  ok(rect && Math.abs(rect.w - 200) < 2 && Math.abs(rect.h - 130) < 2, `2: a rectangle the size it was dragged (${rect?.w} × ${rect?.h})`);

  await owner.getByRole("button", { name: /^Connector/ }).click();
  await owner.mouse.click(box.x + 300, box.y + 250);
  await owner.mouse.click(box.x + 750, box.y + 265);
  await saved(owner);
  const connector = (await db(owner)).collab_items.find((item) => item.kind === "connector");
  ok(connector && connector.data.from === sticky.id && connector.data.to === rect.id, "2: a connector from the note to the rectangle");
  ok(await owner.locator(`svg line[marker-end]`).count() >= 1, "2: drawn as an arrow");

  // Moved by dragging: saved where it was dropped.
  await owner.getByRole("button", { name: "Select" }).first().click();
  await owner.mouse.move(box.x + 300, box.y + 250);
  await owner.mouse.down();
  await owner.mouse.move(box.x + 340, box.y + 290, { steps: 8 });
  await owner.mouse.up();
  await saved(owner);
  const moved = (await db(owner)).collab_items.find((item) => item.id === sticky.id);
  near(moved.x - sticky.x, 40, "2: the note moved 40 across", 2);
  near(moved.y - sticky.y, 40, "2: and 40 down", 2);

  // Zoom does not move anything; neither does a reload.
  const before = (await db(owner)).collab_items.filter((item) => item.kind !== "column").map((item) => [item.id, item.x, item.y, item.w, item.h]);
  for (let i = 0; i < 3; i += 1) await owner.getByRole("button", { name: "Zoom in" }).click();
  await owner.getByRole("button", { name: "Fit to content" }).click();
  await owner.waitForTimeout(600);
  equal((await db(owner)).collab_items.filter((item) => item.kind !== "column").map((item) => [item.id, item.x, item.y, item.w, item.h]), before, "2: zooming and fitting move no object's stored coordinates");
  await owner.reload();
  await owner.getByLabel(/^Canvas Site workshop/).waitFor();
  equal((await db(owner)).collab_items.filter((item) => item.kind !== "column").map((item) => [item.id, item.x, item.y, item.w, item.h]), before, "2: nor does reopening the canvas");
  ok(await owner.locator("foreignObject").filter({ hasText: "Walnut or oak?" }).count() === 1, "2: reopened, the note is drawn with its text");

  // -------------------------------------------------------------------------
  // 3. A render, a pin on it, and the people it is for.
  // -------------------------------------------------------------------------
  await tab(owner, "Review");
  await owner.locator('aside[aria-label="Drawings"] input[type=file]').setInputFiles(RENDER_A);
  await owner.getByRole("button", { name: /Kitchen|house/i }).first().waitFor({ timeout: 15000 });
  const drawings = (await db(owner)).agenda_drawings;
  equal(drawings.length, 1, "3: the render is one drawing in the project's register");
  const revisionA = (await db(owner)).agenda_drawing_revisions[0];
  equal(revisionA.revision, "A", "3: as revision A");
  ok(revisionA.storage_path.startsWith(`${PROJECT}/studio/`), "3: stored in the project's own folder");
  const picture = owner.locator('[aria-label^="house, revision A"] image');
  await picture.waitFor({ timeout: 15000 });
  await owner.getByRole("button", { name: "Comment pin" }).click();
  const pictureBox = await picture.boundingBox();
  await owner.mouse.click(pictureBox.x + pictureBox.width * 0.42, pictureBox.y + pictureBox.height * 0.61);
  await owner.getByLabel("Comment", { exact: true }).fill("Change this finish to walnut.");
  await owner.getByRole("button", { name: "Pin comment" }).click();
  await owner.getByRole("region", { name: "Discussion C-001" }).first().waitFor();
  const thread = (await db(owner)).collab_threads[0];
  near(thread.x, 0.42, "3: the pin is stored 42% across the render", 0.01);
  near(thread.y, 0.61, "3: and 61% down", 0.01);
  equal([thread.anchor_kind, thread.revision_id, thread.number], ["drawing", revisionA.id, "C-001"], "3: on revision A, numbered C-001");
  const pin = owner.getByRole("button", { name: /^C-001: / });
  const pinBox = await pin.boundingBox();
  near(pinBox.x + pinBox.width / 2, pictureBox.x + pictureBox.width * 0.42, "3: drawn where it was placed", 2);

  // The client, a commenter, in another tab.
  const client = await open("client", "&tab=discuss");
  await client.getByRole("list", { name: "Discussions" }).getByText("Change this finish to walnut.").waitFor();
  ok(await client.getByLabel("Unread").count() >= 1, "3: the client sees the new comment, marked unread");
  await client.getByRole("list", { name: "Discussions" }).getByText("Change this finish to walnut.").click();
  ok(await client.getByRole("button", { name: "Make a task" }).count() === 0, "3: a commenter is not offered to make tasks");
  await owner.evaluate(() => { window.__notReloaded = true; });
  await client.getByLabel("Reply").fill("Yes — walnut veneer, please. @dawit can you confirm the supplier?");
  await client.getByRole("button", { name: "Send" }).click();
  await client.getByRole("region", { name: "Discussion C-001" }).getByText("walnut veneer, please").waitFor();
  // The owner's panel is open on the thread: the reply arrives live.
  const live = await owner.getByRole("region", { name: "Discussion C-001" }).getByText("walnut veneer, please").waitFor({ timeout: 8000 }).then(() => true, () => false);
  ok(live && (await owner.evaluate(() => window.__notReloaded === true)), "3: the reply reaches the owner live, without a reload");
  const comments = (await db(owner)).collab_comments;
  equal(comments.map((comment) => comment.author_id), [people.owner.id, people.client.id], "3: two comments, each by its author");
  equal(comments[1].mentions, [people.editor.id], "3: the @mention names the designer");

  // The owner makes it a task for the designer — with this tab's live
  // updates paused, so the task shows because the panel fetched it, not
  // because realtime happened to bring the thread back.
  await owner.evaluate(() => { window.__collab.deaf = true; });
  await owner.getByRole("button", { name: "Make a task" }).click();
  const taskForm = owner.getByRole("form", { name: "Make a task" });
  await taskForm.getByLabel("Owner").selectOption({ label: people.editor.name });
  await taskForm.getByRole("button", { name: "Create task" }).click();
  await owner.getByRole("region", { name: "Discussion C-001" }).getByRole("link", { name: /Task · Open/ }).waitFor();
  await owner.evaluate(() => { window.__collab.deaf = false; });
  // The client's open panel learns of the task live.
  await client.getByRole("region", { name: "Discussion C-001" }).getByRole("link", { name: /Task · Open/ }).waitFor({ timeout: 8000 });
  const task = (await db(owner)).agenda_tasks[0];
  const linked = (await db(owner)).collab_threads[0];
  equal([task.assigned_to, linked.task_id, linked.assigned_to], [people.editor.id, task.id, people.editor.id], "3: an Agenda task, assigned to the designer, linked from the comment");
  ok(task.description.includes(`collaborate?thread=${linked.id}`), "3: and the task links back to the comment");

  // The designer: sees it, uploads revision B, marks it ready for review.
  const designer = await open("editor", `&tab=review&drawing=${drawings[0].id}`);
  await designer.getByRole("button", { name: /^C-001: / }).waitFor({ timeout: 15000 });
  await designer.locator('input[type=file]').last().setInputFiles(RENDER_B);
  await designer.getByRole("button", { name: "B", exact: true }).waitFor({ timeout: 15000 });
  const revisions = (await db(designer)).agenda_drawing_revisions;
  equal(revisions.map((revision) => revision.revision), ["A", "B"], "3: revision B is added");
  ok(revisions[0].storage_path !== revisions[1].storage_path && (await designer.evaluate((path) => Boolean(localStorage.getItem(`__collab_file:agenda-files/${path}`)), revisions[0].storage_path)), "3: and the original file is still there");
  equal((await db(designer)).agenda_drawings[0].current_revision_id, revisions[1].id, "3: B is now current");
  await designer.getByRole("button", { name: /^C-001/ }).first().click();
  await client.evaluate(() => { window.__notReloaded = true; });
  ok(await designer.getByRole("region", { name: "Discussion C-001" }).getByRole("link", { name: /Task · Open/ }).waitFor().then(() => true, () => false), "3: the designer opening the comment sees its task");
  await designer.getByRole("button", { name: "Ready for review" }).click();
  // Once it is saved the button goes: there is nothing more to mark.
  await designer.getByRole("region", { name: "Discussion C-001" }).getByRole("button", { name: "Ready for review" }).waitFor({ state: "detached" });
  equal((await db(designer)).collab_threads[0].status, "ready_for_review", "3: the correction is ready for review");

  // The client approves, on the revision they now compare.
  const ready = await client.getByRole("region", { name: "Discussion C-001" }).getByText("Ready for review").first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  ok(ready && (await client.evaluate(() => window.__notReloaded === true)), "3: the client sees it is ready, live");
  await client.getByRole("region", { name: "Discussion C-001" }).getByRole("button", { name: "Approve" }).click();
  await client.getByRole("region", { name: "Discussion C-001" }).getByText(/Approved by Sara Client/).waitFor();
  const approved = (await db(client)).collab_threads[0];
  equal([approved.status, approved.resolved_by], ["approved", people.client.id], "3: approved, and the approval says who");

  // -------------------------------------------------------------------------
  // 4. A stale save is refused, not written over somebody else's.
  // -------------------------------------------------------------------------
  const planner = await open("owner", "&tab=canvas");
  const note = () => planner.locator("foreignObject").filter({ hasText: /Walnut or oak\?|Oak, decided/ }).first();
  await note().waitFor();
  const stickyBefore = (await db(planner)).collab_items.find((item) => item.id === sticky.id);
  // Somebody else changes the note in a way this tab has not heard about.
  await planner.evaluate((id) => {
    const data = window.__collab.read();
    const row = data.collab_items.find((item) => item.id === id);
    row.data = { ...row.data, text: "Oak, decided" };
    row.revision += 1;
    window.__collab.write(data);
  }, sticky.id);
  const dragNote = async (page, dx, dy) => {
    const at = await note().boundingBox();
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + dx, at.y + at.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
  };
  // A drag of n screen pixels is n / zoom on the canvas.
  const zoom = parseInt(await planner.getByTitle("Reset to 100% (0)").innerText(), 10) / 100;
  await dragNote(planner, 60, 0);
  ok(await planner.locator("[data-sonner-toast]").filter({ hasText: "Somebody else changed this a moment ago" }).first().waitFor({ timeout: 8000 }).then(() => true, () => false), "4: moving a note somebody else has just changed says so");
  const afterConflict = (await db(planner)).collab_items.find((item) => item.id === sticky.id);
  equal([afterConflict.data.text, afterConflict.x, afterConflict.revision], ["Oak, decided", stickyBefore.x, stickyBefore.revision + 1], "4: their change stands; the stale move is not written over it");
  await planner.locator("foreignObject").filter({ hasText: "Oak, decided" }).waitFor();
  ok(await planner.locator("foreignObject").filter({ hasText: "Walnut or oak?" }).count() === 0, "4: and this screen now shows their version");
  await saved(planner);
  equal(await planner.getByRole("alert").count(), 0, "4: which is what the server has, so it is saved — not left as an error");

  // -------------------------------------------------------------------------
  // 5. Offline: kept, said, never called saved; sent when the connection is back.
  // -------------------------------------------------------------------------
  await planner.evaluate(() => { window.__collab.offline = true; window.dispatchEvent(new Event("offline")); });
  await dragNote(planner, 50, 0);
  await planner.getByRole("status").filter({ hasText: /Offline · 1 unsaved/ }).waitFor({ timeout: 8000 });
  await planner.waitForTimeout(800);
  ok(await planner.getByRole("status").filter({ hasText: SAVED }).count() === 0, "5: offline, the canvas never says saved");
  equal((await db(planner)).collab_items.find((item) => item.id === sticky.id).x, stickyBefore.x, "5: and nothing reached the database");
  await planner.evaluate(() => { window.__collab.offline = false; window.dispatchEvent(new Event("online")); });
  await saved(planner);
  near((await db(planner)).collab_items.find((item) => item.id === sticky.id).x - stickyBefore.x, 50 / zoom, "5: back online, the move is sent by itself", 2 / zoom);

  // The connection fails without the browser noticing: said, with a Retry.
  await planner.evaluate(() => { window.__collab.offline = true; });
  await dragNote(planner, 0, 40);
  await planner.getByRole("alert").filter({ hasText: "No connection" }).waitFor({ timeout: 8000 });
  ok(await planner.getByRole("alert").getByRole("button", { name: "Retry" }).count() === 1, "5: a failed save says so, as an alert, and offers Retry");
  await planner.evaluate(() => { window.__collab.offline = false; });
  await planner.getByRole("alert").getByRole("button", { name: "Retry" }).click();
  await saved(planner);
  near((await db(planner)).collab_items.find((item) => item.id === sticky.id).y - stickyBefore.y, 40 / zoom, "5: Retry sends it", 2 / zoom);

  // -------------------------------------------------------------------------
  // 6. A viewer looks; an outsider gets nothing.
  // -------------------------------------------------------------------------
  const viewer = await open("viewer", "&tab=board");
  await viewer.getByRole("region", { name: "Concept" }).waitFor();
  ok(await viewer.getByText("View only.").count() === 1, "6: the viewer is told the board is view only");
  equal(await viewer.getByRole("button", { name: "Card", exact: true }).count(), 0, "6: no button to add a card");
  equal(await viewer.getByRole("button", { name: "New board" }).count(), 0, "6: nor to make a board");
  equal(await viewer.getByRole("button", { name: "Drag to move" }).count(), 0, "6: nor grips to move cards");
  await tab(viewer, "Canvas");
  await viewer.getByLabel(/^Canvas Site workshop/).waitFor();
  equal(await viewer.getByRole("button", { name: "Sticky note" }).count(), 0, "6: no drawing tools on the canvas");
  const viewerBefore = (await db(viewer)).collab_items.find((item) => item.id === sticky.id);
  const viewerNote = await viewer.locator("foreignObject").filter({ hasText: "Oak, decided" }).boundingBox();
  await viewer.mouse.move(viewerNote.x + viewerNote.width / 2, viewerNote.y + viewerNote.height / 2);
  await viewer.mouse.down();
  await viewer.mouse.move(viewerNote.x + 200, viewerNote.y + 120, { steps: 6 });
  await viewer.mouse.up();
  await viewer.keyboard.press("Delete");
  await viewer.waitForTimeout(700);
  const viewerAfter = (await db(viewer)).collab_items.find((item) => item.id === sticky.id);
  equal([viewerAfter.x, viewerAfter.y, viewerAfter.archived_at ?? null, viewerAfter.revision], [viewerBefore.x, viewerBefore.y, null, viewerBefore.revision], "6: dragging or deleting as a viewer changes nothing");
  await tab(viewer, "Discussion");
  // Approved in part 3, so it is under "Resolved and approved".
  await viewer.getByLabel("Show").selectOption("closed");
  await viewer.getByRole("list", { name: "Discussions" }).getByText("Change this finish to walnut.").click();
  await viewer.getByRole("region", { name: "Discussion C-001" }).waitFor();
  equal(await viewer.getByLabel("Reply").count(), 0, "6: a viewer reads the discussion but has no reply box");
  equal(await viewer.getByRole("button", { name: "New", exact: true }).count(), 0, "6: nor starts one");

  const outsider = await open("outsider");
  ok(await outsider.locator("#not-found").isVisible(), "6: somebody not on the project gets not-found");
  equal(await outsider.locator('nav[aria-label="Studio"]').count(), 0, "6: and none of the Studio");

  // -------------------------------------------------------------------------
  // 7. A phone: the comments as a sheet, nothing wider than the screen, and a
  //    pinch that zooms without moving what it lands on.
  // -------------------------------------------------------------------------
  const storage = await planner.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])));
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await phone.addInitScript((entries) => { if (!localStorage.getItem("__collab_fake_db")) for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value); }, storage);
  const mobile = await phone.newPage();
  mobile.on("pageerror", (error) => errors.push(`phone: ${error.message}`));
  await mobile.goto(`${url}?as=owner&tab=review&drawing=${drawings[0].id}&thread=${thread.id}`);
  await mobile.locator('nav[aria-label="Studio"]').waitFor();
  const sheet = mobile.getByRole("dialog", { name: "Comments" });
  await sheet.getByRole("region", { name: "Discussion C-001" }).waitFor();
  equal(await mobile.locator('aside[aria-label="Comments"]').count(), 0, "7: on a phone the comments are a sheet, not a side column");
  equal(await mobile.getByRole("region", { name: "Discussion C-001" }).count(), 1, "7: shown once");
  const sheetBox = await sheet.boundingBox();
  ok(sheetBox.y >= 844 * 0.45 && Math.abs(sheetBox.y + sheetBox.height - 844) < 2, `7: over the lower half of the screen (from ${Math.round(sheetBox.y)}px)`);
  ok(await mobile.evaluate(() => window.innerWidth === 390 && document.documentElement.scrollWidth <= 390), "7: nothing is wider than the phone");
  const phonePicture = await mobile.locator('[aria-label^="house, revision"] image').boundingBox();
  ok(phonePicture && phonePicture.height > 100 && phonePicture.y < sheetBox.y, "7: the drawing itself shows above the sheet");
  await sheet.getByRole("button", { name: "Lower comments" }).click();
  const lowered = await sheet.boundingBox();
  ok(lowered.height < 60 && lowered.y + lowered.height > 843, `7: lowered, the sheet is just a handle (${Math.round(lowered.height)}px)`);
  ok((await mobile.locator('[aria-label^="house, revision"] image').boundingBox()).y + 100 < lowered.y, "7: and the drawing is in full view");
  await sheet.getByRole("button", { name: "Raise comments" }).click();
  await sheet.getByRole("region", { name: "Discussion C-001" }).waitFor();
  await mobile.screenshot({ path: join(harness.out, "phone_review.png") });

  await mobile.goto(`${url}?as=owner&tab=canvas`);
  const phoneNote = () => mobile.locator("foreignObject").filter({ hasText: "Oak, decided" }).first();
  await phoneNote().waitFor();
  ok(await mobile.evaluate(() => window.innerWidth === 390 && document.documentElement.scrollWidth <= 390), "7: the canvas fits the phone too");
  const phoneSurface = await mobile.getByLabel(/^Canvas Site workshop/).boundingBox();
  ok(phoneSurface && phoneSurface.height > 400 && phoneSurface.width > 350, `7: and has most of the screen to draw on (${phoneSurface?.width} × ${phoneSurface?.height})`);
  const touch = await phone.newCDPSession(mobile);
  const fingers = (type, points) => touch.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const zoomLabel = () => mobile.getByTitle("Reset to 100% (0)").innerText();
  const noteRow = async () => { const row = (await db(mobile)).collab_items.find((item) => item.id === sticky.id); return [row.x, row.y, row.w, row.h, row.revision]; };
  const rowBefore = await noteRow();
  // A tap selects the note (on a touch screen a finger on it does not drag it)...
  let at = await phoneNote().boundingBox();
  const centre = [at.x + at.width / 2, at.y + at.height / 2];
  await fingers("touchStart", [centre]);
  await fingers("touchEnd", []);
  await mobile.waitForTimeout(100);
  // ...then a pinch on it, the first finger landing and sliding a little before the second.
  const zoomBefore = await zoomLabel();
  await fingers("touchStart", [centre]);
  for (let step = 1; step <= 3; step += 1) await fingers("touchMove", [[centre[0] + step * 3, centre[1] + step * 2]]);
  await fingers("touchStart", [[centre[0] + 9, centre[1] + 6], [centre[0] + 40, centre[1] + 40]]);
  for (let step = 1; step <= 10; step += 1) await fingers("touchMove", [[centre[0] + 9 - step * 6, centre[1] + 6 - step * 6], [centre[0] + 40 + step * 6, centre[1] + 40 + step * 6]]);
  await fingers("touchEnd", []);
  await mobile.waitForTimeout(900);
  const zoomAfter = await zoomLabel();
  ok(parseInt(zoomAfter, 10) > parseInt(zoomBefore, 10), `7: the pinch zooms in (${zoomBefore} → ${zoomAfter})`);
  equal(await noteRow(), rowBefore, "7: and the note it landed on has not moved or been saved");
  at = await phoneNote().boundingBox();
  ok(at.width > 0, "7: the note is still drawn");
  ok(await mobile.getByRole("status").filter({ hasText: SAVED }).count() === 1 && (await mobile.getByRole("alert").count()) === 0, "7: with nothing waiting to save");
  await mobile.screenshot({ path: join(harness.out, "phone_canvas.png") });
  console.log(`phone screenshots: ${harness.out}`);
  await phone.close();

  console.log(`Studio in the browser, parts 1-7: ${checks} checks`);
  ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
} catch (error) {
  // What each tab showed when it went wrong, and anything it said.
  for (const [index, page] of context.pages().entries()) {
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    console.error(`tab ${index} (${page.url()}): ${toasts.join(" | ") || "no messages"}`);
    await page.screenshot({ path: join(harness.out, `failure_${index}.png`) }).catch(() => {});
  }
  console.error(`screenshots in ${harness.out}; page errors: ${errors.join(" | ") || "none"}`);
  throw error;
} finally {
  await harness.close();
}
console.log(`Collaborative Studio in the browser: ${checks} checks`);
