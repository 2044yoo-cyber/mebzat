import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { commandFromChord, commandFromKeyboard, isModelTextInput } from "../src/features/house-designer/services/command-registry";
import {
  lockConflict,
  pinHouseSelections,
  createRoomFromGesture,
  roomOutline,
  alignHouseSelections,
  createHouseObjectFromGesture,
  createDefaultHouseObject,
  deleteHouseSelections,
  duplicateHouseSelections,
  moveHouseSelections,
  setHouseObjectType,
  splitHouseSelection,
} from "../src/features/house-designer/services/model-commands";
import { addHouseFloor, patchHouseObject } from "../src/features/house-designer/services/project-edit";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { calculateHouseQuantities } from "../src/features/house-designer/services/quantities";
import { HOUSE_STYLE_LABELS, createHouseProject, houseProjectSchema, houseStyles } from "../src/features/house-designer/types/project";
import { applyFacadeStyle } from "../src/features/house-designer/services/facade";

let project = ensureHouseBimState(createHouseProject({ title: "Command check", room: rectangularRoom(8000, 6500), style: "modern", strict: true, floorCount: 2, floorToFloorHeight: 3000 }));
assert.ok(project.foundations.length > 0, "foundation suggestions are structured objects");
assert.ok(project.objectTypes.length >= 8, "type catalogue exists");
assert.ok(project.views.some((view) => view.kind === "3d"), "project views persist");

const added = createDefaultHouseObject(project, "wall", "ground-floor");
assert.equal(added.blocked.length, 0);
project = added.project;

const drafted = createHouseObjectFromGesture(project, "wall", "ground-floor", { x: 1000.5, y: 1200.25 }, { x: 4200.75, y: 1200.25 }, { wallThickness: 120, height: 3000 });
assert.equal(drafted.blocked.length, 0, "canvas wall gesture creates geometry");
assert.equal(drafted.project.walls.find((item) => item.id === drafted.selections[0]?.id)?.end.x, 4200.75, "drafted wall keeps decimal endpoint");
project = drafted.project;
const placedColumn = createHouseObjectFromGesture(project, "column", "ground-floor", { x: 2250.5, y: 3300.25 }, { x: 2250.5, y: 3300.25 }, { width: 300, depth: 350, height: 3000 });
assert.equal(placedColumn.project.structuralColumns.at(-1)?.y, 3300.25, "column uses picked snap point");
project = placedColumn.project;
const wall = added.selections[0]!;
const before = project.walls.find((item) => item.id === wall.id)!;
const moved = moveHouseSelections(project, [wall], 10.5, -20.25);
project = moved.project;
const after = project.walls.find((item) => item.id === wall.id)!;
assert.equal(after.start.x, before.start.x + 10.5, "decimal move remains exact");
assert.equal(after.start.y, before.start.y - 20.25, "decimal move remains exact");

const duplicated = duplicateHouseSelections(project, [wall], 250);
assert.equal(duplicated.selections.length, 1);
project = duplicated.project;
const split = splitHouseSelection(project, duplicated.selections[0]!);
assert.equal(split.selections.length, 2, "wall split produces two selectable walls");
project = split.project;

const aligned = alignHouseSelections(project, split.selections);
assert.equal(aligned.blocked.length, 0);
project = aligned.project;

const exterior = { kind: "wall" as const, id: project.walls.find((item) => item.sourceWallId === "c1")!.id };
assert.ok(moveHouseSelections(project, [exterior], 100, 0).blocked.length > 0, "strict mode protects verified footprint");

const door = project.doors[0];
if (door) {
  project = setHouseObjectType(project, [{ kind: "door", id: door.id }], "door-single-900x2100");
  assert.equal(project.objectInstances[door.id]?.typeId, "door-single-900x2100");
}

const removed = deleteHouseSelections(project, split.selections);
assert.ok(removed.project.walls.length < project.walls.length, "global delete removes multiple objects");
project = removed.project;

assert.equal(commandFromChord("WA"), "wall");
assert.equal(commandFromChord("MV"), "move");
assert.equal(commandFromChord("CO"), "copy");
assert.equal(commandFromChord("VG"), "visibility");
assert.equal(commandFromKeyboard({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false }), "undo");
assert.equal(commandFromKeyboard({ key: "s", ctrlKey: true, metaKey: false, shiftKey: true }), "save-as");
assert.equal(commandFromKeyboard({ key: "Delete", ctrlKey: false, metaKey: false, shiftKey: false }), "delete");
assert.equal(isModelTextInput({ tagName: "INPUT", isContentEditable: false } as unknown as EventTarget), true, "numeric inputs suppress modeling shortcuts");
assert.ok(calculateHouseQuantities(project).some((row) => row.code === "CON-06"), "foundations reach live quantities");
assert.ok(houseProjectSchema.safeParse(project).success, "edited model remains persistable");

// Deleting an exterior wall means deleting the corner it starts from — not
// blocked outright, and not left as a hole in the footprint either.
const footprintProject = ensureHouseBimState(createHouseProject({ title: "Footprint delete check", room: rectangularRoom(8000, 6500), style: "modern", strict: true, floorCount: 1, floorToFloorHeight: 3000 }));
const footprintWall = { kind: "wall" as const, id: footprintProject.walls.find((item) => item.sourceWallId === "c1")!.id };
const stillBlocked = deleteHouseSelections(footprintProject, [footprintWall]);
assert.equal(stillBlocked.blocked.length, 1, "footprint wall delete is still refused outside plan verification");
const editable = deleteHouseSelections(footprintProject, [footprintWall], { footprintEditable: true });
assert.equal(editable.blocked.length, 0, "footprint wall delete is allowed during plan verification");
assert.equal(editable.project.levels[0]!.plan!.corners.length, 3, "the corner the wall started from is gone");
assert.equal(editable.project.walls.some((item) => item.id === footprintWall.id), false, "the deleted wall itself is gone");
assert.equal(editable.project.slabs[0]!.boundary.length, 3, "the slab boundary follows the shorter footprint");
assert.equal(editable.project.roofs[0]!.boundary.length, 3, "the roof boundary follows the shorter footprint");
assert.ok(houseProjectSchema.safeParse(editable.project).success, "the shorter footprint is still a valid project");
const triangleWall = { kind: "wall" as const, id: editable.project.walls.find((item) => item.levelId === "ground-floor")!.id };
assert.ok(deleteHouseSelections(editable.project, [triangleWall], { footprintEditable: true }).blocked.length > 0, "refuses to shrink a footprint below three walls");

{
  // Styles change appearance only; Luxury is one of them.
  const base = ensureHouseBimState(createHouseProject({ title: "Style", room: rectangularRoom(8000, 6500), style: "modern", strict: false, floorCount: 2, floorToFloorHeight: 3000 }));
  const luxury = applyFacadeStyle(base, "luxury");
  assert.equal(luxury.designStyle, "luxury");
  assert.ok(houseProjectSchema.safeParse(luxury).success, "a luxury house is a valid project");
  const geometry = (value: typeof base) => JSON.stringify([value.walls.map((wall) => [wall.id, wall.start, wall.end, wall.thickness]), [...value.doors, ...value.windows].map((item) => [item.id, item.offset, item.width])]);
  assert.equal(geometry(luxury), geometry(base), "restyling moves no wall, door or window");
  assert.ok(luxury.roofs.every((roof) => roof.type === "flat"), "on a flat roof");
  const top = luxury.levels.at(-1)!.id;
  assert.ok(luxury.facadeElements.some((item) => item.type === "parapet" && item.levelId === top), "behind a parapet");
  for (const level of luxury.levels) {
    assert.ok(luxury.facadeElements.some((item) => item.type === "band" && item.levelId === level.id && item.elevation === level.elevation), `with a stone plinth on ${level.name}`);
    assert.equal(luxury.facadeElements.filter((item) => item.type === "pilaster" && item.levelId === level.id).length, 2, `and an entrance feature on ${level.name}`);
  }
  assert.ok(houseStyles.every((style) => HOUSE_STYLE_LABELS[style]?.length), "every style has a name people read");
  assert.equal(HOUSE_STYLE_LABELS["ethiopian-inspired"], "Traditional Ethiopian");
}

{
  // Floor, ceiling and roof cover the room you tap, once.
  const base = ensureHouseBimState(createHouseProject({ title: "Cover", room: rectangularRoom(8000, 6500), style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }));
  const level = base.levels[0]!.id;
  const inside = { x: 4000, y: 3000 };
  for (const tool of ["floor", "ceiling", "roof"] as const) {
    const result = createHouseObjectFromGesture(base, tool, level, inside);
    assert.equal(result.project, base, `the house already has a ${tool}: nothing is added`);
    assert.equal(result.blocked.length, 1, `and it says so (${tool})`);
  }
  assert.match(createHouseObjectFromGesture(base, "floor", level, { x: 20000, y: 20000 }).blocked[0] ?? "", /Tap inside a room/);

  const extension = createRoomFromGesture(base, level, { x: 8000, y: 0 }, { x: 11000, y: 3000 }, "rectangle", { wallThickness: 120 }).project;
  const middle = { x: 9500, y: 1500 };
  const floored = createHouseObjectFromGesture(extension, "floor", level, middle);
  assert.equal(floored.project.slabs.length, extension.slabs.length + 1, "an uncovered room gets its floor");
  const slab = floored.project.slabs.at(-1)!;
  assert.deepEqual(slab.boundary.map((point) => [point.x, point.y]), [[8000, 0], [11000, 0], [11000, 3000], [8000, 3000]], "exactly the room tapped");
  assert.equal(createHouseObjectFromGesture(floored.project, "floor", level, middle).blocked.length, 1, "and only once");
  const roofed = createHouseObjectFromGesture(floored.project, "roof", level, middle);
  assert.equal(roofed.project.roofs.length, floored.project.roofs.length + 1, "and a roof of its own");
  assert.ok(extension.rooms.at(-1)!.ceilingHeight > 0);
  assert.equal(roofed.project.roofs.at(-1)!.elevation, extension.rooms.at(-1)!.ceilingHeight, "at the top of the room");
  const ceiled = createHouseObjectFromGesture(roofed.project, "ceiling", level, middle);
  assert.equal(ceiled.project.ceilings.at(-1)!.roomId, extension.rooms.at(-1)!.id, "a ceiling belongs to the room tapped");
  assert.ok(houseProjectSchema.safeParse(ceiled.project).success);

  const nested = createRoomFromGesture(extension, level, { x: 8500, y: 500 }, { x: 10000, y: 2500 }, "rectangle", { wallThickness: 120 }).project;
  const nestedFloor = createHouseObjectFromGesture(nested, "floor", level, { x: 9000, y: 1500 }).project.slabs.at(-1)!;
  assert.deepEqual(nestedFloor.boundary.map((point) => [point.x, point.y]), [[8500, 500], [10000, 500], [10000, 2500], [8500, 2500]], "a room within a room: the one under the finger, the smaller");

  const innerRoom = createRoomFromGesture(base, level, { x: 1000, y: 1000 }, { x: 3000, y: 3000 }, "rectangle", { wallThickness: 120 }).project;
  assert.equal(createHouseObjectFromGesture(innerRoom, "floor", level, { x: 2000, y: 2000 }).blocked.length, 1, "a room inside the house is already on its slab");
}

{
  // Add Floor builds what a two-storey project would have started with.
  const make = (floorCount: number) => ensureHouseBimState(createHouseProject({ title: "Floors", room: rectangularRoom(8000, 6500), style: "modern", strict: false, floorCount, floorToFloorHeight: 3000 }));
  const one = make(1);
  const two = make(2);
  const added = addHouseFloor(one);
  assert.ok(added.levelId);
  const on = <T extends { levelId: string }>(items: readonly T[], id: string) => items.filter((item) => item.levelId === id);
  const [ground] = one.levels;
  const upper = added.project.levels.find((level) => level.id === added.levelId)!;
  assert.equal(added.project.levels.length, 2);
  assert.equal(upper.elevation, 3000, "the new floor sits on top");
  assert.equal(upper.name, "1st Floor");
  assert.equal(on(added.project.walls, upper.id).length, on(two.walls, two.levels[1]!.id).length, "with the walls a two-storey house has upstairs");
  assert.equal(on(added.project.rooms, upper.id).length, on(two.rooms, two.levels[1]!.id).length, "and its rooms");
  assert.equal(on(added.project.slabs, upper.id).length, 1, "and a floor slab");
  assert.equal(on(added.project.roofs, upper.id).length, one.roofs.length, "the roof moves up to the new top floor");
  assert.equal(on(added.project.roofs, ground!.id).length, 0);
  assert.equal(added.project.roofs[0]!.elevation, one.roofs[0]!.elevation + 3000, "and up by a storey");
  assert.equal(on(added.project.stairs, ground!.id).length, 1, "a stair joins the two floors");
  assert.ok(added.project.views.some((view) => view.levelId === upper.id), "the floor has its own plan view");
  assert.ok(houseProjectSchema.safeParse(added.project).success, "the result is a valid project");
  const third = addHouseFloor(added.project);
  assert.equal(new Set(third.project.levels.map((level) => level.id)).size, 3, "every floor gets its own id");
  assert.equal(third.project.levels.at(-1)!.name, "2nd Floor");
  assert.equal(on(third.project.stairs, upper.id).length, 1, "and the floor below a new one gets its stair");
}

{
  // Moving a wall drags its corners, so the walls either side stretch; a lock
  // stops that from either end.
  const base = ensureHouseBimState(createHouseProject({ title: "Locks", room: rectangularRoom(8000, 6500), style: "modern", strict: true, floorCount: 1, floorToFloorHeight: 3000 }));
  const level = base.levels[0]!.id;
  const outside = (value: typeof base) => value.walls.filter((wall) => wall.levelId === level && value.levels[0]!.plan!.corners.some((corner) => corner.id === wall.sourceWallId));
  const find = (value: typeof base, test: (wall: (typeof base)["walls"][number]) => boolean) => outside(value).find(test)!;
  const isTop = (wall: (typeof base)["walls"][number]) => wall.start.y === 0 && wall.end.y === 0;
  const isLeft = (wall: (typeof base)["walls"][number]) => wall.start.x === 0 && wall.end.x === 0;
  const isRight = (wall: (typeof base)["walls"][number]) => wall.start.x === 8000 && wall.end.x === 8000;
  const top = { kind: "wall" as const, id: find(base, isTop).id };
  const left = { kind: "wall" as const, id: find(base, isLeft).id };
  const right = { kind: "wall" as const, id: find(base, isRight).id };
  const span = (wall: (typeof base)["walls"][number]) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);

  assert.ok(moveHouseSelections(base, [top], 0, -500).blocked.length, "strict plans protect outside walls outside verification");
  const moved = moveHouseSelections(base, [top], 0, -500, { footprintEditable: true });
  assert.deepEqual(moved.blocked, []);
  assert.equal(span(moved.project.walls.find((wall) => wall.id === left.id)!), 7000, "the wall beside it stretches to follow");
  assert.equal(moved.project.levels[0]!.plan!.corners.filter((corner) => corner.y === -500).length, 2, "both corners of the moved wall move");

  const lockedLeft = pinHouseSelections(base, [left], true);
  assert.ok(lockConflict(lockedLeft, left), "a locked wall reports itself");
  const refused = moveHouseSelections(lockedLeft, [top], 0, -500, { footprintEditable: true });
  assert.equal(refused.project, lockedLeft, "a move that would stretch a locked wall does nothing");
  assert.match(refused.blocked.join(" "), /locked wall joined to it/);
  assert.equal(lockConflict(lockedLeft, right), null, "the lock reaches only the walls it touches");
  assert.deepEqual(moveHouseSelections(lockedLeft, [right], 300, 0, { footprintEditable: true }).blocked, []);
  const kept = deleteHouseSelections(pinHouseSelections(base, [top], true), [top], { footprintEditable: true });
  assert.equal(kept.project.walls.length, pinHouseSelections(base, [top], true).walls.length, "a locked wall cannot be deleted");
  assert.equal(deleteHouseSelections(lockedLeft, [top], { footprintEditable: true }).blocked.length, 1, "nor one whose removal would bend a locked neighbour");
}

{
  // A door slides along its wall but never off it.
  const base = ensureHouseBimState(createHouseProject({ title: "Doors", room: rectangularRoom(8000, 6500), style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }));
  const level = base.levels[0]!.id;
  const placed = createHouseObjectFromGesture(base, "door", level, { x: 4000, y: 0 }, { x: 4000, y: 0 }, { width: 900, height: 2100 });
  const door = placed.selections[0]!;
  const doorOf = (value: typeof base) => value.doors.find((item) => item.id === door.id)!;
  const host = placed.project.walls.find((item) => item.id === doorOf(placed.project).wallId)!;
  const length = Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y);
  const planOffset = (value: typeof base) => value.levels[0]!.plan!.openings.find((item) => item.id === doorOf(value).sourceOpeningId)?.offset;

  const moved = patchHouseObject(placed.project, door, { offset: 1250 });
  assert.equal(doorOf(moved).offset, 1250, "an offset inside the wall is kept exactly");
  assert.equal(planOffset(moved), 1250, "and written to the verified plan");
  const past = patchHouseObject(placed.project, door, { offset: length + 5000 });
  assert.equal(doorOf(past).offset, length - 900, "dragging past the end stops at the end");
  assert.equal(planOffset(past), length - 900);
  assert.equal(doorOf(patchHouseObject(placed.project, door, { offset: -400 })).offset, 0, "and before the start stops at the start");
  const wide = patchHouseObject(placed.project, door, { width: length + 1000 });
  assert.equal(doorOf(wide).width, length, "an opening is never wider than its wall");
  assert.equal(doorOf(wide).offset, 0);
}

{
  // Room-first drawing. The default house is 0..8000 x 0..6500 with 200 mm
  // outside walls, so a room in its corner shares two edges with them.
  const base = ensureHouseBimState(createHouseProject({ title: "Rooms", room: rectangularRoom(8000, 6500), style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }));
  const level = base.levels[0]!.id;
  const wallsOn = (value: typeof base) => value.walls.filter((wall) => wall.levelId === level).length;
  const before = wallsOn(base);

  const free = createRoomFromGesture(base, level, { x: 2000, y: 2000 }, { x: 5000, y: 4500 }, "rectangle", { wallThickness: 120 });
  assert.deepEqual(free.blocked, []);
  assert.equal(wallsOn(free.project) - before, 4, "a free-standing room gets four walls");
  const room = free.project.rooms.find((item) => item.id === free.selections[0]?.id);
  assert.ok(room, "the room itself is created and selected first");
  assert.equal(room.boundary.length, 4);
  assert.equal(free.project.levels[0]!.plan!.zones!.at(-1)!.boundary.length, 4, "and recorded in the verified plan");
  assert.ok(houseProjectSchema.safeParse(free.project).success, "the result is a valid project");

  const corner = createRoomFromGesture(base, level, { x: 0, y: 0 }, { x: 3000, y: 2500 }, "rectangle", { wallThickness: 120 });
  assert.equal(wallsOn(corner.project) - before, 2, "edges on the outside walls reuse them");

  const shared = createRoomFromGesture(free.project, level, { x: 5000, y: 2000 }, { x: 7000, y: 4500 }, "rectangle", { wallThickness: 120 });
  assert.equal(wallsOn(shared.project) - wallsOn(free.project), 3, "a room next door shares the wall between them");

  const ell = createRoomFromGesture(base, level, { x: 1000, y: 1000 }, { x: 5000, y: 5000 }, "l-shape", { wallThickness: 120 });
  assert.equal(wallsOn(ell.project) - before, 6, "an L-shape has six walls");
  assert.deepEqual(roomOutline("l-shape", { x: 0, y: 0 }, { x: 4000, y: 2000 }), [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 2000 }, { x: 0, y: 2000 }]);

  const tiny = createRoomFromGesture(base, level, { x: 1000, y: 1000 }, { x: 1200, y: 3000 }, "rectangle");
  assert.equal(tiny.project, base, "a slip of the finger creates nothing");
  assert.equal(tiny.blocked.length, 1);
}

console.log("house command checks passed");
