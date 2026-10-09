/**
 * Sketch, pins, Files and the Agenda, in the browser.
 *
 *   npm run build && node scripts/house_sketch_check.mjs
 *
 * Markup over the plan, a photo, a PDF page and a DXF; calibration and
 * measuring; pins on a sketch and on the plan; a pin put on the Agenda as a
 * task that links back to the exact place, and its discussion; the project's
 * files. The originals are never changed. Supabase is the in-memory fake.
 */
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import { openHarness, PLAN, UNDER } from "./house_harness.mjs";

const harness = await openHarness();
if (!harness) {
  console.log("SKIP: house sketch check needs Playwright (npm i -g playwright)");
  process.exit(0);
}
const { browser, url } = harness;

// ---------------------------------------------------------------------------
// Fixtures: a photo, a two-page PDF and a DXF, made here so the check needs
// nothing from outside.
// ---------------------------------------------------------------------------
function png(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([length, body, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y += 1) { const row = [0]; for (let x = 0; x < width; x += 1) row.push(y === 50 ? 0 : 200, y === 50 ? 0 : 180, y === 50 ? 0 : 160); rows.push(Buffer.from(row)); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
function pdf(pages) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`];
  pages.forEach((text, index) => {
    const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET 72 600 m 500 600 l S`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${4 + index * 2} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => { const at = body.length; body += `${index + 1} 0 obj\n${object}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
const dxf = Buffer.from([
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "WALLS", "10", "0", "20", "0", "30", "0", "11", "5000", "21", "0", "31", "0",
  "0", "LINE", "8", "WALLS", "10", "5000", "20", "0", "30", "0", "11", "5000", "21", "3000", "31", "0",
  "0", "LINE", "8", "FURNITURE", "10", "1000", "20", "1000", "30", "0", "11", "2000", "21", "1000", "31", "0",
  "0", "CIRCLE", "8", "FURNITURE", "10", "2500", "20", "1500", "30", "0", "40", "300",
  "0", "TEXT", "8", "NOTES", "10", "100", "20", "2800", "30", "0", "40", "200", "1", "Kitchen",
  "0", "ENDSEC", "0", "EOF", "",
].join("\n"));

// ---------------------------------------------------------------------------

const screen = (page, selector, x, y) => page.evaluate(([selector, x, y]) => {
  const node = document.querySelector(selector);
  const target = node.querySelector("g[transform]") ?? node;
  const point = new DOMPoint(x, y).matrixTransform(target.getScreenCTM());
  return [point.x, point.y];
}, [selector, x, y]);
const db = (page) => page.evaluate(() => window.__fakeDb.read());
const SKETCH = 'svg[aria-label^="Sketch over"]';
const shapes = (page, type) => page.locator(`${SKETCH} g[aria-label="Markup"] [data-shape${type ? `="${type}"` : ""}]`).count();

async function touchDrag(page, cdp, selector, from, to) {
  const [ax, ay] = await screen(page, selector, ...from);
  const [bx, by] = await screen(page, selector, ...to);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: ax, y: ay, id: 0 }] });
  for (let step = 1; step <= 8; step += 1) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: ax + (bx - ax) * step / 8, y: ay + (by - ay) * step / 8, id: 0 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(150);
}
async function tap(page, selector, x, y) {
  const [sx, sy] = await screen(page, selector, x, y);
  await page.touchscreen.tap(sx, sy);
  await page.waitForTimeout(150);
}
const tool = (page, name) => page.locator('nav[aria-label="Sketch tools"]').getByRole("button", { name, exact: true }).click();
const savedSketch = (page) => page.waitForFunction(() => document.querySelector('[aria-label^="Sketch status:"]')?.getAttribute("aria-label") === "Sketch status: Saved ✓", null, { timeout: 10000 });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);

  // A plan, saved into a new project.
  await page.getByRole("button", { name: "Draw floor plan", exact: true }).click();
  await page.locator(PLAN).waitFor();
  const [ox, oy] = await screen(page, PLAN, 0, 0);
  await page.touchscreen.tap(ox, oy);
  for (const [direction, length] of [["→", 8000], ["↓", 6500], ["←", 8000], ["↑", 6500]]) {
    await page.getByRole("button", { name: `Run ${direction}` }).click();
    await page.getByLabel("Typed length").fill(String(length));
    await page.getByLabel("Typed length").press("Enter");
  }
  await page.locator(UNDER).waitFor();
  await page.locator('nav[aria-label="Modeling tools"]').getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("tab", { name: "Sketch" }).click();
  assert.match(await page.locator("#workspace").innerText(), /Save the plan into a project first/, "sketches live in the project: an unsaved plan says so");
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.getByRole("button", { name: "Save project" }).click();
  await page.getByLabel("New project name").fill("Kitchen renovation");
  await page.getByRole("dialog", { name: "Save project" }).getByRole("button", { name: "Save" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label^="Save status:"]')?.getAttribute("aria-label") === "Save status: Saved ✓");
  const plan = (await db(page)).agenda_plans[0];
  const planBefore = JSON.stringify(plan.data);

  // -------------------------------------------------------------------------
  // Sketch over the plan: pen, arrow, shape, text, measure, dimension, eraser.
  // -------------------------------------------------------------------------
  await page.getByRole("tab", { name: "Sketch" }).click();
  await page.getByRole("button", { name: "Ground Floor", exact: true }).click();
  await page.locator(SKETCH).waitFor();
  assert.match(await page.locator(`${SKETCH} image[aria-label="Source"]`).getAttribute("href"), /^data:image\/svg\+xml/, "the plan is drawn underneath, as a picture of it");
  assert.deepEqual(await page.locator('nav[aria-label="Sketch tools"]').getByRole("button").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))), ["Select", "Pen", "Arrow", "Shape", "Text", "Measure", "Dimension", "Pin", "Eraser"], "the sketch tools");
  await tool(page, "Pen");
  await touchDrag(page, cdp, SKETCH, [1000, 1000], [3000, 2000]);
  assert.equal(await shapes(page, "pen"), 1, "a finger draws with the pen");
  await tool(page, "Pen");
  await page.getByRole("radiogroup", { name: "Pen" }).getByRole("radio", { name: "Highlighter" }).click();
  await touchDrag(page, cdp, SKETCH, [1000, 3000], [5000, 3000]);
  assert.equal(await shapes(page, "highlighter"), 1, "and with the highlighter");
  await tool(page, "Arrow");
  await touchDrag(page, cdp, SKETCH, [6000, 5000], [7500, 6200]);
  await tool(page, "Shape");
  for (const [name, at] of [["Rectangle", [500, 4000]], ["Circle", [2500, 4000]], ["Cloud", [4500, 4000]], ["Line", [6500, 4000]]]) {
    await tool(page, "Shape");
    await page.getByRole("radiogroup", { name: "Shape" }).getByRole("radio", { name }).click();
    await touchDrag(page, cdp, SKETCH, at, [at[0] + 1200, at[1] + 1200]);
  }
  for (const type of ["arrow", "rect", "circle", "cloud", "line"]) assert.equal(await shapes(page, type), 1, `a ${type} is drawn`);
  await tool(page, "Text");
  await tap(page, SKETCH, 2000, 5800);
  await page.getByLabel("Sketch text").fill("Verify height");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  assert.equal(await page.locator(`${SKETCH} text`, { hasText: "Verify height" }).count(), 1, "a note is written on it");
  // The new text is selected immediately. Move it by touch and edit the
  // original shape rather than creating a second note.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Sketch text").fill("Verify opening height");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert.equal(await shapes(page, "text"), 1, "editing a note does not duplicate it");
  const textBefore = Number(await page.locator(`${SKETCH} [data-shape="text"] text`).getAttribute("x"));
  await touchDrag(page, cdp, SKETCH, [2200, 5680], [2700, 5550]);
  const textAfter = Number(await page.locator(`${SKETCH} [data-shape="text"] text`).getAttribute("x"));
  assert.ok(textAfter > textBefore + 350, "selected text is draggable on mobile");
  // An arrow can also be created by tapping twice, not only by dragging.
  await tool(page, "Arrow");
  await tap(page, SKETCH, 500, 6200);
  await tap(page, SKETCH, 1600, 6400);
  assert.equal(await shapes(page, "arrow"), 2, "two taps place a visible arrow");
  assert.equal(await page.locator(`${SKETCH} [data-shape="arrow"] polygon`).count(), 2, "arrow heads render as real SVG polygons on Safari");
  await tool(page, "Measure");
  await touchDrag(page, cdp, SKETCH, [0, 600], [3620, 600]);
  assert.equal(await page.locator(`${SKETCH} [data-shape="measure"] text`).textContent(), "3620 mm", "on the plan, Measure reads millimetres at once");
  await tool(page, "Dimension");
  await touchDrag(page, cdp, SKETCH, [0, -600], [8000, -600]);
  assert.equal(await page.locator(`${SKETCH} [data-shape="dimension"] text`).textContent(), "8000 mm", "and a dimension line says its length");
  const drawn = await shapes(page);
  await tool(page, "Eraser");
  await tap(page, SKETCH, 2000, 1500);
  assert.equal(await shapes(page, "pen"), 0, "the eraser takes a stroke away");
  await page.getByRole("button", { name: "Undo sketch" }).click();
  assert.equal(await shapes(page, "pen"), 1, "and undo brings it back");
  assert.equal(await shapes(page), drawn);

  await page.getByRole("button", { name: "Save sketch" }).click();
  await savedSketch(page);
  let state = await db(page);
  const sketch = state.agenda_sketches[0];
  assert.equal(sketch.source_kind, "plan", "the sketch is saved, over the plan");
  assert.equal(sketch.plan_id, plan.id);
  assert.equal(sketch.markup.length, drawn, "with every mark");
  assert.ok(sketch.preview_path?.startsWith(`${plan.project_id}/sketches/`), "and the marked-up picture, in the project's files");
  assert.match(await page.evaluate((path) => localStorage.getItem(`__house_fake_file:${path}`)?.slice(0, 22), sketch.preview_path), /^data:image\/png/, "as a PNG");
  assert.equal(JSON.stringify(state.agenda_plans[0].data), planBefore, "sketching never touched the plan");

  // -------------------------------------------------------------------------
  // A pin on the sketch, put on the Agenda, and discussed.
  // -------------------------------------------------------------------------
  await tool(page, "Pin");
  await tap(page, SKETCH, 4000, 0);
  await page.getByRole("dialog", { name: "New pin" }).getByLabel("Title").fill("Kitchen wall");
  await page.getByRole("dialog", { name: "New pin" }).getByLabel("Note").fill("Kitchen wall appears to be 3.62 m. Please verify on site.");
  await page.getByRole("dialog", { name: "New pin" }).getByLabel("Measurement").fill("3.62 m");
  await page.getByRole("button", { name: "+ Agenda" }).click();
  await page.locator("[data-sonner-toast]", { hasText: "PIN-001 is on the Agenda" }).waitFor({ timeout: 10000 });
  state = await db(page);
  const pin = state.agenda_pins[0];
  assert.equal(pin.number, "PIN-001");
  assert.equal(pin.sketch_id, sketch.id, "the pin is on the sketch");
  assert.deepEqual([pin.x, pin.y, pin.source_kind], [Math.round(pin.x), Math.round(pin.y), "plan"].map((value, index) => index < 2 ? pin[index ? "y" : "x"] : value));
  assert.ok(Math.abs(pin.x - 4000) < 60 && Math.abs(pin.y) < 60, `where it was dropped (${pin.x}, ${pin.y})`);
  const task = state.agenda_tasks.find((item) => item.id === pin.task_id);
  assert.ok(task, "a task is on the project's Agenda");
  assert.equal(task.project_id, plan.project_id, "the same project");
  assert.equal(task.title, "Kitchen wall");
  assert.match(task.description, /Please verify on site\.\nMeasurement: 3\.62 m\nDrawing: My house · Ground Floor · PIN-001\nOpen: http:\/\/localhost:\d+\/house-design\?plan=[^&]+&sketch=[^&]+&pin=/, "saying what, the measurement, where, and the way back");
  const attachment = (state.agenda_attachments ?? []).find((item) => item.entity_id === task.id);
  assert.ok(attachment && attachment.entity_table === "agenda_tasks" && attachment.url.startsWith(`${plan.project_id}/sketches/`), "with the marked-up image attached");
  assert.equal(await page.locator(`${SKETCH} [data-shape="pin"]`).count(), 1, "the pin is drawn on the sketch");

  await page.locator(`${SKETCH} [data-shape="pin"]`).waitFor();
  await tool(page, "Select");
  await tap(page, SKETCH, pin.x, pin.y - 120);
  const pinSheet = page.getByRole("region", { name: "Pin PIN-001" });
  await pinSheet.waitFor();
  assert.match(await pinSheet.innerText(), /On the Agenda · todo/, "the pin shows its task and the task's state");
  await pinSheet.getByLabel("Message", { exact: true }).fill("Move this partition 200 mm.");
  await pinSheet.getByRole("button", { name: "Send message" }).click();
  await pinSheet.getByText("Move this partition 200 mm.").waitFor();
  state = await db(page);
  assert.equal(state.agenda_task_comments?.length, 1, "the discussion is the Agenda task's own comments");
  assert.equal(state.agenda_task_comments[0].task_id, task.id);
  await pinSheet.getByRole("button", { name: /mark resolved/ }).click();
  await page.waitForFunction(() => window.__fakeDb.read().agenda_pins[0].status === "resolved");
  await pinSheet.getByRole("button", { name: "Close pin" }).click();

  // -------------------------------------------------------------------------
  // A pin on the plan itself, from a selected wall.
  // -------------------------------------------------------------------------
  await page.getByRole("button", { name: "Back to sketches" }).click();
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.locator(PLAN).waitFor();
  // The sketch's pin is on the plan's own coordinates, so it shows on the plan too.
  assert.equal(await page.locator(`${PLAN} g[aria-label="Pin PIN-001"]`).count(), 1, "a pin on a sketch of the plan shows on the plan");
  await tap(page, PLAN, 1500, 0);
  await page.getByRole("toolbar", { name: "Wall actions" }).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Add to Agenda" }).click();
  const dialog = page.getByRole("dialog", { name: "New pin" });
  assert.equal(await dialog.getByLabel("Title").inputValue(), "Wall A (Room 1)", "a pin from a wall is titled with the wall");
  assert.equal(await dialog.getByLabel("Measurement").inputValue(), "8000 mm", "and carries its length");
  await dialog.getByRole("button", { name: "Place pin" }).click();
  await page.getByRole("region", { name: "Pin PIN-002" }).waitFor();
  assert.equal(await page.locator(`${PLAN} g[aria-label="Pin PIN-002"]`).count(), 1, "the pin is on the plan");
  state = await db(page);
  const planPin = state.agenda_pins.find((item) => item.number === "PIN-002");
  assert.deepEqual([planPin.source_kind, planPin.source_level, planPin.sketch_id, planPin.task_id ?? null], ["plan", "ground-floor", null, null], "on the floor, not yet a task");
  await page.getByRole("region", { name: "Pin PIN-002" }).getByRole("button", { name: "Add to Agenda" }).click();
  await page.waitForFunction(() => window.__fakeDb.read().agenda_pins.find((item) => item.number === "PIN-002").task_id);
  const second = page.getByRole("region", { name: "Pin PIN-002" }).getByRole("region", { name: "Discussion" });
  await second.getByText("No messages yet.").waitFor();
  assert.doesNotMatch(await second.innerText(), /Move this partition/, "each pin's discussion is its own task's");
  await page.getByRole("region", { name: "Pin PIN-002" }).getByRole("button", { name: "Close pin" }).click();

  // The Agenda tab lists both, with their tasks.
  await page.getByRole("tab", { name: "Agenda" }).click();
  const agenda = page.getByRole("region", { name: "Agenda" });
  assert.match(await agenda.innerText(), /Kitchen wall[\s\S]*Ground Floor · 3\.62 m[\s\S]*todo/, "the Agenda tab lists the pins and their tasks");
  assert.match(await agenda.innerText(), /Wall A \(Room 1\)/);

  // Measurements go to the Agenda too.
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.getByRole("button", { name: /^Measurements/ }).click();
  await page.getByRole("region", { name: "Measurements" }).getByRole("button", { name: "Send to Agenda" }).click();
  await page.waitForFunction(() => window.__fakeDb.read().agenda_tasks.some((item) => item.title.startsWith("Measurements")));
  assert.match((await db(page)).agenda_tasks.find((item) => item.title.startsWith("Measurements")).description, /^My house — Ground Floor\nRoom 1: 8000 × 6500 mm/, "the measurements, as copied, are sent as an Agenda item");

  // -------------------------------------------------------------------------
  // From the Agenda back to the exact place.
  // -------------------------------------------------------------------------
  await page.goto(`${url}house-design?plan=${plan.id}&pin=${planPin.id}`);
  await page.getByRole("region", { name: "Pin PIN-002" }).waitFor();
  const view = await page.locator(PLAN).getAttribute("viewBox");
  const [vx, vy, vw, vh] = view.split(" ").map(Number);
  assert.ok(planPin.x > vx && planPin.x < vx + vw && planPin.y > vy && planPin.y < vy + vh && vw < 8000, `a plan pin's link opens the plan, zoomed onto the pin (${view})`);
  await page.goto(`${url}house-design?plan=${plan.id}&sketch=${sketch.id}&pin=${pin.id}`);
  await page.locator(SKETCH).waitFor();
  await page.getByRole("region", { name: "Pin PIN-001" }).waitFor();
  assert.equal(await page.getByLabel("Sketch name").inputValue(), "Ground Floor sketch", "a sketch pin's link opens that sketch");
  assert.match(await page.getByRole("region", { name: "Pin PIN-001" }).innerText(), /Move this partition 200 mm\./, "with its discussion");
  await page.getByRole("region", { name: "Pin PIN-001" }).getByRole("button", { name: "Close pin" }).click();
  await page.getByRole("button", { name: "Back to sketches" }).click();

  // -------------------------------------------------------------------------
  // A site photo: sketch on it, calibrate it, measure on it.
  // -------------------------------------------------------------------------
  const photo = png(400, 300);
  await page.getByLabel("Photo to sketch on").setInputFiles({ name: "kitchen.png", mimeType: "image/png", buffer: photo });
  await page.locator(SKETCH).waitFor();
  state = await db(page);
  const filed = state.agenda_photos?.[0];
  assert.ok(filed && filed.project_id === plan.project_id, "the photo is filed with the project's photos");
  assert.equal(await page.locator(`${SKETCH} image[aria-label="Source"]`).getAttribute("width"), "400", "and opened at its own size");
  assert.equal(await page.getByLabel("Scale").innerText(), "Not calibrated");
  await tool(page, "Measure");
  await touchDrag(page, cdp, SKETCH, [50, 50], [250, 50]);
  assert.equal(await page.locator(`${SKETCH} [data-shape="measure"] text`).textContent(), "200 px · not calibrated", "before calibration, Measure says it is not to scale");
  await page.getByRole("button", { name: "Calibrate scale" }).click();
  await tap(page, SKETCH, 50, 100);
  await tap(page, SKETCH, 350, 100);
  await page.getByLabel("Known length").fill("3000");
  await page.getByRole("button", { name: "Set scale" }).click();
  await tool(page, "Measure");
  await touchDrag(page, cdp, SKETCH, [50, 200], [250, 200]);
  const measured = await page.locator(`${SKETCH} [data-shape="measure"] text`).nth(1).textContent();
  assert.ok(/^(199\d|200\d) mm$/.test(measured), `after calibrating 300 px as 3000 mm, 200 px reads 2000 mm (${measured})`);
  await tool(page, "Arrow");
  await touchDrag(page, cdp, SKETCH, [100, 250], [200, 150]);
  await page.getByRole("button", { name: "Save sketch" }).click();
  await savedSketch(page);
  state = await db(page);
  const photoSketch = state.agenda_sketches.find((item) => item.source_kind === "image");
  assert.ok(Math.abs(photoSketch.scale_mm_per_unit - 10) < 0.2, "the calibration is saved with the sketch");
  assert.equal(photoSketch.source_path, filed.storage_path, "the sketch names the photo");
  const original = await page.evaluate((path) => localStorage.getItem(`__house_fake_file:${path}`), filed.storage_path);
  assert.equal(original, `data:image/png;base64,${photo.toString("base64")}`, "and the photo itself is untouched");
  await page.getByRole("button", { name: "Back to sketches" }).click();

  // -------------------------------------------------------------------------
  // Files: a PDF, a DXF and a DWG.
  // -------------------------------------------------------------------------
  await page.getByRole("tab", { name: "Files" }).click();
  const files = page.getByRole("region", { name: "Files" });
  await files.getByText("kitchen.png").waitFor();
  await files.getByLabel("File category").selectOption("pdf");
  await files.getByLabel("Add a file").setInputFiles({ name: "ground_floor.pdf", mimeType: "application/pdf", buffer: pdf(["Ground floor plan", "Sections"]) });
  await files.getByText("ground_floor.pdf").waitFor();
  await files.getByLabel("File category").selectOption("cad");
  await files.getByLabel("Add a file").setInputFiles({ name: "kitchen.dxf", mimeType: "image/vnd.dxf", buffer: dxf });
  await files.getByText("kitchen.dxf").waitFor();
  await files.getByLabel("Add a file").setInputFiles({ name: "survey.dwg", mimeType: "", buffer: Buffer.from("AC1027 not really a dwg") });
  await files.getByText("survey.dwg").waitFor();
  state = await db(page);
  assert.equal(state.agenda_documents.length, 3, "files go into the project's documents");
  assert.deepEqual(state.agenda_documents.map((item) => item.tags[0]).sort(), ["cad", "cad", "pdf"]);
  assert.equal(state.agenda_document_versions.find((item) => item.file_name === "kitchen.dxf").mime_type, "application/octet-stream", "a DXF is stored as the bucket accepts it");
  await files.getByRole("tab", { name: "CAD" }).click();
  assert.deepEqual(await files.getByRole("listitem").allInnerTexts().then((items) => items.map((text) => text.split("\n")[0])), ["survey.dwg", "kitchen.dxf"], "grouped: CAD shows the drawings");
  assert.equal(await files.getByRole("button", { name: "Sketch on survey.dwg" }).count(), 0, "a DWG is kept, not drawn");
  await files.getByRole("tab", { name: "All" }).click();

  // The PDF: pages, thumbnails, rotate, sketch, calibrate.
  await files.getByRole("button", { name: "Sketch on ground_floor.pdf" }).click();
  await page.locator(SKETCH).waitFor({ timeout: 20000 });
  assert.match(await page.locator(`${SKETCH} image[aria-label="Source"]`).getAttribute("href"), /^data:image\/png/, "a PDF page is rendered to sketch on");
  assert.equal(await page.locator(`${SKETCH} image[aria-label="Source"]`).getAttribute("width"), "595", "at the page's size");
  const pages = page.getByRole("tablist", { name: "Pages" });
  assert.equal(await pages.getByRole("tab").count(), 2, "a two-page PDF offers both pages");
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Pages"] img').length === 2, null, { timeout: 15000 });
  await tool(page, "Pen");
  await touchDrag(page, cdp, SKETCH, [100, 100], [300, 300]);
  await page.getByRole("button", { name: "Rotate view" }).click();
  assert.match(await page.locator(`${SKETCH} g[transform]`).first().getAttribute("transform"), /^rotate\(90 /, "the view turns");
  await tool(page, "Arrow");
  await touchDrag(page, cdp, SKETCH, [400, 400], [500, 500]);
  const arrow = await page.locator(`${SKETCH} [data-shape="arrow"] line`).evaluate((line) => [line.getAttribute("x1"), line.getAttribute("y1")].map(Number));
  assert.ok(Math.abs(arrow[0] - 400) < 15 && Math.abs(arrow[1] - 400) < 15, `markup drawn on a turned page lands on the page where it was drawn (${arrow})`);
  await page.getByRole("button", { name: "Save sketch" }).click();
  await savedSketch(page);
  await pages.getByRole("tab", { name: "Page 2" }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Sketch name"]')?.value.endsWith("page 2"));
  assert.equal(await shapes(page), 0, "page 2 has its own markup");
  await pages.getByRole("tab", { name: "Page 1" }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Sketch name"]')?.value.endsWith("page 1"));
  assert.equal(await shapes(page), 2, "and page 1 keeps its own");
  await page.getByRole("button", { name: "Back to sketches" }).click();

  // The DXF: drawn in millimetres from its own units, with layers.
  await page.getByRole("tab", { name: "Files" }).click();
  await files.getByRole("button", { name: "Sketch on kitchen.dxf" }).click();
  await page.locator(SKETCH).waitFor({ timeout: 20000 });
  assert.equal(await page.getByLabel("Scale").innerText(), "Scale set", "a DXF in millimetres needs no calibration");
  const source = () => page.locator(`${SKETCH} image[aria-label="Source"]`).getAttribute("href").then((href) => decodeURIComponent(href));
  assert.match(await source(), /<polyline points="0,0 5000,0"/, "its lines are drawn");
  assert.match(await source(), /<polyline points="5000,0 5000,-3000"/, "the right way up: a DXF's y points up the page");
  assert.match(await source(), /Kitchen/, "and its text");
  await tool(page, "Measure");
  await touchDrag(page, cdp, SKETCH, [0, 0], [5000, 0]);
  const reading = await page.locator(`${SKETCH} [data-shape="measure"] text`).textContent();
  assert.ok(/^(49[5-9]\d|50[0-4]\d) mm$/.test(reading), `measured along the 5000 mm wall (${reading})`);
  await page.getByText(/^Layers · 3\/3/).click();
  await page.getByRole("checkbox", { name: "FURNITURE" }).uncheck();
  assert.doesNotMatch(await source(), /<circle/, "turning a layer off hides it");
  assert.match(await source(), /5000,0/, "and leaves the rest");

  // Any selected annotation can start its own Agenda discussion. It reuses
  // exactly the task-comment system already exercised above for plan pins.
  await tool(page, "Select");
  await tap(page, SKETCH, 2600, 0);
  await page.getByRole("button", { name: "Discuss", exact: true }).click();
  const discussion = page.getByRole("dialog", { name: "New pin" });
  await discussion.getByLabel("Title").fill("Review CAD measurement");
  await discussion.getByRole("button", { name: "Create discussion" }).click();
  await page.waitForFunction(() => window.__fakeDb.read().agenda_tasks.some((item) => item.title === "Review CAD measurement"), null, { timeout: 10000 });
  const discussed = await db(page);
  const taskForAnnotation = discussed.agenda_tasks.find((item) => item.title === "Review CAD measurement");
  assert.ok(discussed.agenda_pins.some((pin) => pin.task_id === taskForAnnotation.id), "a selected annotation creates a linked Agenda discussion");

  assert.deepEqual(errors, [], "page errors");
  await page.close();
} finally {
  await harness.close();
}

console.log("House Plan sketch: markup over the plan, a photo, a PDF page and a DXF; calibration and measuring; pins on sketches and on the plan; pins as Agenda tasks with the marked image and the way back; discussion as the task's comments; measurements sent to the Agenda; deep links to the exact pin; project files grouped, DWG kept; originals untouched");
