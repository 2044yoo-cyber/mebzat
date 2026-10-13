/**
 * Freehand Sketch dimensions are drawn the way a plan draws them.
 *
 *   npx tsx scripts/freehand_dimensions_check.ts
 *
 * The owner asked for architectural, small dimensions: they were large
 * rounded bubbles ("≈ 1.41 m", 13 px bold in a 22 px box) that covered the
 * walls and each other. Now each wall has a thin dimension line parallel to
 * it, extension lines from its ends, a 45° tick at each end and its length
 * in millimetres, 10 px, along the line and upright. Checked here on the
 * layout the canvas draws, in screen pixels.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DIMENSION_STYLE, dimensionText, layoutDimensions } from "../src/features/house-designer/services/freehand-dimensions";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const near = (a: number, b: number, message: string, tolerance = 0.01) => ok(Math.abs(a - b) <= tolerance, `${message} (${a.toFixed(3)} ≈ ${b})`);
type Point = { x: number; y: number };
const measure = (text: string) => text.length * 6;
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Point) => Math.hypot(v.x, v.y);
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

// Text: millimetres, ≈ only while the scale is a guess.
ok(dimensionText(1410.4, true) === "1410", "a calibrated wall reads 1410, in mm");
ok(dimensionText(1409.6, false) === "≈1410", "an uncalibrated one ≈1410");
ok(DIMENSION_STYLE.font <= 10, `small text: ${DIMENSION_STYLE.font} px, not 13 px bold in a bubble`);

// One wall, each way round: horizontal, vertical both ways, diagonal.
for (const [label, start, end] of [
  ["horizontal", { x: 100, y: 200 }, { x: 300, y: 200 }],
  ["horizontal, drawn right to left", { x: 300, y: 200 }, { x: 100, y: 200 }],
  ["vertical, down", { x: 100, y: 100 }, { x: 100, y: 300 }],
  ["vertical, up", { x: 100, y: 300 }, { x: 100, y: 100 }],
  ["diagonal", { x: 100, y: 100 }, { x: 260, y: 220 }],
] as const) {
  const [dimension] = layoutDimensions([{ start, end }], [1410], true, measure);
  ok(dimension, `${label}: dimensioned`);
  const wall = sub(end, start);
  const along = { x: wall.x / len(wall), y: wall.y / len(wall) };
  const [a, b] = dimension!.line;
  near(Math.abs(cross(sub(b, a), along)), 0, `${label}: the dimension line runs parallel to the wall`);
  near(len(sub(b, a)), len(wall), `${label}: as long as the wall`);
  const offset = cross(along, sub(a, start));
  near(Math.abs(offset), DIMENSION_STYLE.offset, `${label}: ${DIMENSION_STYLE.offset} px off the wall`);
  near(dot(sub(a, start), along), 0, `${label}: its ends square to the wall's ends`);
  for (const [index, [p, q]] of dimension!.extensions.entries()) {
    const wallEnd = index === 0 ? start : end;
    near(Math.abs(cross(sub(q, p), { x: -along.y, y: along.x })), 0, `${label}: extension line ${index + 1} square to the wall`);
    near(dot(sub(p, wallEnd), along), 0, `${label}: from the wall's end`);
    ok(Math.abs(cross(along, sub(p, wallEnd))) > 0 && Math.abs(cross(along, sub(p, wallEnd))) <= DIMENSION_STYLE.gap + 0.01, `${label}: starting just clear of the wall`);
    near(Math.abs(cross(along, sub(q, wallEnd))), DIMENSION_STYLE.offset + DIMENSION_STYLE.overshoot, `${label}: running just past the dimension line`);
  }
  for (const [index, [p, q]] of dimension!.ticks.entries()) {
    const tick = sub(q, p);
    near(Math.abs(dot(tick, along)) / len(tick), Math.SQRT1_2, `${label}: tick ${index + 1} at 45°`);
    const centre = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    near(len(sub(centre, dimension!.line[index]!)), 0, `${label}: through the dimension line's end`);
    near(len(tick), DIMENSION_STYLE.tick * 2, `${label}: short`);
  }
  const text = dimension!.text;
  near(len(sub(text, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })), 0, `${label}: the text sits on the line's middle`);
  near(Math.abs(Math.sin(text.angle - Math.atan2(wall.y, wall.x))), 0, `${label}: turned to run along the wall`);
  ok(Math.cos(text.angle) > 1e-9 || Math.abs(text.angle + Math.PI / 2) < 1e-6, `${label}: upright — left to right, or bottom to top`);
}

// Two walls whose texts would collide: the second steps out; none overlap.
{
  const walls = [
    { start: { x: 100, y: 200 }, end: { x: 220, y: 200 } },
    { start: { x: 100, y: 205 }, end: { x: 220, y: 205 } },
    { start: { x: 100, y: 210 }, end: { x: 220, y: 210 } },
  ];
  const laid = layoutDimensions(walls, [1000, 1000, 1000], false, measure);
  ok(laid.length === 3, "three walls close together: three dimensions");
  const overlap = (p: (typeof laid)[number]["box"], q: (typeof laid)[number]["box"]) => p.left < q.right && p.right > q.left && p.top < q.bottom && p.bottom > q.top;
  ok(laid.every((one, i) => laid.every((other, j) => i === j || !overlap(one.box, other.box))), "and no two texts overlap — each steps out to a free tier or side");
}

// The canvas draws these, and no bubbles: scoped to the dimension block, comments stripped.
{
  const source = readFileSync("src/features/house-designer/components/freehand-canvas.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const block = source.slice(source.indexOf("layoutDimensions("), source.indexOf("ctx.restore();\n    if (review)"));
  ok(block.length > 100, "(the canvas's dimension block)");
  ok(!/\.roundRect\(/.test(block), "the canvas draws no rounded bubble round a dimension");
  ok(/for \(const \[a, b\] of dimension\.extensions\) segment\(/.test(block) && /segment\(dimension\.line\[0\], dimension\.line\[1\]/.test(block) && /for \(const \[a, b\] of dimension\.ticks\) segment\(/.test(block), "it draws each dimension's extension lines, line and ticks");
  ok(/ctx\.rotate\(angle\)/.test(block) && /ctx\.fillText\(text, 0, 0\)/.test(block), "and its text, turned along the line");
  ok(/ctx\.font = `500 \$\{DIMENSION_STYLE\.font\}px/.test(source), "in the small dimension font");
}

console.log(`Freehand dimensions: ${checks} checks — a thin line parallel to each wall, extension lines, 45° ticks, the length in mm, 10 px, along the line and upright; no bubbles; colliding texts step out`);
