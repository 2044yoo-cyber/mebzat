/**
 * The plain geometry the construction model is built on: the area of a union of
 * shapes, and the one formula for a pitched roof that both the roof generator
 * and the building configurator read.
 *
 *   npx tsx scripts/construction_geometry_check.ts
 *
 * Expected numbers are worked out here by hand, not read back from the code.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { polygonArea, unionArea, type P2 } from "../src/features/house-designer/construction/geometry";
import { clipThrough, clipToRegion, offsetPolygon, rectRegion } from "../src/features/house-designer/construction/region";
import { OVERHANG, PITCH_DEG, PLATE, pitchedCover } from "../src/features/house-designer/construction/roof-geometry";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

// ---------------------------------------------------------------------------
// Slivers: a beam lying along the edge of a region adds nothing and costs nothing
// ---------------------------------------------------------------------------
{
  const rect = (x0: number, y0: number, x1: number, y1: number): P2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  near(unionArea([rect(0, 0, 4000, 3000), rect(2000, 0, 6000, 3000)]), 18e6, "two overlapping rectangles are counted once", 1e-3);
  near(unionArea([rect(0, 0, 4000, 3000), rect(4000, 0, 4000, 3000), rect(0, 3000, 4000, 3000)]), 12e6, "zero-width slivers along the edges add nothing", 1e-3);
  const many = [rect(0, 0, 8000, 6000), ...Array.from({ length: 300 }, (_, i) => rect(i * 20, 0, i * 20 + 150, 0)), ...Array.from({ length: 300 }, (_, i) => rect(i * 20, 6000, i * 20 + 150, 6000))];
  const t0 = Date.now();
  near(unionArea(many), 48e6, "hundreds of slivers leave the area as it was", 1e-3);
  ok(Date.now() - t0 < 1000, `and take no time (${Date.now() - t0} ms)`);
  // A frame of beams and columns, as the slab above it sees it: 7 × 4 columns 300 mm square on a 3 m grid and the 250 mm beams between them.
  // Worked out by hand: 28 columns × 0.09 m² + 21 + 24 beams × 2.7 m × 0.25 m = 2.52 + 14.175 + 16.2 = 32.895 m².
  const frame: P2[][] = [];
  for (let i = 0; i < 7; i += 1) for (let j = 0; j < 3; j += 1) frame.push(rect(i * 3000 - 125, j * 3000 + 150, i * 3000 + 125, (j + 1) * 3000 - 150));
  for (let j = 0; j < 4; j += 1) for (let i = 0; i < 6; i += 1) frame.push(rect(i * 3000 + 150, j * 3000 - 125, (i + 1) * 3000 - 150, j * 3000 + 125));
  for (let i = 0; i < 7; i += 1) for (let j = 0; j < 4; j += 1) frame.push(rect(i * 3000 - 150, j * 3000 - 150, i * 3000 + 150, j * 3000 + 150));
  const t1 = Date.now();
  near(unionArea(frame), 32.895e6, "a frame of beams and columns has the area worked out by hand", 1e-3);
  ok(Date.now() - t1 < 150, `and the rectangles are added up in one pass, not cut against one another (${Date.now() - t1} ms)`);
  // A triangle is not its bounding box. Triangle (0,0) (4 m,0) (0,3 m) is 6 m²; the 4 m × 1 m rectangle from x = 2 m overlaps it in
  // 2.667 m × 1 m + ½ × 1.333 m × 1 m = 1.333 m², so together they cover 6 + 4 − 1.333 = 8.667 m².
  const slanted: P2[] = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 0, y: 3000 }];
  near(unionArea([slanted, rect(2000, 0, 6000, 1000)]), 6e6 + 4e6 - 4e6 / 3, "a triangle and a rectangle that overlap it are not mistaken for two rectangles", 1);
  near(unionArea([slanted, rect(0, 0, 4000, 3000)]), 12e6, "and a triangle inside a rectangle adds nothing", 1e-3);
}

// ---------------------------------------------------------------------------
// Regions: a polygon moved out or in, and lines drawn across it
// ---------------------------------------------------------------------------
{
  const rect = rectRegion({ x0: 0, y0: 0, x1: 4000, y1: 3000 });
  const grown = offsetPolygon(rect, 100);
  near(polygonArea(grown), 4200 * 3200, "a rectangle moved out by 100 mm is 100 mm bigger on every side", 1e-6);
  near(polygonArea(offsetPolygon(rect, -100)), 3800 * 2800, "and moved in by 100 mm 100 mm smaller", 1e-6);
  near(polygonArea(offsetPolygon([...rect].reverse(), 100)), 4200 * 3200, "whichever way round it is drawn", 1e-6);
  // An L, 12 m²: moved out by 100 mm it gains its perimeter × 100 mm, plus a square at each of its 5 outside corners, less one at its inside corner.
  const ell: P2[] = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 }];
  near(polygonArea(ell), 12e6, "the L is 12 m²", 1e-6);
  near(polygonArea(offsetPolygon(ell, 100)), 12e6 + 16000 * 100 + (5 - 1) * 100 * 100, "and moved out by 100 mm gains its perimeter times that, and a square at each outside corner less one at the inside corner", 1e-3);
  near(polygonArea(offsetPolygon(ell, 0)), 12e6, "moved by nothing it is the same", 1e-6);
  // A corner that is not a right angle is mitred: the edges stay a constant 100 mm from where they were. A right triangle with 4 m legs is 8 m², its
  // perimeter 8 m + 4√2 m; each corner adds a kite of d² × tan(half the turn), and the turns are 90°, 135° and 135°: 1 + 2 × (1 + √2) = 3 + 2√2.
  const triangle: P2[] = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 0, y: 4000 }];
  near(polygonArea(offsetPolygon(triangle, 100)), 8e6 + (8000 + 4000 * Math.SQRT2) * 100 + (3 + 2 * Math.SQRT2) * 100 * 100, "a triangle moved out by 100 mm gains its perimeter times that and a kite at each corner", 1e-3);
  // Moved in by 100 mm it is the same triangle smaller, in the ratio of (inradius − 100) to the inradius; the inradius is (4000 + 4000 − 4000√2) ÷ 2.
  const inradius = 4000 - 2000 * Math.SQRT2;
  near(polygonArea(offsetPolygon(triangle, -100)), 8e6 * ((inradius - 100) / inradius) ** 2, "and moved in by 100 mm it is the same triangle, smaller in the ratio of the inradius less 100 mm to the inradius", 1e-3);
  // A needle: the mitre at its point is limited, not run out to a spike ten metres long.
  const needle: P2[] = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 200 }];
  const grownNeedle = offsetPolygon(needle, 100);
  ok(grownNeedle.every((p, i) => Math.hypot(p.x - needle[i]!.x, p.y - needle[i]!.y) < 400), `a needle moved out by 100 mm does not grow a spike (${grownNeedle.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ")})`);
  // A line across a rectangle with a hole in it: the two parts either side of the hole, and nothing outside.
  const hole = rectRegion({ x0: 1000, y0: 1000, x1: 2000, y1: 2000 });
  const parts = clipToRegion({ x: -1000, y: 1500 }, { x: 5000, y: 1500 }, rect, [hole]);
  ok(parts.length === 2 && Math.abs(parts[0]![0] - 1 / 6) < 1e-9 && Math.abs(parts[0]![1] - 2 / 6) < 1e-9 && Math.abs(parts[1]![0] - 3 / 6) < 1e-9 && Math.abs(parts[1]![1] - 5 / 6) < 1e-9, `a line across a rectangle with a hole in it is cut into the two parts that are in the concrete (${JSON.stringify(parts)})`);
  ok(clipToRegion({ x: -1000, y: 5000 }, { x: 5000, y: 5000 }, rect).length === 0, "a line that misses the region gives nothing");
  const through = clipThrough({ x: 3000, y: -500 }, { x: 3000, y: 3500 }, 0.5, rect, [hole]);
  ok(through !== null && Math.abs(through[0] - 0.125) < 1e-9 && Math.abs(through[1] - 0.875) < 1e-9, "the part of a line through a point is the part that holds that point");
  ok(clipThrough({ x: 1500, y: -500 }, { x: 1500, y: 3500 }, 0.5, rect, [hole]) === null, "and nothing when the point is in a hole");
  // A line across an L is cut where the L is not.
  const across = clipToRegion({ x: -500, y: 3000 }, { x: 4500, y: 3000 }, ell);
  ok(across.length === 1 && Math.abs(across[0]![0] - 0.1) < 1e-9 && Math.abs(across[0]![1] - 0.5) < 1e-9, "a line across the arm of an L stops at the end of the arm");
}

// ---------------------------------------------------------------------------
// A frame that once never finished: the east half of the slab of a 16 m × 12 m villa
// ---------------------------------------------------------------------------
// The beams and columns under one pour zone, as the slab above them asks for them: a beam lying along the edge of the zone comes out of the
// clipping as a polygon of repeated points with no area, and the general method used to cut every other shape against it without end.
const villaEastZone: P2[][] = [
  [{x:8650,y:0},{x:8650,y:0},{x:8650,y:175},{x:8650,y:175}],
  [{x:8650,y:0},{x:11850,y:0},{x:11850,y:175},{x:8650,y:175}],
  [{x:11850,y:0},{x:16000,y:0},{x:16000,y:175},{x:11850,y:175}],
  [{x:8650,y:5325},{x:8650,y:5325},{x:8650,y:5675},{x:8650,y:5675}],
  [{x:8650,y:5325},{x:11850,y:5325},{x:11850,y:5675},{x:8650,y:5675}],
  [{x:11850,y:5325},{x:16000,y:5325},{x:16000,y:5675},{x:11850,y:5675}],
  [{x:8650,y:12000},{x:8650,y:11825},{x:8650,y:11825},{x:8650,y:12000}],
  [{x:8650,y:12000},{x:8650,y:11825},{x:11850,y:11825},{x:11850,y:12000}],
  [{x:11850,y:12000},{x:11850,y:11825},{x:16000,y:11825},{x:16000,y:12000}],
  [{x:8650,y:0},{x:8825,y:0},{x:8825,y:5500},{x:8650,y:5500}],
  [{x:8650,y:5500},{x:8825,y:5500},{x:8825,y:12000},{x:8650,y:12000}],
  [{x:12025,y:0},{x:12025,y:5500},{x:11675,y:5500},{x:11675,y:0}],
  [{x:12025,y:5500},{x:12025,y:12000},{x:11675,y:12000},{x:11675,y:5500}],
  [{x:16000,y:0},{x:16000,y:5500},{x:15825,y:5500},{x:15825,y:0}],
  [{x:16000,y:5500},{x:16000,y:12000},{x:15825,y:12000},{x:15825,y:5500}],
  [{x:8650,y:0},{x:8800,y:0},{x:8800,y:150},{x:8650,y:150}],
  [{x:8650,y:5350},{x:8800,y:5350},{x:8800,y:5650},{x:8650,y:5650}],
  [{x:8650,y:12000},{x:8650,y:11850},{x:8800,y:11850},{x:8800,y:12000}],
  [{x:11700,y:0},{x:12000,y:0},{x:12000,y:150},{x:11700,y:150}],
  [{x:11700,y:5350},{x:12000,y:5350},{x:12000,y:5650},{x:11700,y:5650}],
  [{x:11700,y:12000},{x:11700,y:11850},{x:12000,y:11850},{x:12000,y:12000}],
  [{x:15850,y:0},{x:16000,y:0},{x:16000,y:150},{x:15850,y:150}],
  [{x:15850,y:5350},{x:16000,y:5350},{x:16000,y:5650},{x:15850,y:5650}],
  [{x:15850,y:12000},{x:15850,y:11850},{x:16000,y:11850},{x:16000,y:12000}],
];
{
  // Worked out by counting 25 mm squares, which every coordinate above is a multiple of: a different method from the one under test.
  const cell = 25;
  let covered = 0;
  for (let x = 8650; x < 16000; x += cell) for (let y = 0; y < 12000; y += cell) {
    const cx = x + cell / 2; const cy = y + cell / 2;
    if (villaEastZone.some((poly) => { const xs = poly.map((p) => p.x); const ys = poly.map((p) => p.y); return cx > Math.min(...xs) && cx < Math.max(...xs) && cy > Math.min(...ys) && cy < Math.max(...ys); })) covered += cell * cell;
  }
  near(unionArea(villaEastZone), covered, "the frame under the east half of the villa slab has the area counted square by square", 1e-3);
  // In a child process with a time limit, so that a method that never finishes fails here and does not hang the run.
  const tsx = join(process.cwd(), "node_modules/tsx/dist/cli.mjs");
  const code = `import { unionArea } from ${JSON.stringify(join(process.cwd(), "src/features/house-designer/construction/geometry.ts"))}; const zone = ${JSON.stringify(villaEastZone)}; console.log(unionArea(zone));`;
  const started = Date.now();
  const child = spawnSync(process.execPath, [tsx, "-e", code], { timeout: 30000, encoding: "utf8" });
  ok(child.status === 0 && Math.abs(Number(child.stdout.trim()) - covered) < 1e-3, `and is added up in a moment, not left running (${Date.now() - started} ms, ${child.signal ?? "finished"})`);
}

// ---------------------------------------------------------------------------
// The pitched roof: one formula for the area drawn and the area quoted
// ---------------------------------------------------------------------------
{
  // Worked out by hand for a 12 m × 9 m building at 25°: the covering overhangs the gables by 450 mm and the eaves by
  // 450 mm beyond the wall plates, which stand 100 mm in from the slab edge.
  const cover = pitchedCover(12000, 9000);
  near(cover.spanY, 9000 - 2 * PLATE, "the span between the plates is the depth less a plate at each side");
  near(cover.plan, (12000 + 2 * OVERHANG) * (9000 - 2 * PLATE + 2 * OVERHANG) * 1e-6, "the covering in plan is 12.9 m × 9.7 m");
  near(cover.plan, 125.13, "which is 125.13 m²", 1e-9);
  near(cover.sloped, 125.13 / Math.cos((PITCH_DEG * Math.PI) / 180), "and along the slope it is longer by the pitch", 1e-9);
  ok(cover.sloped > cover.plan * 1.1 && cover.sloped < cover.plan * 1.12, "about 10 % more at 25 degrees");
  const bigger = pitchedCover(16000, 12000);
  near(bigger.plan - cover.plan, (16900 * 12700 - 12900 * 9700) * 1e-6, "a bigger building has the extra area the extra length and depth add", 1e-9);
}

console.log(`Construction geometry: ${checks} checks passed.`);
