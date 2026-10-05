/**
 * The architectural object library: furniture, stairs, doors, windows and
 * columns as one shared model for the plan and the 3D view.
 *
 *   npx tsx scripts/house_objects_check.ts
 */
import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { createHouseObjectFromGesture, roomOutline } from "../src/features/house-designer/services/model-commands";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { definitionOf, DOOR_TYPES, OBJECT_CATEGORIES, OBJECT_LIBRARY, objectDefinition, placeAgainstWall, searchObjects, WINDOW_TYPES } from "../src/features/house-designer/services/object-library";
import { establishLevelOutline, openSpace, patchHouseObject } from "../src/features/house-designer/services/project-edit";
import { applyStairEdit, fitStairs, risersFor, stairFields, stairGeometry, stairParams, stairPreset, STAIR_TYPES, stairWarnings } from "../src/features/house-designer/services/stair-geometry";
import { applyModelingOptions, modelingPreset } from "../src/features/house-designer/services/workspace-options";
import { createHouseProject, houseProjectSchema, type HouseProject } from "../src/features/house-designer/types/project";

// ---------------------------------------------------------------------------
// The library: every object the brief lists, by category, each drawable and buildable.
// ---------------------------------------------------------------------------
const wanted: Record<string, string[]> = {
  living: ["chair-1", "sofa-2", "sofa-3", "sofa-l", "sofa-u", "coffee-table", "side-table", "tv-unit"],
  bedroom: ["single-bed", "double-bed", "queen-bed", "king-bed", "bedside", "wardrobe", "dresser"],
  dining: ["dining-2", "dining-4", "dining-6", "dining-8", "dining-round"],
  kitchen: ["base-cabinet", "wall-cabinet", "sink", "double-sink", "fridge", "stove", "oven", "dishwasher", "island"],
  bathroom: ["toilet", "basin", "double-basin", "shower", "bathtub"],
  office: ["desk", "office-chair", "meeting-table"],
  other: ["washer", "storage-cabinet", "bench", "car"],
};
for (const [category, ids] of Object.entries(wanted)) for (const id of ids) assert.equal(objectDefinition(id)?.category, category, `${id} is in ${category}`);
assert.equal(new Set(OBJECT_LIBRARY.map((item) => item.id)).size, OBJECT_LIBRARY.length, "ids are unique");
assert.ok(OBJECT_CATEGORIES.every((category) => OBJECT_LIBRARY.some((item) => item.category === category.id)), "every category has objects");
assert.ok(OBJECT_LIBRARY.every((item) => item.width > 0 && item.depth > 0 && item.height > 0 && item.symbol && item.model), "every object has a size, a plan symbol and a 3D model");
assert.deepEqual([objectDefinition("double-bed")!.width, objectDefinition("double-bed")!.depth], [1400, 2000]);
assert.equal(objectDefinition("dining-6")!.count, 6, "a 6-seat table draws six chairs");
assert.equal(objectDefinition("wall-cabinet")!.elevation, 1450, "a wall cabinet hangs");
assert.deepEqual(searchObjects("sofa").map((item) => item.id), ["sofa-2", "sofa-3", "sofa-l", "sofa-u"], "search by name");
assert.ok(searchObjects("bathroom").some((item) => item.id === "toilet"), "or by category");
assert.equal(definitionOf({ family: "Bed", name: "Bed" }).id, "queen-bed", "a bed placed before the library still draws as a bed");
assert.equal(definitionOf({ family: "Generic Model", name: "Generic Component" }).symbol, "generic");
assert.equal(DOOR_TYPES.length, 7);
assert.equal(WINDOW_TYPES.length, 7);

// ---------------------------------------------------------------------------
// Stairs: real geometry, recalculated from their parameters.
// ---------------------------------------------------------------------------
assert.equal(STAIR_TYPES.length, 10, "ten stair types");
const straight = stairPreset("straight", 3000);
assert.deepEqual([straight.risers, straight.treadDepth, straight.stairWidth], [18, 280, 1000], "3000 mm: 18 risers, 280 treads, a metre wide");
const flight = stairGeometry(straight);
assert.equal(flight.treads, 17, "one tread fewer than risers");
assert.equal(Math.round(flight.riserHeight * 10) / 10, 166.7, "risers of 166.7 mm");
assert.deepEqual([flight.width, flight.length], [1000, 4760], "17 treads of 280");
assert.deepEqual(flight.pieces.map((piece) => piece.level), Array.from({ length: 17 }, (_, index) => index + 1), "each tread a riser above the last");
for (const type of STAIR_TYPES) {
  const geometry = stairGeometry(stairPreset(type.id, 3000));
  const climbing = geometry.pieces.filter((piece) => piece.level > 0);
  assert.equal(climbing.length, 17, `${type.id}: 17 steps up, landings and winders counted`);
  assert.deepEqual(climbing.map((piece) => piece.level).sort((a, b) => a - b), Array.from({ length: 17 }, (_, index) => index + 1), `${type.id}: one step at each height`);
  assert.ok(geometry.pieces.every((piece) => piece.points.length >= 3 && piece.points.every((point) => Math.abs(point.x) <= geometry.width / 2 + 1 && Math.abs(point.y) <= geometry.length / 2 + 1)), `${type.id}: every tread inside the footprint`);
  assert.ok(geometry.walk.length >= 2, `${type.id}: a walking line for the arrow`);
}
const ell = stairGeometry(stairPreset("l-shaped", 3000));
assert.equal(ell.pieces.filter((piece) => piece.landing).length, 1, "an L stair has a landing");
assert.deepEqual([ell.width, ell.length], [3240, 3240], "8 + landing + 8: 3240 × 3240");
const u = stairGeometry(stairPreset("u-shaped", 3000));
assert.deepEqual([u.width, u.length], [2100, 3240], "a U stair: two flights side by side");
const winder = stairGeometry(stairPreset("l-winder", 3000));
const area = (points: { x: number; y: number }[]) => Math.abs(points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]!; return sum + point.x * next.y - next.x * point.y; }, 0) / 2);
// 14 flight treads, 7 then 7: the three after the first seven are the winders.
const cornerArea = winder.pieces.slice(7, 10).reduce((sum, piece) => sum + area(piece.points), 0);
assert.ok(Math.abs(cornerArea - 1000 * 1000) < 2000, `three winders fill the corner square (${Math.round(cornerArea)})`);

// Reversed: the same treads, climbed from the other end.
const reversed = stairGeometry({ ...straight, reversed: true });
assert.equal(reversed.pieces[0]!.level, 17, "reversed, the first tread is the top one");
assert.deepEqual(reversed.walk, [...flight.walk].reverse(), "and the arrow runs the other way");

// One parameter changes, what follows from it is worked out again.
assert.equal(applyStairEdit(straight, { height: 3300 }).risers, risersFor(3300), "a new floor height re-counts the risers");
assert.equal(applyStairEdit(straight, { height: 3300 }).risers, 19);
assert.equal(applyStairEdit(straight, { riserHeight: 150 }).risers, 20, "a riser height gives the count");
assert.equal(applyStairEdit(straight, { treads: 15 }).risers, 16, "so does a number of treads");
assert.equal(stairGeometry(applyStairEdit(straight, { length: 4250 })).length, 4250, "a total length re-works the tread");
assert.equal(applyStairEdit(stairPreset("u-shaped", 3000), { width: 2500 }).stairWidth, 1200, "a total width re-works the flights");
assert.equal(applyStairEdit(straight, { reversed: "toggle" }).reversed, true, "Reverse direction");
assert.ok(stairWarnings({ ...straight, risers: 14 }).some((warning) => /steep/.test(warning)), "a steep stair is flagged");
assert.deepEqual(stairWarnings(straight), [], "a comfortable one is not");

// Auto fit: what fits the space, and nothing that does not.
const fits = fitStairs({ width: 2800, length: 4500 }, 3000);
const types = fits.map((fit) => fit.params.type);
for (const type of ["straight", "l-shaped", "u-shaped"] as const) assert.ok(types.includes(type), `2800 × 4500 for 3000 mm: a ${type} stair fits`);
for (const fit of fits) assert.ok(fit.rotated ? fit.length <= 2800 && fit.width <= 4500 : fit.width <= 2800 && fit.length <= 4500, `${fit.params.type} really fits`);
assert.equal(fits.find((fit) => fit.params.type === "straight")!.length <= 4500, true);
assert.deepEqual(fitStairs({ width: 1500, length: 1500 }, 3000), [], "no stair is forced into a space it cannot fit");

// ---------------------------------------------------------------------------
// Placing and editing on a real plan.
// ---------------------------------------------------------------------------
const base = openSpace(ensureHouseBimState(applyModelingOptions(createHouseProject({ title: "Objects", room: { ...rectangularRoom(8000, 6000), ceilingHeight: 2800 }, style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }), modelingPreset("house"))));
const ground = base.levels[0]!.id;
let project: HouseProject = establishLevelOutline(base, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 8000, y: 6000 }))!;

// A bed put down near the top wall turns its head to it and stands against its face.
const near = placeAgainstWall(project, ground, { x: 3000, y: 1300 }, { width: 1400, depth: 2000 });
assert.deepEqual(near, { x: 3000, y: 1075, rotation: 0, wallId: near.wallId }, "against the top wall (150 thick), facing into the room");
assert.ok(near.wallId);
const right = placeAgainstWall(project, ground, { x: 7000, y: 3000 }, { width: 1400, depth: 2000 });
assert.deepEqual([right.x, right.y, right.rotation], [6925, 3000, 90], "against the right wall, turned to face away from it");
assert.equal(placeAgainstWall(project, ground, { x: 4000, y: 3000 }, { width: 1400, depth: 2000 }).wallId, null, "in the middle of the room, it stays where it was put");

let step = createHouseObjectFromGesture(project, "furniture", ground, { x: near.x, y: near.y }, undefined, { width: 1400, depth: 2000, height: 500, family: "double-bed", rotation: near.rotation });
project = step.project;
const bed = project.components.at(-1)!;
assert.deepEqual([bed.family, bed.name, bed.width, bed.depth, bed.x, bed.y, bed.rotation], ["double-bed", "Double bed", 1400, 2000, 3000, 1075, 0], "one record: what it is, where, which way");
project = patchHouseObject(project, step.selections[0]!, { width: 1600, rotation: 90, x: 3500 });
assert.deepEqual([project.components.at(-1)!.width, project.components.at(-1)!.rotation, project.components.at(-1)!.x], [1600, 90, 3500], "typed width, rotation and position");
project = createHouseObjectFromGesture(project, "furniture", ground, { x: 1000, y: 3000 }, undefined, { width: 600, depth: 350, height: 700, family: "wall-cabinet" }).project;
assert.equal(project.components.at(-1)!.elevation, 1450, "a wall cabinet is placed at its height");

// Stairs.
step = createHouseObjectFromGesture(project, "stair", ground, { x: 5000, y: 3000 }, undefined, { stair: stairPreset("u-shaped", 3000), rotation: 90 });
project = step.project;
const stair = project.stairs.at(-1)!;
assert.deepEqual([stair.type, stair.steps, stair.width, stair.length, stair.rotation], ["u-shaped", 18, 2100, 3240, 90], "a U stair from its parameters");
project = patchHouseObject(project, step.selections[0]!, { height: 3300 });
assert.deepEqual([project.stairs.at(-1)!.steps, project.stairs.at(-1)!.height], [19, 3300], "floor height up: a riser more");
project = patchHouseObject(project, step.selections[0]!, { reversed: "toggle" });
assert.equal(project.stairs.at(-1)!.reversed, true, "reversed");
project = patchHouseObject(project, step.selections[0]!, { type: "straight" });
assert.deepEqual([project.stairs.at(-1)!.width, project.stairs.at(-1)!.length], [1000, 18 * 280], "a type change re-lays the stair");
assert.equal(stairParams({ ...project.stairs.at(-1)!, stairWidth: undefined, treadDepth: undefined, reversed: undefined, landing: undefined, gap: undefined }).stairWidth, 1000, "a stair saved without parameters reads them off its size");

// Doors and windows: a type, a swing that stays, a position along the wall.
const topWall = project.walls.find((wall) => wall.levelId === ground && wall.start.y === 0 && wall.end.y === 0)!;
step = createHouseObjectFromGesture(project, "door", ground, { x: 2000, y: 0 }, undefined, { width: 1800, style: "double-sliding" });
project = step.project;
const door = project.doors.at(-1)!;
assert.deepEqual([door.style, door.wallId, door.width], ["double-sliding", topWall.id, 1800], "a double sliding door in the wall tapped");
assert.equal(createHouseObjectFromGesture(project, "door", ground, { x: 6000, y: 0 }).project.doors.at(-1)!.style, "single", "a door with no type chosen is single hinged");
project = patchHouseObject(project, step.selections[0]!, { swing: "out-left" });
project = patchHouseObject(project, step.selections[0]!, { width: 1600 });
const kept = project.doors.find((item) => item.sourceOpeningId === door.sourceOpeningId)!;
assert.deepEqual([kept.swing, kept.style, kept.width], ["out-left", "double-sliding", 1600], "the swing and the type survive the plan being rebuilt");
step = createHouseObjectFromGesture(project, "window", ground, { x: 6000, y: 6000 }, undefined, { width: 1500, height: 1200, sillHeight: 900, style: "sliding" });
project = patchHouseObject(step.project, step.selections[0]!, { offset: 500, sillHeight: 1000, style: "awning" });
const window = project.windows.find((item) => item.id === step.selections[0]!.id) ?? project.windows.at(-1)!;
assert.deepEqual([window.offset, window.sillHeight, window.style], [500, 1000, "awning"], "a window's position, sill and type");

// Columns: shapes, sizes, turned.
step = createHouseObjectFromGesture(project, "column", ground, { x: 4000, y: 3000 }, undefined, { width: 400, depth: 250, columnType: "circular" });
project = step.project;
assert.deepEqual([project.structuralColumns.at(-1)!.type, project.structuralColumns.at(-1)!.depth], ["circular", 400], "a round column is as deep as it is wide");
project = patchHouseObject(project, step.selections[0]!, { type: "rectangular", width: 300, depth: 400, rotation: 30 });
assert.deepEqual([project.structuralColumns.at(-1)!.type, project.structuralColumns.at(-1)!.width, project.structuralColumns.at(-1)!.depth, project.structuralColumns.at(-1)!.rotation], ["rectangular", 300, 400, 30]);

// Saved and opened again: every object as it was.
const reopened = houseProjectSchema.parse(JSON.parse(JSON.stringify(project)));
assert.deepEqual(reopened.components, project.components, "furniture survives saving");
assert.deepEqual(reopened.stairs, project.stairs, "stairs with their parameters");
assert.deepEqual(reopened.structuralColumns, project.structuralColumns, "columns with their shape and rotation");
assert.deepEqual(reopened.doors.map((item) => [item.style, item.swing]), project.doors.map((item) => [item.style, item.swing]), "doors with their type and swing");
const legacy = houseProjectSchema.parse(JSON.parse(JSON.stringify({ ...project, stairs: [{ ...stair, type: "straight", stairWidth: undefined, treadDepth: undefined, landing: undefined, gap: undefined, reversed: undefined }] })));
assert.equal(legacy.stairs[0]!.type, "straight", "a stair saved before the parameters still opens");
assert.ok(stairFields(stairParams(legacy.stairs[0]!)).width > 0);

console.log(`House objects: ${OBJECT_LIBRARY.length} library objects in ${OBJECT_CATEGORIES.length} categories, ${STAIR_TYPES.length} stair types with recalculation, reverse and auto fit, ${DOOR_TYPES.length} door and ${WINDOW_TYPES.length} window types, column shapes; placed against walls, edited by number, saved and reopened`);
