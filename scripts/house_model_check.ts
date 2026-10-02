import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room.ts";
import { patchHouseObject } from "../src/features/house-designer/services/project-edit.ts";
import {
  createHouseProject,
  houseProjectSchema,
} from "../src/features/house-designer/types/project.ts";

const room = {
  ...rectangularRoom(8000, 6500),
  openings: [
    { id: "door-1", kind: "door" as const, wallId: "c1", offset: 900, width: 1000, height: 2100, sill: 0, swing: "in-left" as const, label: "Entry" },
    { id: "window-1", kind: "window" as const, wallId: "c2", offset: 1200, width: 1800, height: 1200, sill: 900, swing: "none" as const, label: "Window" },
  ],
};

let project = createHouseProject({
  title: "Phase 2 check",
  room,
  style: "modern",
  strict: true,
  floorCount: 2,
  floorToFloorHeight: 3000,
});

assert.equal(project.levels.length, 2);
assert.equal(project.walls.length, 8);
assert.equal(project.doors.length, 2);
assert.equal(project.windows.length, 2);
assert.equal(project.slabs.length, 2);
assert.equal(project.stairs.length, 1);
assert.equal(project.roofs.length, 1);

project = patchHouseObject(project, { kind: "wall", id: "ground-floor:wall:c1" }, { endX: 8200, thickness: 200 });
assert.equal(project.levels[0]?.plan?.corners[1]?.x, 8200);
assert.equal(project.walls.find((wall) => wall.id === "ground-floor:wall:c1")?.thickness, 200);

project = patchHouseObject(project, { kind: "door", id: "ground-floor:door:door-1" }, { width: 1100 });
assert.equal(project.levels[0]?.plan?.openings[0]?.width, 1100);

project = patchHouseObject(project, { kind: "level", id: "ground-floor" }, { floorToFloorHeight: 3200 });
assert.equal(project.stairs[0]?.height, 3200);

project = patchHouseObject(project, { kind: "roof", id: "main-roof" }, { type: "gable", slope: 25 });
assert.equal(project.roofs[0]?.type, "gable");
assert.equal(project.roofs[0]?.slope, 25);
houseProjectSchema.parse(project);

console.log("House model checks passed");
