import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { createHouseObjectFromGesture, createRoomFromGesture, deleteHouseSelections, moveHouseSelections, roomOutline } from "../src/features/house-designer/services/model-commands";
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
assert.equal(splitRoom(project, `${ground}:gone`, "vertical").blocked.length, 1, "a room that is not there cannot be split");
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

// ---------------------------------------------------------------------------
// Rooms are deleted and moved like anything else.
// ---------------------------------------------------------------------------
const house = establishLevelOutline(base, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 6000, y: 5000 }))!;
const roomAt = (value: HouseProject, x: number, y: number) => value.rooms.find((room) => room.levelId === ground && Math.min(...room.boundary.map((point) => point.x)) === x && Math.min(...room.boundary.map((point) => point.y)) === y)!;
// A room drawn apart from the house, with a door in it and a bed.
let apart = createRoomFromGesture(house, ground, { x: 8000, y: 0 }, { x: 11000, y: 3000 }, "rectangle", { wallThickness: 120 }).project;
const apartBottom = wallAt(apart, (wall) => wall.start.y === 3000 && wall.end.y === 3000 && Math.min(wall.start.x, wall.end.x) === 8000);
apart = createHouseObjectFromGesture(apart, "door", ground, { x: 9500, y: 3000 }).project;
const apartDoor = apart.doors.find((door) => door.wallId === apartBottom.id)!;
assert.ok(apartDoor, "fixture: a door in the room apart");
apart = { ...apart, components: [...apart.components, { ...(base.components[0] ?? {}), id: "bed", levelId: ground, x: 9000, y: 1500, width: 1600, depth: 2000, height: 500, rotation: 0, elevation: 0, category: "bed", name: "Bed", material: "Timber" } as HouseProject["components"][number]] };
assert.deepEqual(rooms(apart), ["0..6000 x 0..5000", "8000..11000 x 0..3000"]);

// Moved: its walls, its door and its furniture go with it; the house stays.
const away = moveHouseSelections(apart, [{ kind: "room", id: roomAt(apart, 8000, 0).id }], 1000, 500, { footprintEditable: true });
assert.deepEqual(away.blocked, []);
assert.deepEqual(rooms(away.project), ["0..6000 x 0..5000", "9000..12000 x 500..3500"], "the room apart moves");
assert.equal(on(away.project).filter((wall) => [wall.start, wall.end].every((point) => point.x >= 9000 && point.x <= 12000 && point.y >= 500 && point.y <= 3500)).length, 4, "with its four walls");
assert.ok(wallAt(away.project, vertical(0)) && wallAt(away.project, vertical(6000)), "the house does not");
assert.equal(away.project.doors.filter((door) => door.levelId === ground).length, 1, "its door comes along");
assert.deepEqual([away.project.components.find((item) => item.id === "bed")!.x, away.project.components.find((item) => item.id === "bed")!.y], [10000, 2000], "and the bed in it");
// The house's only room moves the whole outline.
const shifted = moveHouseSelections(apart, [{ kind: "room", id: roomAt(apart, 0, 0).id }], -1000, 0, { footprintEditable: true }).project;
assert.deepEqual(rooms(shifted), ["-1000..5000 x 0..5000", "8000..11000 x 0..3000"], "the house moves, the room apart stays");
// A room sharing a wall is changed by its walls instead.
const halves = splitRoom(apart, roomAt(apart, 0, 0).id, "vertical").project;
assert.equal(moveHouseSelections(halves, [{ kind: "room", id: roomAt(halves, 0, 0).id }], 500, 0).blocked.length, 1, "a room sharing a wall is not dragged off it");
const pair = createRoomFromGesture(apart, ground, { x: 11000, y: 0 }, { x: 13000, y: 3000 }, "rectangle", { wallThickness: 120 }).project;
assert.match(moveHouseSelections(pair, [{ kind: "room", id: roomAt(pair, 8000, 0).id }], 0, 500).blocked[0] ?? "", /shares a wall/, "nor is a room apart joined to another");

// Deleted: the room apart goes with its walls and door.
let gone = deleteHouseSelections(apart, [{ kind: "room", id: roomAt(apart, 8000, 0).id }], { footprintEditable: true });
assert.deepEqual(gone.blocked, [], "a room can be deleted");
assert.deepEqual(rooms(gone.project), ["0..6000 x 0..5000"]);
assert.equal(on(gone.project).length, 4, "and its walls with it");
assert.equal(gone.project.doors.filter((door) => door.levelId === ground).length, 0, "and its door");
// One of two halves: the wall it shares stays, the other half is untouched.
gone = deleteHouseSelections(halves, [{ kind: "room", id: roomAt(halves, 0, 0).id }], { footprintEditable: true });
assert.deepEqual(rooms(gone.project), ["3000..6000 x 0..5000", "8000..11000 x 0..3000"], "one half deleted");
assert.ok(wallAt(gone.project, vertical(3000)), "the wall it shared stays");
assert.ok(wallAt(gone.project, vertical(0)), "and so does the house's outline around it");
// The house itself, with a room apart: that room becomes the house, door kept where it was.
gone = deleteHouseSelections(apart, [{ kind: "room", id: roomAt(apart, 0, 0).id }], { footprintEditable: true });
assert.deepEqual(gone.blocked, []);
assert.deepEqual(rooms(gone.project), ["8000..11000 x 0..3000"], "the house deleted, the room apart remains");
assert.deepEqual(gone.project.levels[0]!.plan!.corners.map((corner) => [corner.x, corner.y]).sort(), [[11000, 0], [11000, 3000], [8000, 0], [8000, 3000]], "its walls are the outline now");
assert.equal(on(gone.project).length, 4, "four walls, not eight");
const keptDoor = gone.project.doors.filter((door) => door.levelId === ground);
assert.equal(keptDoor.length, 1, "its door kept");
const host = on(gone.project).find((wall) => wall.id === keptDoor[0]!.wallId)!;
const along = (wall: typeof host, offset: number) => wall.start.x + (wall.end.x - wall.start.x) * offset / Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
const centre = (wall: typeof host, door: typeof apartDoor) => along(wall, door.offset + door.width / 2);
assert.equal(host.start.y, 3000);
assert.equal(Math.round(centre(host, keptDoor[0]!)), Math.round(centre(apartBottom, apartDoor)), "in the same place on the same side");
// An L-shaped room apart, as drawn with the Room tool: moved, then deleted.
const ell = createRoomFromGesture(house, ground, { x: 8000, y: 1000 }, { x: 11000, y: 5000 }, "l-shape", { wallThickness: 120 }).project;
const ellId = ell.rooms.find((room) => room.levelId === ground && room.boundary.length === 6)!.id;
const ellWalls = on(ell).length;
const ellMoved = moveHouseSelections(ell, [{ kind: "room", id: ellId }], 0, -1000).project;
assert.equal(on(ellMoved).filter((wall) => Math.min(wall.start.y, wall.end.y) >= 0 && Math.max(wall.start.y, wall.end.y) <= 4000 && Math.min(wall.start.x, wall.end.x) >= 8000).length, ellWalls - 4, "an L-shaped room moves with all six walls");
assert.equal(on(deleteHouseSelections(ellMoved, [{ kind: "room", id: ellId }], { footprintEditable: true }).project).length, 4, "and is deleted with them");

// The only room on the floor: the floor is empty again.
const empty = deleteHouseSelections(house, [{ kind: "room", id: house.rooms[0]!.id }], { footprintEditable: true }).project;
assert.equal(on(empty).length, 0, "the last room deleted leaves open space");
assert.equal(empty.levels[0]!.plan, null);
assert.ok(establishLevelOutline(empty, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 4000, y: 4000 })), "ready to draw again");

console.log("House quick edit: rooms deleted and moved, split rooms, duplicate a partition, set a distance, extend and shorten from either end, drag an end, rotate 90°, dimension chains");
