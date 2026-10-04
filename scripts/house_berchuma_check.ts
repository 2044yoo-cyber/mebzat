import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { roomContext, wallContext } from "../src/features/house-designer/services/berchuma-context";
import { createHouseObjectFromGesture, moveHouseSelections, roomOutline } from "../src/features/house-designer/services/model-commands";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { establishLevelOutline, openSpace, patchHouseObject, splitRoomAlong } from "../src/features/house-designer/services/project-edit";
import { applyModelingOptions, modelingPreset } from "../src/features/house-designer/services/workspace-options";
import { createHouseProject } from "../src/features/house-designer/types/project";

// A bedroom with a door and a window, as the plan has it.
const base = openSpace(ensureHouseBimState(applyModelingOptions(createHouseProject({ title: "Berchuma", room: { ...rectangularRoom(8000, 6500), ceilingHeight: 2800 }, style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }), modelingPreset("house"))));
const ground = base.levels[0]!.id;
let project = establishLevelOutline(base, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 8000, y: 6500 }))!;
project = splitRoomAlong(createHouseObjectFromGesture(project, "wall", ground, { x: 4200, y: 0 }, { x: 4200, y: 6500 }, { wallThickness: 120 }).project, ground, { x: 4200, y: 0 }, { x: 4200, y: 6500 });
const bedroom = project.rooms.find((room) => room.boundary.every((point) => point.x <= 4200))!;
project = patchHouseObject(project, { kind: "room", id: bedroom.id }, { name: "Bedroom" });
project = createHouseObjectFromGesture(project, "door", ground, { x: 2000, y: 0 }, { x: 2000, y: 0 }, { width: 900, height: 2100 }).project;
project = createHouseObjectFromGesture(project, "window", ground, { x: 0, y: 3000 }, { x: 0, y: 3000 }, { width: 1200, height: 1500, sillHeight: 900 }).project;

const top = project.walls.find((wall) => wall.levelId === ground && wall.start.y === 0 && wall.end.y === 0 && wall.start.x === 0)!;
const wall = wallContext(project, top.id)!;
assert.equal(wall.wallId, top.id, "the wall is named by its stable id");
assert.equal(wall.length, 8000);
assert.equal(wall.angle, 0, "and runs along +x");
assert.ok(wall.rooms.includes("Bedroom"), "it knows the bedroom is behind it");
assert.equal(wall.openings.length, 1, "its door");
const door = wall.openings[0]!;
assert.deepEqual([door.kind, door.width, door.height, door.sill], ["door", 900, 2100, 0]);
assert.deepEqual(wall.freeRuns.map((run) => [run.from, run.to]), [[0, door.offset], [door.offset + 900, 8000]], "the free stretches either side of the door");
const cleared = wallContext(project, top.id, 100)!;
assert.deepEqual(cleared.freeRuns.map((run) => [run.from, run.to]), [[0, door.offset - 100], [door.offset + 1000, 8000]], "less a clearance either side");

const left = project.walls.find((wall) => wall.levelId === ground && wall.start.x === 0 && wall.end.x === 0)!;
const windowWall = wallContext(project, left.id)!;
assert.deepEqual(windowWall.openings.map((item) => [item.kind, item.width, item.sill]), [["window", 1200, 900]], "a window carries its sill height");

const room = roomContext(project, bedroom.id)!;
assert.equal(room.name, "Bedroom");
assert.equal(room.height, 3000, "the room's height is the floor's ceiling height");
assert.ok(Math.abs(room.area - 4.2 * 6.5) < 1e-9, "its area");
const sides = room.walls.map((item) => item.wallId).sort();
assert.equal(sides.length, 4, `the bedroom's four walls (${sides.join(", ")})`);
assert.ok(sides.includes(top.id) && sides.includes(left.id), "including the door wall and the window wall");

// Ids are stable: after the plan is edited, the same wall is found by the same id.
const moved = moveHouseSelections(project, [{ kind: "wall", id: left.id }], -500, 0, { footprintEditable: true }).project;
const again = wallContext(moved, left.id)!;
assert.ok(again, "the wall is still there by its id after an edit");
assert.equal(again.start.x, -500, "with its new position");
assert.equal(again.openings.length, 1, "and its window");
assert.equal(wallContext(project, "no-such-wall"), null);
assert.equal(roomContext(project, "no-such-room"), null);

console.log("House → Berchuma: walls and rooms by stable id, with length, height, orientation, openings and free runs");
