/**
 * A door on the plan is drawn the way a floor plan draws one.
 *
 *   npx tsx scripts/house_door_symbol_check.ts
 *
 * The owner asked for the normal door symbol, and sent CAD door blocks to
 * match. It was a hairline from the wall's centre and a faint dashed arc,
 * with the wall left open-ended. Now, as the blocks draw it: at each jamb a
 * 50 mm frame filling the wall, with a trim on each face; a threshold across
 * the opening between the frames; the leaf a 40 mm panel standing open at
 * 90°, hung on the frame's inner edge on the face of the wall it opens to;
 * its swing a solid quarter circle from the far frame to the open leaf; a
 * double door two leaves meeting in the middle. Measured from the rendered
 * SVG, for each hinge side, each swing side, and a double door.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DoorSymbol } from "../src/features/house-designer/components/plan-symbols";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const near = (a: number, b: number, message: string, tolerance = 0.5) => ok(Math.abs(a - b) <= tolerance, `${message} (${a.toFixed(1)} ≈ ${b})`);

type Point = { x: number; y: number };
const attr = (element: string, name: string) => element.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const parts = (markup: string, part: string) => [...markup.matchAll(new RegExp(`<[a-z]+[^>]*data-door-part="${part}"[^>]*>`, "g"))].map((match) => match[0]);
const points = (polygon: string) => attr(polygon, "points")!.trim().split(/\s+/).map((pair) => { const [x, y] = pair.split(",").map(Number); return { x: x!, y: y! }; });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** A 900 door in a 200 mm wall running along x from 0, opening towards +y. */
const draw = (props: Partial<Parameters<typeof DoorSymbol>[0]> = {}) => renderToStaticMarkup(createElement("svg", null, createElement(DoorSymbol, { from: { x: 1000, y: 0 }, to: { x: 1900, y: 0 }, side: { x: 0, y: 1 }, hingeAtFrom: true, style: "single", thickness: 200, ...props })));

/** The centre an SVG arc command draws round (SVG 1.1, F.6.5), for a circle with no rotation. */
function arcCentre(d: string): Point {
  const [, x1, y1] = d.match(/^M([-\d.]+),([-\d.]+)/)!.map(Number);
  const [, r, , large, sweep, x2, y2] = d.match(/A([-\d.]+),([-\d.]+) 0 ([01]) ([01]) ([-\d.]+),([-\d.]+)$/)!.map(Number);
  const hx = (x1! - x2!) / 2;
  const hy = (y1! - y2!) / 2;
  const factor = Math.sqrt(Math.max(0, (r! * r! - hx * hx - hy * hy) / (hx * hx + hy * hy))) * (large !== sweep ? 1 : -1);
  return { x: factor * hy + (x1! + x2!) / 2, y: -factor * hx + (y1! + y2!) / 2 };
}

const boxOf = (corners: Point[]) => ({ minX: Math.min(...corners.map((p) => p.x)), maxX: Math.max(...corners.map((p) => p.x)), minY: Math.min(...corners.map((p) => p.y)), maxY: Math.max(...corners.map((p) => p.y)) });

/** The frames at both ends of an opening from `start` to `end` along x, in a 200 mm wall. */
function frames(markup: string, start: number, end: number, label: string) {
  const jambs = parts(markup, "jamb").map(points).map(boxOf).sort((a, b) => a.minX - b.minX);
  ok(jambs.length === 2, `${label}: a frame at both jambs`);
  ok(jambs.every((box) => Math.abs(box.minY + 100) < 0.5 && Math.abs(box.maxY - 100) < 0.5), `${label}: each frame fills the wall's 200 mm`);
  ok(Math.abs(jambs[0]!.minX - start) < 0.5 && Math.abs(jambs[0]!.maxX - (start + 50)) < 0.5 && Math.abs(jambs[1]!.minX - (end - 50)) < 0.5 && Math.abs(jambs[1]!.maxX - end) < 0.5, `${label}: 50 mm deep, inside each end of the opening`);
  const trims = parts(markup, "trim").map(points).map(boxOf);
  ok(trims.length === 4, `${label}: a trim on each face of each frame`);
  ok(trims.filter((box) => box.minY >= 99.5).length === 2 && trims.filter((box) => box.maxY <= -99.5).length === 2, `${label}: on the wall's two faces, outside it`);
  ok(trims.every((box) => Math.abs(box.maxY - box.minY - 15) < 0.5), `${label}: each 15 mm`);
  ok(trims.some((box) => box.minX < start - 30) && trims.some((box) => box.maxX > end + 30), `${label}: lapping onto the wall beyond the opening`);
  const sills = parts(markup, "threshold").map(points).map(boxOf);
  ok(sills.length === 1 && Math.abs(sills[0]!.minX - (start + 50)) < 0.5 && Math.abs(sills[0]!.maxX - (end - 50)) < 0.5, `${label}: a threshold across the opening between the frames`);
}

function single(markup: string, hinge: Point, strike: Point, out: 1 | -1, label: string) {
  frames(markup, 1000, 1900, label);
  // The leaf hangs on the frame's inner edge: 50 mm in from the jamb.
  const inward = Math.sign(strike.x - hinge.x);
  const hingeAt = { x: hinge.x + 50 * inward, y: 100 * out };
  const strikeAt = { x: strike.x - 50 * inward, y: 100 * out };
  const clear = 800;

  const leaves = parts(markup, "leaf");
  ok(leaves.length === 1 && leaves[0]!.startsWith("<polygon"), `${label}: the leaf is a panel, not a hairline`);
  const leaf = points(leaves[0]!);
  ok(leaf.some((point) => distance(point, hingeAt) < 0.5), `${label}: hung on the frame's inner edge, on the wall face it opens to`);
  const along = leaf.map((point) => point.x);
  const across = leaf.map((point) => point.y);
  near(Math.max(...across.map((y) => Math.abs(y - 100 * out))), clear, `${label}: standing open the clear width from the wall face`);
  near(Math.max(...along) - Math.min(...along), 40, `${label}: 40 mm thick`);
  ok(leaf.every((point) => (point.y - 100 * out) * out >= -0.5), `${label}: open on the side it swings to`);
  ok(leaf.every((point) => (point.x - hingeAt.x) * inward >= -0.5), `${label}: lying in the opening, not over the frame`);

  const swings = parts(markup, "swing");
  ok(swings.length === 1, `${label}: one swing`);
  const swing = swings[0]!;
  ok(!attr(swing, "stroke-dasharray"), `${label}: the swing is a solid line, not dashed`);
  ok(Number(attr(swing, "stroke-width")) >= 0.8, `${label}: and not a faint one`);
  const d = attr(swing, "d")!;
  const [, sx, sy] = d.match(/^M([-\d.]+),([-\d.]+)/)!.map(Number);
  const arc = d.match(/A([-\d.]+),([-\d.]+) 0 0 [01] ([-\d.]+),([-\d.]+)$/)!.map(Number);
  near(distance({ x: sx!, y: sy! }, strikeAt), 0, `${label}: the swing starts at the far frame, on the wall face`);
  near(arc[1]!, clear, `${label}: a quarter circle the leaf's width`);
  near(distance(arcCentre(d), hingeAt), 0, `${label}: centred on the hinge, bowing out from it — not curling back towards it`);
  near(distance({ x: arc[3]!, y: arc[4]! }, { x: hingeAt.x, y: 100 * out + clear * out }), 0, `${label}: ending at the open leaf's edge`);
}

single(draw(), { x: 1000, y: 0 }, { x: 1900, y: 0 }, 1, "hinged left, opening in");
single(draw({ hingeAtFrom: false }), { x: 1900, y: 0 }, { x: 1000, y: 0 }, 1, "hinged right");
single(draw({ side: { x: 0, y: -1 } }), { x: 1000, y: 0 }, { x: 1900, y: 0 }, -1, "opening out");
single(draw({ style: undefined }), { x: 1000, y: 0 }, { x: 1900, y: 0 }, 1, "a door from before types: the same");

{
  const markup = draw({ style: "double", to: { x: 2500, y: 0 } });
  frames(markup, 1000, 2500, "double");
  const leaves = parts(markup, "leaf").map(points);
  ok(leaves.length === 2, "double: two leaves");
  ok(leaves.some((leaf) => leaf.some((point) => distance(point, { x: 1050, y: 100 }) < 0.5)) && leaves.some((leaf) => leaf.some((point) => distance(point, { x: 2450, y: 100 }) < 0.5)), "each hung on its own frame, on the wall face");
  ok(leaves.every((leaf) => Math.abs(Math.max(...leaf.map((point) => point.y)) - 800) < 0.5), "each standing open half the clear opening, 700");
  const tips = parts(markup, "swing").map((swing) => attr(swing, "d")!.match(/^M([-\d.]+),([-\d.]+)/)!.slice(1).map(Number));
  ok(tips.length === 2 && tips.every(([x, y]) => Math.abs(x! - 1750) < 0.5 && Math.abs(y! - 100) < 0.5), "the two swings meet in the middle");
  const centres = parts(markup, "swing").map((swing) => arcCentre(attr(swing, "d")!)).sort((a, b) => a.x - b.x);
  ok(distance(centres[0]!, { x: 1050, y: 100 }) < 0.5 && distance(centres[1]!, { x: 2450, y: 100 }) < 0.5, "each swing centred on its own hinge");
  ok(parts(markup, "swing").every((swing) => !attr(swing, "stroke-dasharray")), "with solid swings");
}
ok(parts(draw({ style: "sliding" }), "jamb").length === 2, "a sliding door has its frames too");

console.log(`House door symbol: ${checks} checks — frames with trims at both jambs, a threshold, the leaf a 40 mm panel open at 90° from the frame on the wall face, a solid quarter-circle swing from the far frame; hinged either side, opening either way, single and double`);
