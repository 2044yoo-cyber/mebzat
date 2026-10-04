/**
 * Use a template: a library of real plans, ranked against the plot.
 *
 *   npx tsx scripts/house_template_library_check.ts
 */
import assert from "node:assert/strict";

import { roomSchema } from "../src/features/berchuma-studio/types/room";
import { adjustTemplate, buildTemplate, DEFAULT_SETBACKS, facePlan, fitTemplate, rankTemplates, ROOM_MINIMUM, TEMPLATE_LIBRARY, templateGrid, usableArea, type Plot } from "../src/features/house-designer/services/plan-library";
import { createHouseProject, houseProjectSchema, housePlanWalls } from "../src/features/house-designer/types/project";

const plotOf = (width: number, length: number): Plot => ({ width, length, ...DEFAULT_SETBACKS });
const byId = (id: string) => TEMPLATE_LIBRARY.find((item) => item.id === id)!;

// ---------------------------------------------------------------------------
// At least 20 plans, each real, complete and usable.
// ---------------------------------------------------------------------------
assert.ok(TEMPLATE_LIBRARY.length >= 20, `at least 20 templates (${TEMPLATE_LIBRARY.length})`);
for (const id of ["one-bed-compact", "one-bed-standard", "two-bed-compact", "two-bed-standard", "two-bed-master", "three-bed-compact", "three-bed-family", "three-bed-master", "three-bed-narrow", "three-bed-courtyard", "four-bed-compact", "four-bed-family", "four-bed-master", "four-bed-courtyard", "narrow-plot", "wide-plot", "l-shaped", "u-shaped", "with-parking", "large-family"]) assert.ok(byId(id), `the library has ${id}`);
assert.equal(new Set(TEMPLATE_LIBRARY.map((item) => item.id)).size, TEMPLATE_LIBRARY.length, "ids are unique");

for (const template of TEMPLATE_LIBRARY) {
  const built = buildTemplate(template);
  const { plan } = built;
  assert.ok(roomSchema.safeParse(plan).success, `${template.id}: a valid plan`);
  const project = createHouseProject({ title: template.name, room: plan, style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 });
  assert.ok(houseProjectSchema.safeParse(project).success, `${template.id}: builds a valid project`);
  assert.equal(built.bedrooms, template.bedrooms, `${template.id}: has the bedrooms it says`);
  assert.ok(built.bathrooms >= 1, `${template.id}: a bathroom`);
  assert.ok((plan.interiorWalls ?? []).length >= 3 && plan.interiorWalls!.every((wall) => wall.thickness === 120), `${template.id}: inside walls, 120 thick`);
  assert.equal(plan.wallThickness, 200, `${template.id}: outside walls 200 thick`);
  assert.ok((plan.dimensions ?? []).some((item) => item.id === "overall-x") && plan.dimensions!.some((item) => item.id === "overall-y"), `${template.id}: overall dimensions`);
  // Every opening sits inside its wall, none on top of another.
  const walls = housePlanWalls(plan);
  for (const opening of plan.openings) {
    const wall = walls.find((item) => item.id === opening.wallId);
    assert.ok(wall, `${template.id}: ${opening.id} is in a wall`);
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    assert.ok(opening.offset >= 0 && opening.offset + opening.width <= length + 0.5, `${template.id}: ${opening.id} fits its wall`);
    for (const other of plan.openings) if (other !== opening && other.wallId === opening.wallId) assert.ok(opening.offset + opening.width <= other.offset || other.offset + other.width <= opening.offset, `${template.id}: ${opening.id} and ${other.id} do not overlap`);
  }
  // A way in, and every room reached from it through doors.
  const entrance = plan.openings.find((item) => item.id === "entrance");
  assert.ok(entrance && plan.corners.some((corner) => corner.id === entrance.wallId), `${template.id}: a front door in an outside wall`);
  const zones = plan.zones!;
  const zoneAt = (point: { x: number; y: number }) => zones.find((zone) => inside(point, zone.boundary));
  const links = new Map(zones.map((zone) => [zone.name, new Set<string>()]));
  let front: string | undefined;
  for (const opening of plan.openings.filter((item) => item.kind !== "window")) {
    const wall = walls.find((item) => item.id === opening.wallId)!;
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const t = (opening.offset + opening.width / 2) / length;
    const centre = { x: wall.start.x + (wall.end.x - wall.start.x) * t, y: wall.start.y + (wall.end.y - wall.start.y) * t };
    const normal = { x: -(wall.end.y - wall.start.y) / length, y: (wall.end.x - wall.start.x) / length };
    const a = zoneAt({ x: centre.x + normal.x * 200, y: centre.y + normal.y * 200 });
    const b = zoneAt({ x: centre.x - normal.x * 200, y: centre.y - normal.y * 200 });
    if (a && b) { links.get(a.name)!.add(b.name); links.get(b.name)!.add(a.name); }
    if (opening.id === "entrance") front = (a ?? b)?.name;
  }
  assert.ok(front, `${template.id}: the front door opens into a room`);
  const reached = new Set([front!]);
  const queue = [front!];
  while (queue.length) for (const next of links.get(queue.shift()!)!) if (!reached.has(next)) { reached.add(next); queue.push(next); }
  assert.deepEqual(zones.map((zone) => zone.name).filter((name) => !reached.has(name)), [], `${template.id}: every room can be walked to from the front door`);
  // ...and without walking through a bedroom or a bathroom to get there (an
  // en-suite is reached through its own bedroom).
  const typeOf = new Map(built.rooms.map((item) => [item.name, item.type]));
  const privateRoom = (name: string) => ["bedroom", "master", "bath", "toilet"].includes(typeOf.get(name)!);
  const walked = new Set([front!]);
  const open = [front!];
  while (open.length) {
    const at = open.shift()!;
    for (const next of links.get(at)!) {
      if (walked.has(next)) continue;
      walked.add(next);
      if (!privateRoom(next) || typeOf.get(next) === "master") open.push(next);
    }
  }
  assert.deepEqual(zones.map((zone) => zone.name).filter((name) => !walked.has(name)), [], `${template.id}: no room is reached only through a bedroom or bathroom`);
  // Windows in every bedroom and living room; nothing below what it needs.
  for (const item of built.rooms) {
    assert.ok(Math.min(item.width, item.depth) >= ROOM_MINIMUM[item.type], `${template.id}: ${item.name} is at least ${ROOM_MINIMUM[item.type]} across (${item.width} × ${item.depth})`);
    if (["bedroom", "master", "living"].includes(item.type)) {
      const zone = zones.find((entry) => entry.name === item.name)!;
      const lit = plan.openings.some((opening) => opening.kind === "window" && walls.some((wall) => wall.id === opening.wallId && onBoundary(wall, zone.boundary)));
      assert.ok(lit, `${template.id}: ${item.name} has a window`);
    }
  }
  for (const opening of plan.openings.filter((item) => item.kind === "door" && item.id !== "entrance" && !item.id.startsWith("garage"))) assert.ok(opening.width >= 700 && opening.width <= 1000, `${template.id}: ${opening.id} is a real door width`);
}
assert.equal(buildTemplate(byId("l-shaped")).plan.corners.length, 6, "the L-shaped house is an L");
assert.equal(buildTemplate(byId("u-shaped")).plan.corners.length, 8, "the U-shaped house is a U");
assert.ok(buildTemplate(byId("with-parking")).rooms.some((item) => item.type === "garage" && item.depth >= 5000), "the house with parking has a garage a car fits");

// ---------------------------------------------------------------------------
// The plot decides: 10 × 20 m puts the narrow plans first.
// ---------------------------------------------------------------------------
const narrow = plotOf(10000, 20000);
assert.deepEqual(usableArea(narrow), { width: 8400, length: 15500 });
const ranked = rankTemplates(narrow, { bedrooms: 3 });
assert.equal(ranked[0]!.status, "best", "the first plan fits");
assert.ok(ranked[0]!.built.width <= 8400, "and is no wider than the plot allows");
assert.equal(ranked[0]!.built.template.id, "three-bed-family", "a 3-bedroom family house, 8.2 m wide, first");
assert.deepEqual([ranked[0]!.built.width, ranked[0]!.built.length, ranked[0]!.built.area], [8200, 12400, 101.68]);
assert.deepEqual(ranked[0]!.minimumPlot, { width: 10000, length: 17000 }, "recommended plot 10 × 17 m+");
const wide = fitTemplate(byId("wide-plot"), narrow);
assert.notEqual(wide.status, "best", "a 15 m-wide house is not a best fit for a 10 m plot");
assert.ok(ranked.findIndex((item) => item.built.template.id === "wide-plot") > ranked.filter((item) => item.status === "best").length - 1, "and comes after every plan that fits");
const order = { best: 0, adjust: 1, none: 2 } as const;
assert.ok(ranked.every((item, index) => index === 0 || order[ranked[index - 1]!.status] <= order[item.status]), "best fit, then adjusted, then the rest");
assert.ok(rankTemplates(narrow, { bedrooms: 3 }).filter((item) => item.status === "best").every((item) => item.built.width <= 8400 || item.rotated), "every best fit really fits");

// Turned a quarter: a long, narrow house fits a wide, shallow plot.
const shallow = plotOf(18000, 12000);
const turned = fitTemplate(byId("three-bed-narrow"), shallow);
assert.deepEqual([turned.status, turned.rotated], ["best", true], "a plan that fits only turned 90° is found turned");

// ---------------------------------------------------------------------------
// Adjust to my plot: the geometry changes, not the scale.
// ---------------------------------------------------------------------------
const tight = plotOf(9600, 20000); // 8.0 m to build on; the house is 8.2 m
const family = byId("three-bed-family");
const before = buildTemplate(family);
const fit = fitTemplate(family, tight);
assert.equal(fit.status, "adjust", "8.2 m into 8.0 m: can be adjusted");
const after = fit.adjusted!;
assert.ok(after.width <= 8000, `narrowed to fit (${after.width})`);
assert.ok(after.length > before.length, "and longer, to give some area back");
assert.ok(after.length <= usableArea(tight).length, "within the plot");
const widthOf = (built: typeof before, name: string) => built.rooms.find((item) => item.name === name)!;
assert.equal(widthOf(after, "Corridor").depth, widthOf(before, "Corridor").depth, "the corridor keeps its width");
const ratios = after.rooms.map((item) => item.width / widthOf(before, item.name).width);
assert.ok(Math.max(...ratios) - Math.min(...ratios) > 0.01, "rooms change by different amounts: not a scale");
for (const item of after.rooms) assert.ok(Math.min(item.width, item.depth) >= ROOM_MINIMUM[item.type], `${item.name} still usable`);
const doorWidths = (built: typeof before) => built.plan.openings.filter((item) => item.kind !== "window").map((item) => item.width).sort();
assert.deepEqual(doorWidths(after), doorWidths(before), "doors keep their sizes");
assert.ok(after.plan.openings.filter((item) => item.kind === "window").every((item) => item.width <= 2000), "windows are not stretched");
const gridBefore = templateGrid(family);
assert.equal(gridBefore.columns.reduce((a, b) => a + b, 0), 8000);
assert.equal(adjustTemplate(family, { width: 6000, length: 20000 }), null, "not into a plot that would make rooms too small");
const roomier = adjustTemplate(family, { width: 12000, length: 20000 })!;
assert.ok(roomier.width > before.width && roomier.length > before.length, "on a roomier plot the rooms grow a little");
assert.equal(widthOf(roomier, "Corridor").depth, 1200, "but the corridor stays a corridor");
assert.equal(fitTemplate(byId("large-family"), plotOf(8000, 12000)).status, "none");

// ---------------------------------------------------------------------------
// Facing the road: the front door ends up on the road side.
// ---------------------------------------------------------------------------
const frontWall = (plan: typeof before.plan) => {
  const entrance = plan.openings.find((item) => item.id === "entrance")!;
  const index = plan.corners.findIndex((corner) => corner.id === entrance.wallId);
  const [a, b] = [plan.corners[index]!, plan.corners[(index + 1) % plan.corners.length]!];
  const xs = plan.corners.map((corner) => corner.x);
  const ys = plan.corners.map((corner) => corner.y);
  if (a.y === b.y && a.y === Math.max(...ys)) return "south";
  if (a.y === b.y && a.y === Math.min(...ys)) return "north";
  if (a.x === b.x && a.x === Math.max(...xs)) return "east";
  if (a.x === b.x && a.x === Math.min(...xs)) return "west";
  return "?";
};
for (const road of ["south", "north", "east", "west"] as const) {
  const faced = facePlan(before.plan, road, false);
  assert.ok(roomSchema.safeParse(faced).success);
  assert.equal(frontWall(faced), road, `road to the ${road}: the front door faces it`);
  assert.ok(faced.corners.every((corner) => corner.x >= 0 && corner.y >= 0), "and the plan stays on the drawing");
}
assert.notEqual(frontWall(facePlan(before.plan, "south", true)), "south", "turned 90° on the plot, the front faces a side");

console.log(`House template library: ${TEMPLATE_LIBRARY.length} real plans — walls, rooms, doors, windows, dimensions; ranked against the plot, turned 90° when that fits, adjusted by geometry not scale, faced to the road`);

function inside(point: { x: number; y: number }, polygon: readonly { x: number; y: number }[]) {
  let result = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
function onBoundary(wall: { start: { x: number; y: number }; end: { x: number; y: number } }, polygon: readonly { x: number; y: number }[]) {
  return polygon.some((a, index) => {
    const b = polygon[(index + 1) % polygon.length]!;
    const colinear = (p: { x: number; y: number }) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) < 1;
    if (!colinear(wall.start) || !colinear(wall.end)) return false;
    const horizontal = a.y === b.y;
    const [lo, hi] = horizontal ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    const [s, e] = horizontal ? [Math.min(wall.start.x, wall.end.x), Math.max(wall.start.x, wall.end.x)] : [Math.min(wall.start.y, wall.end.y), Math.max(wall.start.y, wall.end.y)];
    return s < hi && e > lo;
  });
}
