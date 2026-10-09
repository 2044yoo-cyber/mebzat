/**
 * A door on the plan is drawn the way a floor plan draws one.
 *
 *   npx tsx scripts/house_door_symbol_check.ts
 *
 * The owner asked for the normal door symbol. It was a hairline from the
 * wall's centre and a faint dashed arc, with the wall left open-ended. Now:
 * both jambs closed across the wall; the leaf a panel standing open at 90°,
 * hung on the face of the wall on the side it opens to; its swing a solid
 * quarter circle from the far jamb to the open leaf. Measured here from the
 * rendered SVG, for each hinge side, each swing side, and a double door.
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

function single(markup: string, hinge: Point, strike: Point, out: 1 | -1, label: string) {
  const jambs = parts(markup, "jamb");
  ok(jambs.length === 2, `${label}: both jambs drawn`);
  const ys = jambs.map((jamb) => [Number(attr(jamb, "y1")), Number(attr(jamb, "y2"))].sort((a, b) => a - b));
  ok(ys.every(([a, b]) => Math.abs(a! + 100) < 0.5 && Math.abs(b! - 100) < 0.5), `${label}: each jamb closes the wall across its full 200 mm`);
  const xs = jambs.map((jamb) => Number(attr(jamb, "x1"))).sort((a, b) => a - b);
  ok(Math.abs(xs[0]! - 1000) < 0.5 && Math.abs(xs[1]! - 1900) < 0.5, `${label}: at the two ends of the opening`);

  const leaves = parts(markup, "leaf");
  ok(leaves.length === 1 && leaves[0]!.startsWith("<polygon"), `${label}: the leaf is a panel, not a hairline`);
  const leaf = points(leaves[0]!);
  const face = { x: hinge.x, y: 100 * out };
  ok(leaf.some((point) => distance(point, face) < 0.5), `${label}: hung on the wall's face on the side it opens to, at the hinge jamb`);
  const along = leaf.map((point) => point.x);
  const across = leaf.map((point) => point.y);
  near(Math.max(...across.map((y) => Math.abs(y - 100 * out))), 900, `${label}: standing open 900 from the wall face`);
  near(Math.max(...along) - Math.min(...along), 40, `${label}: 40 mm thick`);
  ok(leaf.every((point) => (point.y - 100 * out) * out >= -0.5), `${label}: open on the side it swings to`);

  const swings = parts(markup, "swing");
  ok(swings.length === 1, `${label}: one swing`);
  const swing = swings[0]!;
  ok(!attr(swing, "stroke-dasharray"), `${label}: the swing is a solid line, not dashed`);
  ok(Number(attr(swing, "stroke-width")) >= 0.8, `${label}: and not a faint one`);
  const d = attr(swing, "d")!;
  const [, sx, sy] = d.match(/^M([-\d.]+),([-\d.]+)/)!.map(Number);
  const arc = d.match(/A([-\d.]+),([-\d.]+) 0 0 [01] ([-\d.]+),([-\d.]+)$/)!.map(Number);
  near(distance({ x: sx!, y: sy! }, { x: strike.x, y: 100 * out }), 0, `${label}: the swing starts at the far jamb, on the wall face`);
  near(arc[1]!, 900, `${label}: a quarter circle the leaf's width`);
  near(distance({ x: arc[3]!, y: arc[4]! }, { x: hinge.x, y: 100 * out + 900 * out }), 0, `${label}: ending at the open leaf's edge`);
}

single(draw(), { x: 1000, y: 0 }, { x: 1900, y: 0 }, 1, "hinged left, opening in");
single(draw({ hingeAtFrom: false }), { x: 1900, y: 0 }, { x: 1000, y: 0 }, 1, "hinged right");
single(draw({ side: { x: 0, y: -1 } }), { x: 1000, y: 0 }, { x: 1900, y: 0 }, -1, "opening out");
single(draw({ style: undefined }), { x: 1000, y: 0 }, { x: 1900, y: 0 }, 1, "a door from before types: the same");

{
  const markup = draw({ style: "double", to: { x: 2500, y: 0 } });
  ok(parts(markup, "jamb").length === 2, "double: both jambs");
  const leaves = parts(markup, "leaf").map(points);
  ok(leaves.length === 2, "double: two leaves");
  ok(leaves.some((leaf) => leaf.some((point) => distance(point, { x: 1000, y: 100 }) < 0.5)) && leaves.some((leaf) => leaf.some((point) => distance(point, { x: 2500, y: 100 }) < 0.5)), "each hung on its own jamb, on the wall face");
  ok(leaves.every((leaf) => Math.abs(Math.max(...leaf.map((point) => point.y)) - 850) < 0.5), "each standing open half the opening, 750");
  ok(parts(markup, "swing").every((swing) => !attr(swing, "stroke-dasharray")), "with solid swings");
}
ok(parts(draw({ style: "sliding" }), "jamb").length === 2, "a sliding door has its jambs too");

console.log(`House door symbol: ${checks} checks — both jambs across the wall, the leaf a 40 mm panel open at 90° from the wall face, a solid quarter-circle swing from the far jamb; hinged either side, opening either way, single and double`);
