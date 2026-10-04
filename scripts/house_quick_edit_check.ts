import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { roomOutline } from "../src/features/house-designer/services/model-commands";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { establishLevelOutline, openSpace } from "../src/features/house-designer/services/project-edit";
import { duplicateWallParallel, extendWall, levelChains, moveWallEnd, roomRectangle, rotateWall90, setWallDistance, setWallLength, splitRoom, wallChain } from "../src/features/house-designer/services/quick-edit";
import { applyModelingOptions, modelingPreset } from "../src/features/house-designer/services/workspace-options";
import { createHouseProject, type HouseProject } from "../src/features/house-designer/types/project";

const base = openSpace(ensureHouseBimState(applyModelingOptions(createHouseProject({ title: "Fast", room: { ...rectangularRoom(9000, 11000), ceilingHeight: 3000 }, style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }), modelingPreset("house"))));
const ground = base.levels[0]!.id;
const on = (project: HouseProject) => project.walls.filter((wall) => wall.levelId === ground);
const rooms = (project: HouseProject) => project.rooms.filter((room) => room.levelId === ground).map((room) => { const xs = room.boundary.map((point) => point.x); const ys = room.boundary.map((point) => point.y); return `${Math.min(...xs)}..${Math.max(...xs)} x ${Math.min(...ys)}..${Math.max(...ys)}`; }).sort();
const wallAt = (project: HouseProject, test: (wall: HouseProject["walls"][number]) => boolean) => on(project).find(test)!;
const vertical = (x: number) => (wall: HouseProject["walls"][number]) => wall.start.x === x && wall.end.x === x;
const horizontal = (y: number) => (wall: HouseProject["walls"][number]) => wall.start.y === y && wall.end.y === y;

// The brief's own workflow: one 9000 × 11000 rectangle.
let project = establishLevelOutline(base, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 9000, y: 11000 }))!;
assert.deepEqual(rooms(project), ["0..9000 x 0..11000"]);
assert.deepEqual(roomRectangle(project, project.rooms[0]!.id), { x: 0, y: 0, width: 9000, depth: 11000 }, "a rectangular room's size, for placing a copy");

// Split → Vertical → centre: 4500 | 4500, with a real wall.
let step = splitRoom(project, project.rooms[0]!.id, "vertical");
assert.deepEqual(step.blocked, []);
project = step.project;
assert.deepEqual(rooms(project), ["0..4500 x 0..11000", "4500..9000 x 0..11000"], "one tap splits the room down the middle");
const partition = wallAt(project, vertical(4500));
assert.deepEqual([partition.start.y, partition.end.y].sort((a, b) => a - b), [0, 11000], "edge to edge");
assert.deepEqual(step.selections, [{ kind: "wall", id: partition.id }], "and the new partition is selected, ready to drag");

// Split the left half horizontally.
const left = project.rooms.find((room) => room.boundary.every((point) => point.x <= 4500))!;
project = splitRoom(project, left.id, "horizontal").project;
assert.deepEqual(rooms(project), ["0..4500 x 0..5500", "0..4500 x 5500..11000", "4500..9000 x 0..11000"], "and across");
assert.deepEqual(splitRoom(project, left.id, "vertical", 4300).blocked.length, 1, "a room that is no longer there cannot be split");
const right = project.rooms.find((room) => room.boundary.every((point) => point.x >= 4500))!;
assert.equal(splitRoom(project, right.id, "vertical", 200).blocked[0], "Each part needs to be at least 300 mm", "nor into a sliver");
const exact = splitRoom(project, right.id, "vertical", 4000).project;
assert.ok(wallAt(exact, vertical(8500)), "an exact first part: 4000 from the room's edge");

// The chain across the partition: 0 | 4500 | 9000.
const chain = wallChain(project, partition.id)!;
assert.equal(chain.axis, "x");
assert.deepEqual(chain.positions.map((item) => item.at), [0, 4500, 9000], "the walls either side of the partition, in order");
assert.deepEqual(levelChains(project, ground), { xs: [0, 4500, 9000], ys: [0, 5500, 11000] }, "the floor's X and Y chains");

// Duplicate the partition: a parallel copy, halfway to the next wall.
step = duplicateWallParallel(project, partition.id);
project = step.project;
const copy = wallAt(project, vertical(6750));
assert.ok(copy, "the copy lands halfway to the next parallel wall");
assert.deepEqual(step.selections, [{ kind: "wall", id: copy.id }], "selected, to drag");
assert.equal(rooms(project).length, 4, "and it splits the room it crosses");
assert.deepEqual(wallChain(project, copy.id)!.positions.map((item) => item.at), [0, 4500, 6750, 9000], "3 spaces: 4500 · 2250 · 2250");
assert.equal(on(duplicateWallParallel(project, partition.id, 1500).project).filter((wall) => vertical(3000)(wall) || vertical(6000)(wall)).length, 1, "or exactly the distance asked, along the wall's normal");

// Tap the 2.25 m between them, type 2800: the copy moves, the partition stays.
project = setWallDistance(project, copy.id, partition.id, 2800).project;
assert.ok(wallAt(project, vertical(7300)), "the space becomes exactly 2800");
assert.ok(wallAt(project, vertical(4500)), "measured from the wall that stays");
assert.deepEqual(rooms(project).filter((room) => room.startsWith("4500")), ["4500..7300 x 0..11000"], "and the room between them is 2800 wide");
assert.equal(setWallDistance(project, copy.id, wallAt(project, horizontal(0)).id, 2000).blocked.length, 1, "only side-by-side walls are measured against each other");

// Extending an outside wall moves its neighbour, keeping the corner square.
const top = wallAt(project, (wall) => wall.start.y === 0 && wall.end.y === 0 && wall.start.x === 0);
step = extendWall(project, top.id, "end", 1000);
assert.deepEqual(step.blocked, []);
const wider = step.project;
assert.ok(wallAt(wider, vertical(10000)), "+ at the end of the top wall moves the right wall out");
assert.equal(Math.hypot(wallAt(wider, (wall) => wall.id === top.id).end.x - 0, 0), 10000, "the top wall is 1000 longer");
assert.ok(wallAt(wider, vertical(0)), "and its other end stayed put");
const narrower = extendWall(project, top.id, "start", -500).project;
assert.ok(wallAt(narrower, vertical(500)), "− at the start pulls the left wall in");
assert.ok(wallAt(narrower, vertical(9000)), "the right wall untouched");
assert.equal(extendWall(project, top.id, "end", -9000).blocked[0], "A wall cannot be shorter than 200 mm");
assert.ok(wallAt(setWallLength(project, top.id, "end", 9500).project, vertical(9500)), "a typed length, from the end chosen");

// An inside wall shortened from its start: what meets it further along stays.
const across = wallAt(project, horizontal(5500));
const shortened = extendWall(project, partition.id, partition.start.y === 0 ? "start" : "end", -1000).project;
const kept = wallAt(shortened, (wall) => wall.id === across.id);
assert.deepEqual([kept.start, kept.end].map((point) => point.y), [5500, 5500], "a wall meeting it in a T keeps its place");
const moved = wallAt(shortened, (wall) => wall.id === partition.id);
assert.deepEqual([moved.start.y, moved.end.y].sort((a, b) => a - b), [1000, 11000], "while the end moved by exactly 1000");

// Dragging an end to a point.
const dragged = moveWallEnd(project, across.id, across.start.x === 0 ? "end" : "start", { x: 3000, y: 5500 }).project;
assert.ok(on(dragged).some((wall) => wall.id === across.id && Math.min(wall.start.x, wall.end.x) === 0 && Math.max(wall.start.x, wall.end.x) === 3000), "an end dragged to a point puts it there");
assert.equal(moveWallEnd(project, across.id, "end", across.start).blocked.length, 1, "not onto the other end");

// Rotate 90°: an inside wall turns about its middle; the outline does not.
const turned = rotateWall90(project, across.id).project;
const rotated = wallAt(turned, (wall) => wall.id === across.id);
assert.deepEqual([rotated.start.x, rotated.end.x], [2250, 2250], "turned upright about its middle");
assert.deepEqual([rotated.start.y, rotated.end.y].sort((a, b) => a - b), [3250, 7750], "the same length");
assert.equal(rotateWall90(project, top.id).blocked.length, 1, "the outline is not turned");

console.log("House quick edit: split rooms, duplicate a partition, set a distance, extend and shorten from either end, drag an end, rotate 90°, dimension chains");
