/**
 * Rooms come from the walls, never from the walls' old vertices.
 *
 *   npx tsx scripts/room_topology_check.ts
 *
 * The bug this guards: moving a wall dragged the corners of the room polygons
 * near it, so the blue floor stretched, folded into triangles or collapsed.
 * Now every wall edit traces the rooms again — walls, junctions, closed
 * faces, rooms, floors — and these checks hold for each case the owner
 * listed: a rectangle with each of its four walls moved, two rooms side by
 * side, a T, four rooms sharing walls, an L, a wall split and one piece
 * moved, a wall pulled loose and joined again, and undo.
 *
 * For every room on every step: its outline is a simple closed polygon whose
 * every side lies on a wall's centreline; the rooms tile the walls' closed
 * faces exactly; the floor's triangles cover that outline and nothing else;
 * the ceiling and the plan's zone are the same outline.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShapeUtils, Vector2 } from "three";

import { PlanCanvas } from "../src/features/berchuma-studio/components/plan/plan-canvas";

import { rectangularRoom, roomSchema, type Room } from "../src/features/berchuma-studio/types/room";
import { createHouseObjectFromGesture, createRoomFromGesture, moveHouseSelections, roomOutline, splitHouseSelection } from "../src/features/house-designer/services/model-commands";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { establishLevelOutline, mergeRooms, openSpace, patchHouseObject } from "../src/features/house-designer/services/project-edit";
import { moveWallEnd, splitRoom } from "../src/features/house-designer/services/quick-edit";
import { deriveZones, planWallLines, signedArea, wallFaces } from "../src/features/house-designer/services/room-topology";
import { applyModelingOptions, modelingPreset } from "../src/features/house-designer/services/workspace-options";
import { createHouseProject, houseProjectSchema, type HouseProject } from "../src/features/house-designer/types/project";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

type Point = { x: number; y: number };
type Wall = HouseProject["walls"][number];

const base = openSpace(ensureHouseBimState(applyModelingOptions(createHouseProject({ title: "Topology", room: { ...rectangularRoom(6000, 4000), ceilingHeight: 3000 }, style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }), modelingPreset("house"))));
const ground = base.levels[0]!.id;
const planOf = (project: HouseProject) => project.levels.find((level) => level.id === ground)!.plan!;
const roomsOf = (project: HouseProject) => project.rooms.filter((room) => room.levelId === ground);
const wallsOf = (project: HouseProject) => project.walls.filter((wall) => wall.levelId === ground);
const box = (points: readonly Point[]) => { const xs = points.map((p) => p.x); const ys = points.map((p) => p.y); return `${Math.min(...xs)}..${Math.max(...xs)} x ${Math.min(...ys)}..${Math.max(...ys)}`; };
const area = (points: readonly Point[]) => Math.abs(signedArea(points));
const wallAt = (project: HouseProject, test: (wall: Wall) => boolean) => { const found = wallsOf(project).find(test); assert.ok(found, "(the wall is there)"); return found; };
const vertical = (x: number, from?: number, to?: number) => (wall: Wall) => Math.abs(wall.start.x - x) < 1 && Math.abs(wall.end.x - x) < 1 && (from === undefined || Math.abs(Math.min(wall.start.y, wall.end.y) - from) < 1) && (to === undefined || Math.abs(Math.max(wall.start.y, wall.end.y) - to) < 1);
const horizontal = (y: number, from?: number, to?: number) => (wall: Wall) => Math.abs(wall.start.y - y) < 1 && Math.abs(wall.end.y - y) < 1 && (from === undefined || Math.abs(Math.min(wall.start.x, wall.end.x) - from) < 1) && (to === undefined || Math.abs(Math.max(wall.start.x, wall.end.x) - to) < 1);
const moveWall = (project: HouseProject, wall: Wall, dx: number, dy: number) => moveHouseSelections(project, [{ kind: "wall", id: wall.id }], dx, dy, { footprintEditable: true }).project;

function onSegment(point: Point, a: Point, b: Point, tolerance = 1) {
  const dx = b.x - a.x; const dy = b.y - a.y; const length = Math.hypot(dx, dy);
  if (!length) return Math.hypot(point.x - a.x, point.y - a.y) <= tolerance;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length);
  return t >= -tolerance / length && t <= 1 + tolerance / length && Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / length <= tolerance;
}
function properlyCross(a: Point, b: Point, c: Point, d: Point) {
  const side = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** Everything that must hold of a floor's rooms, whatever was edited. */
function sound(project: HouseProject, label: string) {
  const plan = planOf(project);
  const walls = wallsOf(project);
  const rooms = roomsOf(project);
  const faces = wallFaces(planWallLines(plan));
  for (const room of rooms) {
    const points = room.boundary;
    ok(points.length >= 3 && area(points) > 100_000, `${label}: ${room.name} is a closed outline with an area (${(area(points) / 1e6).toFixed(2)} m²)`);
    // Simple: no side crosses another.
    const sides = points.map((point, index) => [point, points[(index + 1) % points.length]!] as const);
    ok(!sides.some(([a, b], i) => sides.some(([c, d], j) => j > i + 1 && !(i === 0 && j === sides.length - 1) && properlyCross(a, b, c, d))), `${label}: ${room.name}'s outline does not cross itself`);
    // Every side lies along a wall: no side joins two corners across the room.
    for (const [a, b] of sides) {
      // Along its whole length, though it may run along more than one wall.
      const along = Array.from({ length: 11 }, (_, step) => ({ x: a.x + ((b.x - a.x) * step) / 10, y: a.y + ((b.y - a.y) * step) / 10 }));
      const direction = Math.atan2(b.y - a.y, b.x - a.x);
      const parallel = (wall: Wall) => Math.abs(Math.sin(Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) - direction)) < 0.01;
      ok(along.every((point) => walls.some((wall) => parallel(wall) && onSegment(point, wall.start, wall.end, wall.thickness / 2 + 6))), `${label}: ${room.name}'s side ${Math.round(a.x)},${Math.round(a.y)} → ${Math.round(b.x)},${Math.round(b.y)} runs along walls`);
    }
    // The floor's triangles are the outline's: same area, each inside.
    const triangles = ShapeUtils.triangulateShape(points.map((point) => new Vector2(point.x, point.y)), []);
    const triangleArea = triangles.reduce((sum, [i, j, k]) => sum + area([points[i]!, points[j]!, points[k]!]), 0);
    ok(Math.abs(triangleArea - area(points)) < 1, `${label}: ${room.name}'s floor triangles cover exactly its outline`);
    // The ceiling and the plan's zone are the same outline.
    // (A room just drawn gets its ceiling with the next rebuild.)
    const ceiling = project.ceilings.find((item) => item.roomId === room.id);
    if (ceiling) equal(ceiling.boundary, points, `${label}: ${room.name}'s ceiling is its outline`);
    const zone = plan.zones?.find((item) => `${ground}:${item.id}` === room.id);
    if (zone) equal(zone.boundary, points, `${label}: ${room.name}'s plan zone is its outline`);
  }
  // The rooms are the walls' closed faces: each a face, none two.
  if (plan.zones?.length) {
    const faceArea = faces.reduce((sum, face) => sum + area(face), 0);
    const roomArea = rooms.reduce((sum, room) => sum + area(room.boundary), 0);
    ok(Math.abs(faceArea - roomArea) < 1, `${label}: the rooms (${(roomArea / 1e6).toFixed(2)} m²) fill the walls' closed faces (${(faceArea / 1e6).toFixed(2)} m²) exactly`);
    for (const room of rooms) ok(faces.some((face) => Math.abs(area(face) - area(room.boundary)) < 1 && box(face) === box(room.boundary)), `${label}: ${room.name} is one of the walls' faces`);
  }
  // No room is left with a floor or ceiling it does not have.
  ok(project.ceilings.filter((item) => item.levelId === ground).every((ceiling) => rooms.filter((room) => room.id === ceiling.roomId).length === 1), `${label}: every ceiling is over one enclosed room`);
  ok(roomSchema.safeParse(plan).success && houseProjectSchema.safeParse(JSON.parse(JSON.stringify(project))).success, `${label}: the plan saves`);
}
const isRectangle = (points: readonly Point[]) => points.length === 4 && points.every((point, index) => { const next = points[(index + 1) % 4]!; return Math.abs(point.x - next.x) < 0.01 || Math.abs(point.y - next.y) < 0.01; });

// ---------------------------------------------------------------------------
// 1. A rectangular room: each of its four walls moved, out and in.
// ---------------------------------------------------------------------------
const rectangle = establishLevelOutline(base, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 6000, y: 4000 }))!;
const only = roomsOf(rectangle)[0]!;
sound(rectangle, "rectangle");
const sides = [
  { name: "top", test: horizontal(0), dx: 0, dy: -1, expect: (d: number) => `0..6000 x ${-d}..4000` },
  { name: "right", test: vertical(6000), dx: 1, dy: 0, expect: (d: number) => `0..${6000 + d} x 0..4000` },
  { name: "bottom", test: horizontal(4000), dx: 0, dy: 1, expect: (d: number) => `0..6000 x 0..${4000 + d}` },
  { name: "left", test: vertical(0), dx: -1, dy: 0, expect: (d: number) => `${-d}..6000 x 0..4000` },
];
for (const side of sides) {
  for (const distance of [1000, -1500]) {
    const moved = moveWall(rectangle, wallAt(rectangle, side.test), side.dx * distance, side.dy * distance);
    const label = `rectangle, ${side.name} wall ${distance > 0 ? "out" : "in"} ${Math.abs(distance)}`;
    sound(moved, label);
    const rooms = roomsOf(moved);
    equal(rooms.map((room) => [room.id, room.name]), [[only.id, only.name]], `${label}: still the one room, its id and name kept`);
    ok(isRectangle(rooms[0]!.boundary), `${label}: four square corners, no diagonal`);
    equal(box(rooms[0]!.boundary), side.expect(distance), `${label}: the room is the walls' new rectangle`);
  }
}
// One after another: the room is where all four walls are.
{
  let project = rectangle;
  for (const side of sides) project = moveWall(project, wallAt(project, side.test), side.dx * 500, side.dy * 500);
  sound(project, "rectangle, all four out 500 in turn");
  equal(box(roomsOf(project)[0]!.boundary), "-500..6500 x -500..4500", "rectangle, all four out 500 in turn: 7000 × 5000");
  ok(isRectangle(roomsOf(project)[0]!.boundary), "and still four square corners");
}

// The same with a room drawn apart from the house: four inside walls.
{
  const drawn = createRoomFromGesture(rectangle, ground, { x: 8000, y: 0 }, { x: 11000, y: 3000 }, "rectangle");
  const apart = drawn.project;
  const room = roomsOf(apart).find((item) => item.id !== only.id)!;
  sound(apart, "room apart");
  equal(box(room.boundary), "8000..11000 x 0..3000", "(a 3 × 3 m room beside the house)");
  const own = [
    { name: "top", test: horizontal(0, 8000, 11000), dx: 0, dy: -700, expect: "8000..11000 x -700..3000" },
    { name: "right", test: vertical(11000), dx: 700, dy: 0, expect: "8000..11700 x 0..3000" },
    { name: "bottom", test: horizontal(3000, 8000, 11000), dx: 0, dy: 700, expect: "8000..11000 x 0..3700" },
    { name: "left", test: vertical(8000), dx: 700, dy: 0, expect: "8700..11000 x 0..3000" },
  ];
  for (const side of own) {
    const moved = moveWall(apart, wallAt(apart, side.test), side.dx, side.dy);
    const label = `room apart, ${side.name} wall moved`;
    sound(moved, label);
    const after = roomsOf(moved).find((item) => item.id === room.id);
    ok(after && isRectangle(after.boundary), `${label}: the room keeps its id and four square corners`);
    equal(after && box(after.boundary), side.expect, `${label}: and is the walls' new rectangle`);
    equal(box(roomsOf(moved).find((item) => item.id === only.id)!.boundary), "0..6000 x 0..4000", `${label}: the house's room does not move`);
  }
}

// ---------------------------------------------------------------------------
// 2. Two rooms side by side.
// ---------------------------------------------------------------------------
const two = splitRoom(rectangle, only.id, "vertical").project;
const [westId, eastId] = [...roomsOf(two)].sort((a, b) => Math.min(...a.boundary.map((p) => p.x)) - Math.min(...b.boundary.map((p) => p.x))).map((room) => room.id) as [string, string];
const names = new Map(roomsOf(two).map((room) => [room.id, room.name]));
sound(two, "two rooms");
{
  const partition = wallAt(two, vertical(3000));
  const moved = moveWall(two, partition, -1000, 0);
  sound(moved, "two rooms, partition moved");
  const byId = new Map(roomsOf(moved).map((room) => [room.id, room]));
  equal([box(byId.get(westId)!.boundary), box(byId.get(eastId)!.boundary)], ["0..2000 x 0..4000", "2000..6000 x 0..4000"], "two rooms, partition moved: each room follows the partition");
  equal(roomsOf(moved).map((room) => room.name).sort(), [...names.values()].sort(), "and both keep their names");
  // The outside wall moved in past the partition: the partition is outside
  // the house now and closes nothing, so there is one room, the house's.
  const past = moveWall(two, wallAt(two, vertical(6000)), -3500, 0);
  sound(past, "two rooms, outside wall moved past the partition");
  equal(roomsOf(past).map((room) => [room.id, box(room.boundary)]), [[westId, "0..2500 x 0..4000"]], "outside wall moved in past the partition: one room, the walls' 2500 × 4000");
  equal(planOf(past).zones!.filter((zone) => zone.enclosed === false).map((zone) => `${ground}:${zone.id}`), [eastId], "and the room it shut out is not enclosed");
  const wider = moveWall(two, wallAt(two, vertical(6000)), 1000, 0);
  sound(wider, "two rooms, outside wall moved");
  const after = new Map(roomsOf(wider).map((room) => [room.id, room]));
  equal([box(after.get(westId)!.boundary), box(after.get(eastId)!.boundary)], ["0..3000 x 0..4000", "3000..7000 x 0..4000"], "two rooms, outside wall moved: only the room on it grows");
  // The partition moved across the whole room and back: still two rooms, the same two.
  const back = moveWall(moveWall(two, partition, 2000, 0), wallAt(moveWall(two, partition, 2000, 0), vertical(5000)), -2000, 0);
  equal(roomsOf(back).map((room) => [room.id, box(room.boundary)]).sort(), roomsOf(two).map((room) => [room.id, box(room.boundary)]).sort(), "moved there and back: the same rooms, the same outlines");
}

// ---------------------------------------------------------------------------
// 3. A T: a wall ending on another.
// ---------------------------------------------------------------------------
const tee = splitRoom(two, eastId, "horizontal").project;
sound(tee, "T");
equal(roomsOf(tee).map((room) => box(room.boundary)).sort(), ["0..3000 x 0..4000", "3000..6000 x 0..2000", "3000..6000 x 2000..4000"], "(three rooms, the stem ending on the partition)");
{
  const stem = wallAt(tee, horizontal(2000, 3000, 6000));
  const down = moveWall(tee, stem, 0, 1000);
  sound(down, "T, stem moved");
  equal(roomsOf(down).map((room) => box(room.boundary)).sort(), ["0..3000 x 0..4000", "3000..6000 x 0..3000", "3000..6000 x 3000..4000"], "T, stem moved: the two rooms either side of it follow; the third is untouched");
  const bar = moveWall(tee, wallAt(tee, vertical(3000)), -500, 0);
  sound(bar, "T, the wall it ends on moved");
  equal(roomsOf(bar).map((room) => box(room.boundary)).sort(), ["0..2500 x 0..4000", "2500..6000 x 0..2000", "2500..6000 x 2000..4000"], "T, bar moved: the stem stays joined to it and all three rooms follow");
  ok(wallsOf(bar).some(horizontal(2000, 2500, 6000)), "(the stem was lengthened to meet the wall where it now is)");
}

// ---------------------------------------------------------------------------
// 4. Four rooms sharing walls: two walls crossing (an X).
// ---------------------------------------------------------------------------
const quad = (() => {
  const plan: Room = roomSchema.parse({
    ...rectangularRoom(6000, 4000), ceilingHeight: 3000,
    interiorWalls: [
      { id: "cross-v", start: { x: 3000, y: 0 }, end: { x: 3000, y: 4000 }, thickness: 100, height: 3000 },
      { id: "cross-h", start: { x: 0, y: 2000 }, end: { x: 6000, y: 2000 }, thickness: 100, height: 3000 },
    ],
    zones: [
      { id: "nw", name: "North-west", boundary: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }] },
      { id: "ne", name: "North-east", boundary: [{ x: 3000, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 3000, y: 2000 }] },
      { id: "se", name: "South-east", boundary: [{ x: 3000, y: 2000 }, { x: 6000, y: 2000 }, { x: 6000, y: 4000 }, { x: 3000, y: 4000 }] },
      { id: "sw", name: "South-west", boundary: [{ x: 0, y: 2000 }, { x: 3000, y: 2000 }, { x: 3000, y: 4000 }, { x: 0, y: 4000 }] },
    ],
  });
  return ensureHouseBimState(createHouseProject({ title: "Four", room: plan, style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }));
})();
sound(quad, "four rooms");
{
  const vMoved = moveWall(quad, wallAt(quad, vertical(3000)), 800, 0);
  sound(vMoved, "four rooms, crossing wall moved");
  equal(roomsOf(vMoved).map((room) => [room.name, box(room.boundary)]).sort(), [["North-east", "3800..6000 x 0..2000"], ["North-west", "0..3800 x 0..2000"], ["South-east", "3800..6000 x 2000..4000"], ["South-west", "0..3800 x 2000..4000"]], "four rooms, one crossing wall moved: all four follow, each a rectangle, each keeping its name");
  const both = moveWall(vMoved, wallAt(vMoved, horizontal(2000)), 0, -500);
  sound(both, "four rooms, both crossing walls moved");
  equal(roomsOf(both).map((room) => [room.name, box(room.boundary)]).sort(), [["North-east", "3800..6000 x 0..1500"], ["North-west", "0..3800 x 0..1500"], ["South-east", "3800..6000 x 1500..4000"], ["South-west", "0..3800 x 1500..4000"]], "and the other: the crossing point is wherever the two walls cross");
  ok(roomsOf(both).every((room) => isRectangle(room.boundary)), "no triangles at the crossing");
  // Selected and moved together: a crossing wall and the outside wall beside it.
  const together = moveHouseSelections(quad, [{ kind: "wall", id: wallAt(quad, vertical(3000)).id }, { kind: "wall", id: wallAt(quad, vertical(6000)).id }], 500, 0, { footprintEditable: true }).project;
  sound(together, "four rooms, two walls moved at once");
  equal(roomsOf(together).map((room) => [room.name, box(room.boundary)]).sort(), [["North-east", "3500..6500 x 0..2000"], ["North-west", "0..3500 x 0..2000"], ["South-east", "3500..6500 x 2000..4000"], ["South-west", "0..3500 x 2000..4000"]], "two walls at once: the same four rooms, where the walls ended up");
  // Both crossing walls moved diagonally: each slides along itself and one
  // end of each comes loose. One corner room still closes; the rest is one
  // L-shaped space — not four stretched floors.
  const loose = moveHouseSelections(quad, [{ kind: "wall", id: wallAt(quad, vertical(3000)).id }, { kind: "wall", id: wallAt(quad, horizontal(2000)).id }], 500, 500, { footprintEditable: true }).project;
  sound(loose, "four rooms, both walls moved diagonally");
  const left = roomsOf(loose);
  equal(left.map((room) => room.name).sort(), ["North-west", "South-east"], "diagonally: the corner that still closes, and the rest as one");
  equal(box(left.find((room) => room.name === "South-east")!.boundary), "3500..6000 x 2500..4000", "the corner room where the walls now close it");
  equal([left.find((room) => room.name === "North-west")!.boundary.length, area(left.find((room) => room.name === "North-west")!.boundary)], [6, 6000 * 4000 - 2500 * 1500], "the rest an L, six corners, all of the floor but that corner");
  equal(planOf(loose).zones!.filter((zone) => zone.enclosed === false).map((zone) => zone.name).sort(), ["North-east", "South-west"], "the two rooms whose walls came loose are kept, not enclosed");
}

// ---------------------------------------------------------------------------
// 5. L-shaped rooms: an L-shaped house, and an L left by a corner closet.
// ---------------------------------------------------------------------------
{
  const lPoints = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 3000, y: 2000 }, { x: 3000, y: 4000 }, { x: 0, y: 4000 }];
  const ell = establishLevelOutline(base, ground, lPoints)!;
  const room = roomsOf(ell)[0]!;
  sound(ell, "L house");
  const notch = wallAt(ell, horizontal(2000, 3000, 6000));
  const moved = moveWall(ell, notch, 0, 1000);
  sound(moved, "L house, inner wall moved");
  const after = roomsOf(moved)[0]!;
  equal([after.id, after.boundary.length, area(after.boundary)], [room.id, 6, 6000 * 3000 + 3000 * 1000], "L house, inner wall moved: the same room, six corners, the area of the new L");
  const leg = moveWall(ell, wallAt(ell, vertical(3000, 2000, 4000)), 1000, 0);
  sound(leg, "L house, other inner wall moved");
  equal(area(roomsOf(leg)[0]!.boundary), 6000 * 2000 + 4000 * 2000, "and the other inner wall: the new L's area");

  // A closet in a corner leaves an L.
  let closet = splitRoom(rectangle, only.id, "vertical", 4000).project;
  const strip = roomsOf(closet).find((item) => Math.min(...item.boundary.map((p) => p.x)) >= 4000)!;
  closet = splitRoom(closet, strip.id, "horizontal", 1500).project;
  // The strip's lower part joins the main room: take the short partition out by merging.
  const bottom = roomsOf(closet).find((item) => Math.min(...item.boundary.map((p) => p.y)) >= 1500 && Math.min(...item.boundary.map((p) => p.x)) >= 4000)!;
  const main = roomsOf(closet).find((item) => Math.max(...item.boundary.map((p) => p.x)) <= 4000)!;
  closet = mergeRooms(closet, main.id, bottom.id).project;
  sound(closet, "closet");
  const lRoom = roomsOf(closet).find((item) => item.id === main.id)!;
  equal([lRoom.boundary.length, area(lRoom.boundary)], [6, 6000 * 4000 - 2000 * 1500], "(an L-shaped room around a 2 × 1.5 m closet)");
  const front = wallAt(closet, horizontal(1500, 4000, 6000));
  const deeper = moveWall(closet, front, 0, 500);
  sound(deeper, "closet, front moved");
  const lAfter = roomsOf(deeper).find((item) => item.id === main.id)!;
  equal([lAfter.boundary.length, area(lAfter.boundary)], [6, 6000 * 4000 - 2000 * 2000], "closet, front moved: the L keeps six corners and loses what the closet gained");
  const closetRoom = roomsOf(closet).find((item) => item.id !== main.id)!;
  equal(box(roomsOf(deeper).find((item) => item.id === closetRoom.id)!.boundary), "4000..6000 x 0..2000", "and the closet, by its id, is the walls' new rectangle");
}

// ---------------------------------------------------------------------------
// 6. A wall split in two, one piece moved.
// ---------------------------------------------------------------------------
{
  const partition = wallAt(two, vertical(3000));
  const split = splitHouseSelection(two, { kind: "wall", id: partition.id });
  sound(split.project, "split wall");
  equal(roomsOf(split.project).map((room) => [room.id, box(room.boundary)]).sort(), roomsOf(two).map((room) => [room.id, box(room.boundary)]).sort(), "split wall: the same two rooms, the same outlines — splitting a wall changes no room");
  ok(roomsOf(split.project).every((room) => isRectangle(room.boundary)), "and no corner where the wall was split");
  const pieces = wallsOf(split.project).filter(vertical(3000));
  equal(pieces.length, 2, "(two pieces)");
  const lower = pieces.find((wall) => Math.min(wall.start.y, wall.end.y) >= 1999)!;
  const moved = moveWall(split.project, lower, 1000, 0);
  sound(moved, "split wall, one piece moved");
  equal(roomsOf(moved).map((room) => room.id).sort(), [westId, eastId].sort(), "split wall, one piece moved: still the two rooms, by id");
  const total = roomsOf(moved).reduce((sum, room) => sum + area(room.boundary), 0);
  ok(Math.abs(total - 6000 * 4000) < 1, "and together they are the whole floor, no gap, no overlap");
}

// ---------------------------------------------------------------------------
// 7. A wall pulled loose, then joined again.
// ---------------------------------------------------------------------------
{
  const partition = wallAt(two, vertical(3000));
  const top = Math.min(partition.start.y, partition.end.y) === partition.start.y ? "start" : "end";
  const loose = moveWallEnd(two, partition.id, top, { x: 3000, y: 1500 }).project;
  sound(loose, "loose wall");
  const enclosed = roomsOf(loose);
  equal(enclosed.length, 1, "loose wall: the two rooms are one space now — one floor");
  equal(box(enclosed[0]!.boundary), "0..6000 x 0..4000", "the whole outline, not a stretched or folded floor");
  ok(isRectangle(enclosed[0]!.boundary), "a clean rectangle");
  const open = planOf(loose).zones!.filter((zone) => zone.enclosed === false);
  equal(open.length, 1, "the other room is kept, marked not enclosed");
  ok(!roomsOf(loose).some((room) => room.id === `${ground}:${open[0]!.id}`), "with no floor or ceiling of its own");
  ok([westId, eastId].includes(`${ground}:${open[0]!.id}`) && names.get(`${ground}:${open[0]!.id}`) === open[0]!.name, "and its id and name");

  // The whole wall moved off the far wall: also loose.
  const offset = moveWall(two, partition, 0, 1500);
  sound(offset, "wall moved off");
  equal(roomsOf(offset).length, 1, "a wall moved clear of the wall it met: one room, one floor");

  // Joined again: the room comes back as it was.
  const loosePartition = wallAt(loose, vertical(3000));
  const joined = moveWallEnd(loose, loosePartition.id, top, { x: 3000, y: 0 }).project;
  sound(joined, "rejoined wall");
  equal(roomsOf(joined).map((room) => [room.id, room.name, box(room.boundary)]).sort(), roomsOf(two).map((room) => [room.id, room.name, box(room.boundary)]).sort(), "rejoined: both rooms back, the same ids, names and outlines");
  ok(planOf(joined).zones!.every((zone) => zone.enclosed === undefined), "and nothing left marked not enclosed");
  // Joined somewhere else: the room comes back with the new outline.
  const slanted = moveWallEnd(loose, loosePartition.id, top, { x: 4000, y: 0 }).project;
  sound(slanted, "rejoined elsewhere");
  equal(roomsOf(slanted).map((room) => room.id).sort(), [westId, eastId].sort(), "rejoined at another point: both rooms back by id");

  // A room's finishes come back with it.
  const finished = patchHouseObject(two, { kind: "room", id: open[0] ? `${ground}:${open[0].id}` : eastId }, { floorMaterial: "Oak parquet" });
  const away = moveWallEnd(finished, partition.id, top, { x: 3000, y: 1500 }).project;
  const back = moveWallEnd(away, wallAt(away, vertical(3000)).id, top, { x: 3000, y: 0 }).project;
  equal(roomsOf(back).find((room) => room.id === `${ground}:${open[0]!.id}`)?.floorMaterial, "Oak parquet", "and its floor finish");
}

// ---------------------------------------------------------------------------
// 7b. While a room is not enclosed, the plan says so and nothing else uses it.
// ---------------------------------------------------------------------------
{
  const partition = wallAt(two, vertical(3000));
  const top = Math.min(partition.start.y, partition.end.y) === partition.start.y ? "start" : "end";
  const loose = moveWallEnd(two, partition.id, top, { x: 3000, y: 1500 }).project;
  const open = planOf(loose).zones!.find((zone) => zone.enclosed === false)!;
  const markup = renderToStaticMarkup(createElement(PlanCanvas, { room: planOf(loose), onChange: () => {} }));
  ok(markup.includes(`data-zone-open="${open.id}"`) && markup.includes(`${open.name} · Room not enclosed`), "the plan labels the room not enclosed");
  const polygons = [...markup.matchAll(/<polygon points="([^"]+)" class="fill-sky-500/g)].map((match) => match[1]);
  equal(polygons.length, 1, "and draws one floor: the enclosed room's, none for the room that is not");
  // A split whose middle falls where the room that is not enclosed was
  // divides the space that is there, and makes no room that is not.
  const across = splitRoom(loose, roomsOf(loose)[0]!.id, "vertical", 1500).project;
  sound(across, "split across where a room was");
  equal(planOf(across).zones!.filter((zone) => zone.enclosed === false).map((zone) => zone.id), planOf(loose).zones!.filter((zone) => zone.enclosed === false).map((zone) => zone.id), "split across where a room was: no new room comes out not enclosed");
  equal(roomsOf(across).length, 2, "and the space is in two");
  // Splitting the enclosed space divides it, not the room that is not there.
  const big = roomsOf(loose)[0]!;
  const divided = splitRoom(loose, big.id, "horizontal").project;
  sound(divided, "split while a room is not enclosed");
  // The loose wall now ends on the new one: below it, it divides the space again.
  equal(roomsOf(divided).map((room) => box(room.boundary)).sort(), ["0..3000 x 2000..4000", "0..6000 x 0..2000", "3000..6000 x 2000..4000"], "splitting the open space while a room is not enclosed: the rooms are what the walls now close");
  ok(roomsOf(divided).some((room) => room.id === big.id), "and the space's room is one of them");
}

// ---------------------------------------------------------------------------
// 7c. A wall dragged to close off new ground makes a new room there.
// ---------------------------------------------------------------------------
{
  const stubbed = createHouseObjectFromGesture(rectangle, "wall", ground, { x: 3000, y: 0 }, { x: 3000, y: 2000 }).project;
  sound(stubbed, "stub wall");
  equal(roomsOf(stubbed).length, 1, "(a wall from the top wall into the room divides nothing)");
  const stub = wallAt(stubbed, vertical(3000));
  const end = Math.max(stub.start.y, stub.end.y) === stub.end.y ? "end" : "start";
  const closed = moveWallEnd(stubbed, stub.id, end, { x: 3000, y: 4000 }).project;
  sound(closed, "stub wall dragged to the far wall");
  const after = roomsOf(closed);
  equal(after.length, 2, "dragged to the far wall it divides the room in two");
  ok(after.some((room) => room.id === only.id && room.name === only.name), "the room keeps its id and name for one half");
  ok(after.some((room) => room.id !== only.id && /^Room \d+$/.test(room.name)), "and the other half is a new room");
  // And pulled back, the new room is not enclosed; the first is whole again.
  const reopened = moveWallEnd(closed, wallAt(closed, vertical(3000)).id, end, { x: 3000, y: 2000 }).project;
  equal(roomsOf(reopened).map((room) => [room.id, box(room.boundary)]), [[only.id, "0..6000 x 0..4000"]], "pulled back: the first room is whole again");
}

// ---------------------------------------------------------------------------
// 7c'. Walls moved together are traced where they end up: a room closed only
// on the way is not left behind.
// ---------------------------------------------------------------------------
{
  let project = createHouseObjectFromGesture(rectangle, "wall", ground, { x: 3000, y: 0 }, { x: 3000, y: 2500 }).project;
  project = createHouseObjectFromGesture(project, "wall", ground, { x: 3500, y: 2000 }, { x: 6000, y: 2000 }).project;
  sound(project, "two loose walls");
  equal(roomsOf(project).length, 1, "(two walls that do not meet: one room)");
  const pair = [wallAt(project, vertical(3000)), wallAt(project, horizontal(2000, 3500, 6000))].map((wall) => ({ kind: "wall" as const, id: wall.id }));
  // Moved right together, the first meets the second on the way, the
  // second then moves on from it: they never close a room where they end.
  const moved = moveHouseSelections(project, pair, 500, 0, { footprintEditable: true }).project;
  sound(moved, "two loose walls moved together");
  equal(roomsOf(moved).map((room) => room.id), [only.id], "moved together: still the one room");
  equal(planOf(moved).zones!.length, 1, "and no room closed only on the way is left behind");
}

// ---------------------------------------------------------------------------
// 7d. A room whose walls all moved together, farther than it is wide.
// ---------------------------------------------------------------------------
{
  const plan = roomSchema.parse({ ...rectangularRoom(20000, 6000), interiorWalls: [
    { id: "a", start: { x: 1000, y: 1000 }, end: { x: 4000, y: 1000 }, thickness: 100, height: 2700 },
    { id: "b", start: { x: 4000, y: 1000 }, end: { x: 4000, y: 4000 }, thickness: 100, height: 2700 },
    { id: "c", start: { x: 4000, y: 4000 }, end: { x: 1000, y: 4000 }, thickness: 100, height: 2700 },
    { id: "d", start: { x: 1000, y: 4000 }, end: { x: 1000, y: 1000 }, thickness: 100, height: 2700 },
  ], zones: [
    { id: "hall", name: "Hall", boundary: [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 6000 }, { x: 0, y: 6000 }] },
    { id: "box", name: "Box", boundary: [{ x: 1000, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 4000 }, { x: 1000, y: 4000 }] },
  ] });
  const shifted = { ...plan, interiorWalls: plan.interiorWalls!.map((wall) => ({ ...wall, start: { x: wall.start.x + 6000, y: wall.start.y }, end: { x: wall.end.x + 6000, y: wall.end.y } })) };
  const zones = deriveZones(plan, shifted)!;
  equal(box(zones.find((zone) => zone.id === "box")!.boundary), "7000..10000 x 1000..4000", "a room moved with all its walls, farther than it is wide, is the same room where its walls are");
  equal(zones.length, 2, "and no new room is made for it");
}

// ---------------------------------------------------------------------------
// 8. Undo and redo: each step's walls and rooms, as they were.
// ---------------------------------------------------------------------------
{
  const snapshot = JSON.stringify(two);
  const moved = moveWall(two, wallAt(two, vertical(3000)), 1200, 0);
  equal(JSON.stringify(two), snapshot, "undo: the step before is untouched by the edit — its walls, rooms and plan, as they were");
  const redo = moveWall(two, wallAt(two, vertical(3000)), 1200, 0);
  equal(JSON.stringify({ ...redo, rooms: redo.rooms, levels: redo.levels }), JSON.stringify({ ...moved, rooms: moved.rooms, levels: moved.levels }), "redo: the same edit gives the same walls and rooms");
  sound(JSON.parse(snapshot) as HouseProject, "undone");
}

// ---------------------------------------------------------------------------
// 9. Joints, directly: an end inside a wall it meets is joined to it.
// ---------------------------------------------------------------------------
{
  // An inside wall drawn to the face of the outside wall (75 mm short of its
  // centre) still closes the room.
  const plan = roomSchema.parse({ ...rectangularRoom(6000, 4000), interiorWalls: [{ id: "short", start: { x: 3000, y: 75 }, end: { x: 3000, y: 3925 }, thickness: 100, height: 2700 }] });
  equal(wallFaces(planWallLines(plan)).map((face) => box(face)).sort(), ["0..3000 x 0..4000", "3000..6000 x 0..4000"], "a wall ending on the inside face of another is joined to it (a T)");
  const gap = roomSchema.parse({ ...rectangularRoom(6000, 4000), interiorWalls: [{ id: "short", start: { x: 3000, y: 400 }, end: { x: 3000, y: 4000 }, thickness: 100, height: 2700 }] });
  equal(wallFaces(planWallLines(gap)).map((face) => box(face)), ["0..6000 x 0..4000"], "one that stops short is not: no room closes");
  // Corners that miss each other by a few centimetres, neither on the
  // other's line: joined end to end.
  const missed = roomSchema.parse({ ...rectangularRoom(20000, 6000), interiorWalls: [
    { id: "a", start: { x: 1000, y: 1000 }, end: { x: 3970, y: 1000 }, thickness: 100, height: 2700 },
    { id: "b", start: { x: 4000, y: 1030 }, end: { x: 4000, y: 3970 }, thickness: 100, height: 2700 },
    { id: "c", start: { x: 3970, y: 4000 }, end: { x: 1030, y: 4000 }, thickness: 100, height: 2700 },
    { id: "d", start: { x: 1000, y: 3970 }, end: { x: 1000, y: 1030 }, thickness: 100, height: 2700 },
  ] });
  const boxed = wallFaces(planWallLines(missed));
  equal(boxed.length, 2, "corners that just miss each other are joined: the box closes inside the hall");
  ok(boxed.some((face) => Math.abs(area(face) - 3000 * 3000) < 30 * 3000 * 4), "a room of about 3 × 3 m");
  const crossing = roomSchema.parse({ ...rectangularRoom(6000, 4000), interiorWalls: [{ id: "a", start: { x: 1000, y: 0 }, end: { x: 5000, y: 4000 }, thickness: 100, height: 2700 }, { id: "b", start: { x: 5000, y: 0 }, end: { x: 1000, y: 4000 }, thickness: 100, height: 2700 }] });
  const crossed = wallFaces(planWallLines(crossing));
  equal(crossed.length, 4, "two walls crossing (an X) make four faces");
  ok(Math.abs(crossed.reduce((sum, face) => sum + area(face), 0) - 6000 * 4000) < 1, "that fill the floor");
}

console.log(`Room topology: ${checks} checks — rooms traced from the walls after every edit: a rectangle's four walls each moved, two rooms, a T, four rooms at a crossing, L shapes, a split wall, a wall pulled loose and joined again, undo and redo`);
