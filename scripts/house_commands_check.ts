import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { commandFromChord, commandFromKeyboard } from "../src/features/house-designer/services/command-registry";
import {
  alignHouseSelections,
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
assert.equal(commandFromKeyboard({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false }), "undo");
assert.equal(commandFromKeyboard({ key: "s", ctrlKey: true, metaKey: false, shiftKey: true }), "save-as");
assert.ok(calculateHouseQuantities(project).some((row) => row.code === "CON-06"), "foundations reach live quantities");
assert.ok(houseProjectSchema.safeParse(project).success, "edited model remains persistable");

console.log("house command checks passed");
