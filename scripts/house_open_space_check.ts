import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { createHouseObjectFromGesture, createRoomFromGesture, lockConflict, moveHouseSelections, pinHouseSelections, roomOutline } from "../src/features/house-designer/services/model-commands";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { addHouseFloor, establishLevelOutline, mergeRooms, openSpace, patchHouseObject, splitRoomAlong } from "../src/features/house-designer/services/project-edit";
import { generateStructureFromGrid, hasGeneratedStructure, withoutStructure } from "../src/features/house-designer/services/structure";
import { PLAN_TEMPLATES } from "../src/features/house-designer/services/plan-templates";
import { pitchedRise, roofRectangles } from "../src/features/house-designer/components/house-preview";
import { applyModelingOptions, modelingPreset } from "../src/features/house-designer/services/workspace-options";
import { createHouseProject, houseProjectSchema } from "../src/features/house-designer/types/project";

const make = (floorCount = 1) => ensureHouseBimState(applyModelingOptions(createHouseProject({ title: "Open", room: { ...rectangularRoom(8000, 6500), ceilingHeight: 3000 }, style: "modern", strict: false, floorCount, floorToFloorHeight: 3000 }), modelingPreset("house")));
const reference = make();
const empty = openSpace(reference);
const ground = empty.levels[0]!.id;

// ---------------------------------------------------------------------------
// Open space is empty and valid.
// ---------------------------------------------------------------------------
assert.ok(houseProjectSchema.safeParse(empty).success, "open space is a valid project");
assert.ok(empty.levels.every((level) => level.plan === null), "no floor has an outline");
for (const key of ["walls", "doors", "windows", "rooms", "slabs", "roofs", "ceilings", "stairs", "structuralColumns", "structuralBeams", "structuralGrid", "foundations", "facadeElements"] as const) {
  assert.equal(empty[key].length, 0, `nothing on the space: ${key}`);
}
assert.equal(empty.site, null);
assert.equal(createHouseObjectFromGesture(empty, "door", ground, { x: 1000, y: 0 }).project, empty, "a door needs a wall to go in");

const stacked = addHouseFloor(empty);
assert.ok(stacked.levelId, "an empty floor can have another put on it");
assert.equal(stacked.project.levels.at(-1)!.plan, null, "which is empty too");
assert.equal(stacked.project.walls.length + stacked.project.slabs.length + stacked.project.roofs.length + stacked.project.stairs.length, 0, "and nothing appears");
assert.ok(houseProjectSchema.safeParse(stacked.project).success);

// ---------------------------------------------------------------------------
// The first closed shape becomes the house — the same house the builder
// makes from that outline.
// ---------------------------------------------------------------------------
const drawn = establishLevelOutline(empty, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 8000, y: 6500 }))!;
assert.ok(drawn, "a rectangle on an empty floor becomes its outline");
assert.ok(houseProjectSchema.safeParse(drawn).success, "and a valid project");
const on = <T extends { levelId: string }>(items: readonly T[]) => items.filter((item) => item.levelId === ground);
const shape = (walls: typeof reference.walls) => walls.map((wall) => [wall.start.x, wall.start.y, wall.end.x, wall.end.y, wall.thickness, wall.height]).sort();
assert.deepEqual(shape(on(drawn.walls)), shape(on(reference.walls)), "its walls are the builder's walls");
for (const key of ["rooms", "slabs", "roofs"] as const) {
  assert.equal(drawn[key].length, reference[key].length, `and as many ${key}`);
}
for (const key of ["structuralColumns", "structuralBeams", "structuralGrid", "foundations"] as const) {
  assert.equal(drawn[key].length, 0, `but no ${key} while the plan is being drawn`);
}
assert.ok(drawn.facadeElements.length > 0, "dressed in the project's style");
assert.equal(establishLevelOutline(drawn, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 3000, y: 3000 })), null, "a floor is outlined once; after that a room is a room");
assert.equal(establishLevelOutline(empty, ground, [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 8000, y: 0 }]), null, "a straight line is not a shape");
assert.equal(establishLevelOutline(empty, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 300, y: 300 })), null, "nor is a sliver");

const ell = establishLevelOutline(empty, ground, roomOutline("l-shape", { x: 0, y: 0 }, { x: 8000, y: 6000 }))!;
assert.equal(on(ell.walls).length, 6, "an L-shaped outline has six walls");

// ---------------------------------------------------------------------------
// The project's setup still decides what is built.
// ---------------------------------------------------------------------------
const flat = openSpace(applyModelingOptions(reference, modelingPreset("apartment")));
const apartment = establishLevelOutline(flat, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 8000, y: 6500 }))!;
assert.equal(apartment.structuralColumns.length + apartment.structuralBeams.length + apartment.foundations.length, 0, "an apartment gets no structure");
assert.equal(apartment.roofs.length, 0, "nor a roof");
assert.equal(on(apartment.walls).length, 4, "but its walls");

// A two-storey house is roofed on top, wherever the outlines are drawn first.
const tall = openSpace(make(2));
const [lower, upper] = tall.levels;
const lowerDrawn = establishLevelOutline(tall, lower!.id, roomOutline("rectangle", { x: 0, y: 0 }, { x: 8000, y: 6500 }))!;
assert.equal(lowerDrawn.roofs.length, 0, "the ground floor of two is not roofed");
const bothDrawn = establishLevelOutline(lowerDrawn, upper!.id, roomOutline("rectangle", { x: 0, y: 0 }, { x: 8000, y: 6500 }))!;
assert.equal(bothDrawn.roofs.length, 1);
assert.equal(bothDrawn.roofs[0]!.levelId, upper!.id, "the floor on top is");
const bothFinished = generateStructureFromGrid(bothDrawn);
assert.ok(bothFinished.structuralColumns.some((item) => item.levelId === upper!.id), "both floors get columns when the plan is finished");
assert.ok(bothFinished.foundations.length > 0 && bothFinished.foundations.every((item) => item.levelId === lower!.id), "footings only under the ground floor");

// ---------------------------------------------------------------------------
// From there it is an ordinary house.
// ---------------------------------------------------------------------------
const room = createRoomFromGesture(drawn, ground, { x: 0, y: 0 }, { x: 3000, y: 3000 }, "rectangle", { wallThickness: 120 });
assert.equal(on(room.project.walls).length, 6, "a room drawn in its corner adds two walls");
const door = createHouseObjectFromGesture(drawn, "door", ground, { x: 4000, y: 0 });
assert.equal(door.project.doors.length, 1, "doors go in its walls");
const top = on(drawn.walls).find((wall) => wall.start.y === 0 && wall.end.y === 0)!;
const moved = moveHouseSelections(drawn, [{ kind: "wall", id: top.id }], 0, -500, { footprintEditable: true });
assert.deepEqual(moved.blocked, [], "and its walls move");

// ---------------------------------------------------------------------------
// Split, move, merge — on a house drawn from blank.
// ---------------------------------------------------------------------------
{
  const boxes = (value: typeof drawn) => value.rooms.filter((item) => item.levelId === ground).map((item) => { const xs = item.boundary.map((point) => point.x); const ys = item.boundary.map((point) => point.y); return `${Math.min(...xs)}..${Math.max(...xs)} x ${Math.min(...ys)}..${Math.max(...ys)}`; }).sort();
  const wall = (value: typeof drawn, start: { x: number; y: number }, end: { x: number; y: number }) => {
    const created = createHouseObjectFromGesture(value, "wall", ground, start, end, { wallThickness: 120 });
    return { project: splitRoomAlong(created.project, ground, start, end), id: created.selections[0]!.id };
  };
  const across = wall(drawn, { x: 3000, y: 0 }, { x: 3000, y: 6500 });
  assert.deepEqual(boxes(across.project), ["0..3000 x 0..6500", "3000..8000 x 0..6500"], "a wall right across a room splits it");
  assert.deepEqual(boxes(splitRoomAlong(drawn, ground, { x: 3000, y: 1000 }, { x: 3000, y: 4000 })), ["0..8000 x 0..6500"], "a wall that stops short does not");
  const tee = wall(across.project, { x: 3000, y: 3000 }, { x: 8000, y: 3000 });
  assert.deepEqual(boxes(tee.project), ["0..3000 x 0..6500", "3000..8000 x 0..3000", "3000..8000 x 3000..6500"], "and a wall between two walls splits again");

  const moved = moveHouseSelections(tee.project, [{ kind: "wall", id: across.id }], 1000, 0).project;
  const find = (value: typeof drawn, id: string) => value.walls.find((item) => item.id === id)!;
  assert.deepEqual([find(moved, across.id).start, find(moved, across.id).end], [{ x: 4000, y: 0 }, { x: 4000, y: 6500 }], "an inside wall moves");
  assert.deepEqual([find(moved, tee.id).start, find(moved, tee.id).end], [{ x: 4000, y: 3000 }, { x: 8000, y: 3000 }], "the wall that meets it follows");
  assert.deepEqual(boxes(moved), ["0..4000 x 0..6500", "4000..8000 x 0..3000", "4000..8000 x 3000..6500"], "and the rooms it bounds");
  assert.deepEqual(moved.levels[0]!.plan!.corners, tee.project.levels[0]!.plan!.corners, "the outside corners stay where they were");

  // An outside wall carries what is joined to it too.
  const topWall = tee.project.walls.find((item) => item.levelId === ground && item.start.y === 0 && item.end.y === 0 && item.sourceWallId === "c1")!;
  const raised = moveHouseSelections(tee.project, [{ kind: "wall", id: topWall.id }], 0, -500, { footprintEditable: true }).project;
  assert.deepEqual(find(raised, across.id).start, { x: 3000, y: -500 }, "moving an outside wall carries the inside wall joined to it");
  assert.deepEqual(boxes(raised), ["0..3000 x -500..6500", "3000..8000 x -500..3000", "3000..8000 x 3000..6500"], "and the rooms along it");
  const longer = patchHouseObject(tee.project, { kind: "wall", id: topWall.id }, { length: 9000 });
  assert.deepEqual(find(longer, across.id).start, { x: 3000, y: 0 }, "lengthening a wall leaves a joined wall where it was measured from");

  // A lock holds for walls joined in a T as well as at corners.
  const lockedInside = pinHouseSelections(tee.project, [{ kind: "wall", id: across.id }], true);
  assert.ok(lockConflict(lockedInside, { kind: "wall", id: topWall.id }), "an outside wall cannot drag a locked inside wall");
  assert.equal(moveHouseSelections(lockedInside, [{ kind: "wall", id: topWall.id }], 0, -500, { footprintEditable: true }).blocked.length, 1);
  const lockedTee = pinHouseSelections(tee.project, [{ kind: "wall", id: tee.id }], true);
  assert.equal(moveHouseSelections(lockedTee, [{ kind: "wall", id: across.id }], 1000, 0).blocked.length, 1, "nor an inside wall a locked wall meeting it");
  assert.equal(lockConflict(lockedTee, { kind: "wall", id: topWall.id }), null, "but a wall the locked one does not touch is free");

  const right = moved.rooms.filter((item) => item.levelId === ground && item.boundary.some((point) => point.x === 8000));
  const merged = mergeRooms(moved, right[0]!.id, right[1]!.id);
  assert.equal(merged.blocked, null);
  assert.deepEqual(boxes(merged.project), ["0..4000 x 0..6500", "4000..8000 x 0..6500"], "two rooms sharing a wall merge into one");
  assert.ok(!merged.project.walls.some((item) => item.id === tee.id), "and the wall between them goes");
  assert.ok(houseProjectSchema.safeParse(merged.project).success);
  const left = merged.project.rooms.find((item) => item.boundary.some((point) => point.x === 0))!;
  assert.equal(mergeRooms(merged.project, left.id, left.id).blocked !== null, true, "a room cannot merge with itself");
  const apart = establishLevelOutline(empty, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 8000, y: 6500 }))!;
  const twoApart = createRoomFromGesture(apart, ground, { x: 500, y: 500 }, { x: 2500, y: 2500 }, "rectangle").project;
  const islands = twoApart.rooms.filter((item) => item.levelId === ground);
  assert.match(mergeRooms(twoApart, islands.at(-1)!.id, islands[0]!.id).blocked ?? "", /share a wall/, "rooms that do not touch are not merged");

  // A wall shared by several rooms loses only the stretch between the two
  // merged, and a door on the rest of it stays, re-measured from the piece.
  const template = PLAN_TEMPLATES.find((item) => item.id === "two-bedroom")!;
  const house = createHouseProject({ title: "T", room: template.build(), style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 });
  const level = house.levels[0]!.id;
  const room = (name: string) => house.rooms.find((item) => item.name === name)!.id;
  const opened = mergeRooms(house, room("Bedroom 1"), room("Living and kitchen"));
  assert.equal(opened.blocked, null);
  const plan = opened.project.levels[0]!.plan!;
  const hall = plan.interiorWalls!.filter((item) => item.id.startsWith("hall"));
  assert.deepEqual(hall.map((item) => [item.start, item.end]), [[{ x: 5000, y: 4500 }, { x: 10000, y: 4500 }]], "the hall wall keeps the stretch outside the merge");
  assert.ok(!plan.openings.some((item) => item.id === "bedroom-1-door"), "the door into the merged room goes with its stretch of wall");
  const kept = plan.openings.find((item) => item.id === "bedroom-2-door");
  assert.ok(kept, "the door on the rest of the wall is kept");
  assert.deepEqual([kept.wallId, kept.offset], [hall[0]!.id, 500], "the next room's door stays, measured from its piece");
  assert.ok(opened.project.doors.some((item) => item.sourceOpeningId === "bedroom-2-door" && item.levelId === level), "and is still a door in the model");
  assert.equal(opened.project.rooms.find((item) => item.name === "Bedroom 1")!.boundary.length, 6, "the merged room is L-shaped");
}

// ---------------------------------------------------------------------------
// Pitched roofs: the slope sets the rise; parapets are for flat roofs.
// ---------------------------------------------------------------------------
{
  const roof = drawn.roofs[0]!;
  assert.ok(Math.abs(pitchedRise({ slope: 25, height: 300 }, 8800, 7300) - Math.tan((25 * Math.PI) / 180) * 3650) < 0.001, "rise = tan(slope) x half the shorter span");
  assert.equal(pitchedRise({ slope: 0, height: 420 }, 8800, 7300), 420, "a roof with no slope keeps its stated height");
  // Roof shapes follow the outline: an L is two overlapping rectangles.
  assert.deepEqual(roofRectangles(roomOutline("rectangle", { x: 0, y: 0 }, { x: 8000, y: 6500 })), [{ minX: 0, maxX: 8000, minY: 0, maxY: 6500 }], "a rectangle is one roof");
  const ell = roofRectangles(roomOutline("l-shape", { x: 0, y: 0 }, { x: 8000, y: 6000 }))!;
  assert.equal(ell.length, 2, "an L is roofed as two rectangles");
  const covers = (x: number, y: number) => ell.some((part) => x >= part.minX && x <= part.maxX && y >= part.minY && y <= part.maxY);
  assert.ok(covers(500, 500) && covers(7500, 1000) && covers(500, 5500), "that cover all of it");
  assert.ok(!covers(7000, 5000), "and nothing outside it");
  assert.equal(roofRectangles([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 2000, y: 3000 }]), null, "an outline with an angled wall falls back to its bounding rectangle");

  const parapets = (value: typeof drawn) => value.facadeElements.filter((item) => item.type === "parapet").length;
  assert.ok(parapets(drawn) > 0, "a flat roof is edged by a parapet");
  const gable = patchHouseObject(drawn, { kind: "roof", id: roof.id }, { type: "gable", slope: 25 });
  assert.equal(parapets(gable), 0, "a pitched one is not hidden behind one");
  const top = gable.walls.find((item) => item.levelId === ground && item.start.y === 0 && item.end.y === 0)!;
  assert.equal(parapets(moveHouseSelections(gable, [{ kind: "wall", id: top.id }], 0, -500, { footprintEditable: true }).project), 0, "nor after the plan is edited");
  assert.ok(parapets(patchHouseObject(gable, { kind: "roof", id: roof.id }, { type: "flat", slope: 0 })) > 0, "and flat again brings it back");
}

// ---------------------------------------------------------------------------
// Structure is never generated automatically. The grid-based generator is
// kept for later development and checked here as a library function.
// ---------------------------------------------------------------------------
{
  let plan = createRoomFromGesture(drawn, ground, { x: 0, y: 0 }, { x: 3000, y: 3000 }, "rectangle", { wallThickness: 120 }).project;
  plan = createHouseObjectFromGesture(plan, "door", ground, { x: 6000, y: 0 }).project;
  assert.equal(plan.structuralColumns.length + plan.structuralBeams.length + plan.structuralGrid.length + plan.foundations.length, 0, "rooms and doors add no structure");
  assert.equal(hasGeneratedStructure(plan), false);

  const done = generateStructureFromGrid(plan);
  assert.ok(houseProjectSchema.safeParse(done).success, "the finished house is a valid project");
  const columns = on(done.structuralColumns);
  for (const corner of plan.levels[0]!.plan!.corners) {
    assert.ok(columns.some((column) => column.id === `${ground}:column:${corner.id}` && column.x === corner.x && column.y === corner.y), `a column at corner ${corner.id}`);
  }
  assert.ok(columns.length > 4, "and along the long spans");
  const doorway = done.doors[0]!;
  const doorWall = done.walls.find((wall) => wall.id === doorway.wallId)!;
  assert.ok(!columns.some((column) => column.y === doorWall.start.y && column.x > doorway.offset - 150 && column.x < doorway.offset + doorway.width + 150), "none in the doorway");
  const grid = on(done.structuralGrid);
  for (const column of columns) {
    assert.ok(grid.some((line) => line.axis === "x" && line.position === column.x) && grid.some((line) => line.axis === "y" && line.position === column.y), `${column.id} stands on two grid lines`);
  }
  for (const line of grid) {
    assert.ok(columns.some((column) => (line.axis === "x" ? column.x : column.y) === line.position), `${line.id} runs through a column`);
  }
  const beams = on(done.structuralBeams);
  assert.ok(beams.length > 0, "beams are generated");
  const at = (point: { x: number; y: number }) => columns.find((column) => column.x === point.x && column.y === point.y);
  for (const beam of beams) {
    const [a, b] = [at(beam.start), at(beam.end)];
    assert.ok(a && b, `${beam.id} runs column to column`);
    assert.ok(a.x === b.x || a.y === b.y, `${beam.id} lies on a grid line`);
    assert.ok(grid.some((line) => line.axis === "x" ? line.position === a.x && a.x === b.x : line.position === a.y && a.y === b.y), `${beam.id} follows its grid line`);
    const between = columns.filter((column) => column !== a && column !== b && (a.x === b.x
      ? column.x === a.x && column.y > Math.min(a.y, b.y) && column.y < Math.max(a.y, b.y)
      : column.y === a.y && column.x > Math.min(a.x, b.x) && column.x < Math.max(a.x, b.x)));
    assert.equal(between.length, 0, `${beam.id} spans to the next column, not past it`);
  }
  for (const line of grid) {
    const count = columns.filter((column) => (line.axis === "x" ? column.x : column.y) === line.position).length;
    assert.equal(beams.filter((beam) => line.axis === "x" ? beam.start.x === line.position && beam.end.x === line.position : beam.start.y === line.position && beam.end.y === line.position).length, count - 1, `${line.id}: one beam between each pair of columns on it`);
  }
  assert.equal(done.foundations.length, columns.length, "a footing under every ground-floor column");
  for (const column of columns) {
    assert.ok(done.foundations.some((footing) => footing.id === `foundation:${column.id}` && footing.x === column.x && footing.y === column.y), `${column.id} has its footing`);
  }
  assert.deepEqual(generateStructureFromGrid(done), done, "generating again changes nothing");

  // Nothing generates structure on its own: not a plan edit, not a new floor.
  const right = plan.walls.find((wall) => wall.levelId === ground && wall.start.x === 8000 && wall.end.x === 8000)!;
  const moved = moveHouseSelections(plan, [{ kind: "wall", id: right.id }], 1000, 0, { footprintEditable: true }).project;
  const floored = addHouseFloor(moved).project;
  for (const value of [moved, floored]) {
    assert.equal(value.structuralColumns.length + value.structuralBeams.length + value.structuralGrid.length + value.foundations.length, 0, "no plan edit generates structure");
  }
  // And a plan edit leaves structure that is there alone.
  const doneRight = done.walls.find((wall) => wall.id === right.id)!;
  const editedDone = moveHouseSelections(done, [{ kind: "wall", id: doneRight.id }], 1000, 0, { footprintEditable: true }).project;
  assert.deepEqual(editedDone.structuralColumns, done.structuralColumns, "existing columns are not regenerated by an edit");
  assert.deepEqual(editedDone.foundations, done.foundations, "nor footings");

  // A column placed by hand is kept, joins the grid, and gets a footing.
  const placed = createHouseObjectFromGesture(plan, "column", ground, { x: 5200, y: 4100 }).project;
  const mine = placed.structuralColumns.find((column) => !column.id.startsWith(`${ground}:column:`))!;
  assert.ok(mine, "a column can be placed by hand");
  const withMine = generateStructureFromGrid(placed);
  assert.ok(withMine.structuralColumns.some((column) => column.id === mine.id), "generation keeps it");
  assert.equal(withMine.structuralColumns.filter((column) => Math.hypot(column.x - mine.x, column.y - mine.y) < 250).length, 1, "and puts none on top of it");
  assert.ok(withMine.foundations.some((footing) => footing.id === `foundation:${mine.id}`), "it gets a footing");
  assert.ok(withMine.structuralGrid.some((line) => line.axis === "x" && line.position === mine.x) && withMine.structuralGrid.some((line) => line.axis === "y" && line.position === mine.y), "and the grid runs through it");
  const stripped = withoutStructure(withMine);
  assert.deepEqual(stripped.structuralColumns.map((column) => column.id), [mine.id], "taking the structure off keeps the hand-placed column");
  assert.equal(stripped.structuralBeams.length + stripped.structuralGrid.length + stripped.foundations.length, 0, "and nothing generated");

  // The project's setup still decides.
  assert.equal(hasGeneratedStructure(generateStructureFromGrid(apartment)), false, "an apartment gets no structure, even finished");
  const noFootings = generateStructureFromGrid({ ...plan, modelingOptions: { ...plan.modelingOptions!, foundations: false } });
  assert.ok(noFootings.structuralColumns.length > 0 && noFootings.foundations.length === 0, "footings switched off: columns and beams, no footings");
}

console.log("House open space: starts empty; the first closed shape becomes the house the builder would make");
