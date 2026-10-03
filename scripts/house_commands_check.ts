import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { commandFromChord, commandFromKeyboard, isModelTextInput } from "../src/features/house-designer/services/command-registry";
import {
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

console.log("house command checks passed");
