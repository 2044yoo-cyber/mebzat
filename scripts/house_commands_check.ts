import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { commandFromChord, commandFromKeyboard, isModelTextInput } from "../src/features/house-designer/services/command-registry";
import {
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
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { calculateHouseQuantities } from "../src/features/house-designer/services/quantities";
import { createHouseProject, houseProjectSchema } from "../src/features/house-designer/types/project";

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
