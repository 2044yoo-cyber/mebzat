import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { pickHouseObject, selectableBounds } from "../src/features/house-designer/components/house-plan-selection-overlay";
import { createHouseProject } from "../src/features/house-designer/types/project";

// The default house carries a structural grid and beams drawn exactly on its
// walls, which is the case that made a tap on a wall select an invisible grid.
const project = createHouseProject({ title: "Pick", room: rectangularRoom(8000, 6500), style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 });
const levelId = project.levels[0]!.id;
const objects = selectableBounds(project, levelId);
assert.ok(objects.some((item) => item.selection.kind === "grid"), "fixture has grid lines on the walls");
assert.ok(objects.some((item) => item.selection.kind === "beam"), "fixture has beams on the walls");

for (const wall of project.walls.filter((item) => item.levelId === levelId)) {
  const middle = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  assert.deepEqual(pickHouseObject(objects, middle), { kind: "wall", id: wall.id }, `tap on ${wall.id} picks the wall`);
}

const column = project.structuralColumns.find((item) => item.levelId === levelId);
assert.ok(column, "fixture has a corner column");
assert.equal(pickHouseObject(objects, { x: column.x, y: column.y })?.kind, "column", "a column at a corner beats the walls meeting there");

const centre = { x: 4000, y: 3250 };
assert.equal(pickHouseObject(objects, centre)?.kind, "room", "a tap inside the house picks the room");
assert.equal(pickHouseObject(objects, { x: -5000, y: -5000 }), null, "a tap on empty canvas picks nothing");

console.log("House plan tap picking passed");
