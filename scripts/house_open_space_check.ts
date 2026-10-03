import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { createHouseObjectFromGesture, createRoomFromGesture, moveHouseSelections, roomOutline } from "../src/features/house-designer/services/model-commands";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { addHouseFloor, establishLevelOutline, mergeRooms, openSpace, patchHouseObject, splitRoomAlong } from "../src/features/house-designer/services/project-edit";
import { PLAN_TEMPLATES } from "../src/features/house-designer/services/plan-templates";
import { pitchedRise } from "../src/features/house-designer/components/house-preview";
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
for (const key of ["rooms", "slabs", "roofs", "structuralColumns", "structuralBeams", "foundations"] as const) {
  assert.equal(drawn[key].length, reference[key].length, `and as many ${key}`);
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
assert.equal(bothDrawn.foundations.every((item) => item.levelId === lower!.id), true, "footings only under the ground floor");

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
  const parapets = (value: typeof drawn) => value.facadeElements.filter((item) => item.type === "parapet").length;
  assert.ok(parapets(drawn) > 0, "a flat roof is edged by a parapet");
  const gable = patchHouseObject(drawn, { kind: "roof", id: roof.id }, { type: "gable", slope: 25 });
  assert.equal(parapets(gable), 0, "a pitched one is not hidden behind one");
  const top = gable.walls.find((item) => item.levelId === ground && item.start.y === 0 && item.end.y === 0)!;
  assert.equal(parapets(moveHouseSelections(gable, [{ kind: "wall", id: top.id }], 0, -500, { footprintEditable: true }).project), 0, "nor after the plan is edited");
  assert.ok(parapets(patchHouseObject(gable, { kind: "roof", id: roof.id }, { type: "flat", slope: 0 })) > 0, "and flat again brings it back");
}

console.log("House open space: starts empty; the first closed shape becomes the house the builder would make");
