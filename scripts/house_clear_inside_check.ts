/**
 * Floor finishes are measured between wall faces, not to the centre-lines a
 * room boundary follows.
 *
 *   npx tsx scripts/house_clear_inside_check.ts
 */
import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { clearInsideArea, clearInsideBoundary } from "../src/features/house-designer/services/clear-inside";
import { calculateHouseQuantities } from "../src/features/house-designer/services/quantities";
import { createHouseProject } from "../src/features/house-designer/types/project";

let checks = 0;
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} (got ${actual}, wanted ${expected})`);
  checks += 1;
};
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const wall = (x1: number, y1: number, x2: number, y2: number, thickness: number) => ({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness });
const square = (w: number, d: number) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }];
const around = (w: number, d: number, t: number) => [wall(0, 0, w, 0, t), wall(w, 0, w, d, t), wall(w, d, 0, d, t), wall(0, d, 0, 0, t)];

// A 4 x 5 m room with 150 mm walls has 3.85 x 4.85 m between the faces.
near(clearInsideArea(square(4000, 5000), around(4000, 5000, 150)).area, 3.85 * 4.85, "4 x 5 m room, 150 mm walls");
equal(clearInsideArea(square(4000, 5000), around(4000, 5000, 150)).exact, true, "and it is exact");

// Either winding gives the same answer.
near(clearInsideArea([...square(4000, 5000)].reverse(), around(4000, 5000, 150)).area, 3.85 * 4.85, "clockwise boundary");

// Each edge uses its own wall: 200 mm long walls, 100 mm short ones.
{
  const walls = [wall(0, 0, 4000, 0, 200), wall(4000, 0, 4000, 5000, 100), wall(4000, 5000, 0, 5000, 200), wall(0, 5000, 0, 0, 100)];
  near(clearInsideArea(square(4000, 5000), walls).area, (4000 - 100) * (5000 - 200) / 1e6, "walls of different thickness");
}

// An edge with no wall on it (open space) stays on the boundary.
{
  const walls = [wall(0, 0, 4000, 0, 200), wall(4000, 0, 4000, 5000, 200), wall(0, 5000, 0, 0, 200)];
  near(clearInsideArea(square(4000, 5000), walls).area, (4000 - 200) * (5000 - 100) / 1e6, "open side keeps its full length");
}

// An L shaped room: area is the L less half of every wall around it.
{
  const L = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 3000, y: 3000 }, { x: 3000, y: 5000 }, { x: 0, y: 5000 }];
  const walls = L.map((from, index) => { const to = L[(index + 1) % L.length]!; return wall(from.x, from.y, to.x, to.y, 200); });
  // Inside faces: x 100..5900 for the top arm, y 100..2900; lower arm x 100..2900 down to y 4900.
  const expected = (5900 - 100) * (2900 - 100) + (2900 - 100) * (4900 - 2900);
  near(clearInsideArea(L, walls).area, expected / 1e6, "L shaped room, 200 mm walls");
}

// Collinear points on an edge (a wall split in two) change nothing.
near(
  clearInsideArea([{ x: 0, y: 0 }, { x: 1800, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 5000 }, { x: 0, y: 5000 }], around(4000, 5000, 150)).area,
  3.85 * 4.85,
  "a boundary with a point in the middle of an edge",
);

// Walls that fill the room give no floor, and the answer says it is not exact
// rather than a negative or inside out area.
{
  const small = clearInsideBoundary(square(300, 300), around(300, 300, 400));
  equal(small.exact, false, "a room smaller than its walls is not measured exactly");
  equal(small.polygon, square(300, 300), "and the boundary is returned as it was");
}

// Not a polygon.
equal(clearInsideBoundary([{ x: 0, y: 0 }, { x: 1, y: 1 }], []).exact, false, "two points are not a room");

// The boundary handed in is not changed.
{
  const boundary = square(4000, 5000);
  const snapshot = JSON.stringify(boundary);
  clearInsideBoundary(boundary, around(4000, 5000, 150));
  equal(JSON.stringify(boundary), snapshot, "the input is left alone");
}

// The quantity: FIN-02 is the floor between the faces, per level.
{
  const project = createHouseProject({ title: "Clear", room: rectangularRoom(4000, 5000), style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 });
  const thickness = project.walls[0]!.thickness;
  const row = calculateHouseQuantities(project).find((item) => item.code === "FIN-02")!;
  near(row.quantity, (4000 - thickness) * (5000 - thickness) / 1e6, "FIN-02 for one room", 1e-9);
  ok(row.quantity < 20, "and it is less than the centre-line 20 m²");

  const two = createHouseProject({ title: "Clear two", room: rectangularRoom(4000, 5000), style: "modern", strict: false, floorCount: 2, floorToFloorHeight: 3000 });
  const both = calculateHouseQuantities(two).find((item) => item.code === "FIN-02")!;
  near(both.quantity, 2 * (4000 - thickness) * (5000 - thickness) / 1e6, "FIN-02 sums a room on each level", 1e-9);
}

console.log(`Clear inside: ${checks} checks passed.`);
