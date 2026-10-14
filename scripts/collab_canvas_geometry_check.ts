/**
 * The infinite canvas's geometry.
 *
 *   npx tsx scripts/collab_canvas_geometry_check.ts
 *
 * The promise the owner asked for: an object's coordinates do not move when
 * the canvas is zoomed, panned, resized or reopened. Here every operation the
 * canvas offers is checked on the numbers it produces — zoom about a finger,
 * fit, culling, picking a turned object, resizing from each handle of a turned
 * object, rotating, aligning, distributing, ordering and connecting.
 */
import assert from "node:assert/strict";

import {
  align, between, bounds, connectorEnds, distribute, fitView, handlePoint, HANDLES, hit, MAX_ZOOM, MIN_ZOOM,
  resize, rotationTowards, segmentDistance, snap, toScreen, toWorld, visible, zoomAt, type Shape,
} from "../src/lib/collab/canvas-geometry";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const near = (a: number, b: number, message: string, tolerance = 1e-6) => ok(Math.abs(a - b) <= tolerance, `${message} (${a} ≈ ${b})`);
const nearPoint = (a: { x: number; y: number }, b: { x: number; y: number }, message: string, tolerance = 1e-6) => ok(Math.hypot(a.x - b.x, a.y - b.y) <= tolerance, `${message} (${a.x.toFixed(3)},${a.y.toFixed(3)} ≈ ${b.x},${b.y})`);

// World and screen are inverses, at any view.
for (const view of [{ zoom: 1, x: 0, y: 0 }, { zoom: 2.5, x: -340, y: 120 }, { zoom: 0.07, x: 9000, y: -4000 }]) {
  const world = { x: 1234.5, y: -987.25 };
  nearPoint(toWorld(toScreen(world, view), view), world, `world → screen → world at zoom ${view.zoom}`);
}

// Zoom keeps the point under the finger where it is.
{
  const view = { zoom: 1, x: 100, y: 50 };
  const finger = { x: 320, y: 240 };
  const under = toWorld(finger, view);
  const zoomed = zoomAt(view, finger, 3);
  nearPoint(toWorld(finger, zoomed), under, "zooming in keeps the world point under the finger");
  nearPoint(toWorld(finger, zoomAt(zoomed, finger, 1 / 3)), under, "and so does zooming back out");
  near(zoomAt(view, finger, 1e9).zoom, MAX_ZOOM, "zoom stops at its maximum");
  near(zoomAt(view, finger, 1e-9).zoom, MIN_ZOOM, "and its minimum");
}

// Fit to content: everything shown, centred.
{
  const content = { x: -500, y: 200, w: 2000, h: 600 };
  const viewport = { width: 390, height: 640 };
  const view = fitView(content, viewport, 24);
  const a = toScreen({ x: content.x, y: content.y }, view);
  const b = toScreen({ x: content.x + content.w, y: content.y + content.h }, view);
  ok(a.x >= 23.99 && b.x <= viewport.width - 23.99 && a.y >= 0 && b.y <= viewport.height, "fit shows the whole of the content inside the margins");
  near((a.x + b.x) / 2, viewport.width / 2, "centred across", 1e-6);
  near((a.y + b.y) / 2, viewport.height / 2, "and down", 1e-6);
  const empty = fitView(null, viewport);
  near(empty.zoom, 1, "an empty canvas fits at 100%");
}

// Culling: only what is near the viewport is drawn.
{
  const shapes: (Shape & { id: string })[] = [];
  for (let i = 0; i < 100; i += 1) for (let j = 0; j < 100; j += 1) shapes.push({ id: `${i}:${j}`, x: i * 300, y: j * 300, w: 200, h: 150, rotation: 0 });
  const view = { zoom: 1, x: 0, y: 0 };
  const shown = visible(shapes, view, { width: 1200, height: 800 }, 0);
  ok(shown.length > 0 && shown.length < 40, `of 10 000 objects, the ${shown.length} in view are drawn`);
  ok(shown.every((shape) => shape.x <= 1200 && shape.y <= 800), "and only those (an object touching the edge counts as in view)");
  const far = visible(shapes, { zoom: 1, x: 100000, y: 100000 }, { width: 1200, height: 800 }, 0);
  ok(far.length === 0, "panned away from everything, nothing is drawn");
  // A plank lying just above the view, then turned upright so it reaches down into it.
  const lying = { id: "t", x: 400, y: -160, w: 400, h: 20, rotation: 0 };
  ok(visible([lying], view, { width: 1200, height: 800 }, 0).length === 0, "a plank lying just above the view is not drawn");
  ok(visible([{ ...lying, rotation: 90 }], view, { width: 1200, height: 800 }, 0).length === 1, "turned upright into view, it is — culling uses its turned bounds");
}

// Picking a turned object.
{
  const plank = { x: 0, y: 0, w: 200, h: 20, rotation: 90 };
  ok(hit(plank, { x: 100, y: 90 }), "a turned plank is picked along its turned length");
  ok(!hit(plank, { x: 10, y: 10 }), "not where it lay before it was turned");
  ok(hit(plank, { x: 112, y: 10 }, 3), "a little slack for a finger");
  near(segmentDistance({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5, "a point's distance to a line");
}

// Resizing from every handle, unturned and turned: the opposite handle stays put.
for (const rotation of [0, 30, 90, 217]) {
  const shape = { x: 100, y: 100, w: 300, h: 200, rotation };
  for (const handle of HANDLES) {
    const opposite = ({ nw: "se", n: "s", ne: "sw", e: "w", se: "nw", s: "n", sw: "ne", w: "e" } as const)[handle];
    const start = handlePoint(shape, handle);
    const fixedBefore = handlePoint(shape, opposite);
    const pulled = { x: start.x + 37, y: start.y - 23 };
    const result = resize(shape, handle, pulled);
    nearPoint(handlePoint(result, opposite), fixedBefore, `${handle} at ${rotation}°: the opposite ${opposite} stays put`, 1e-6);
    near(result.rotation, rotation, `${handle} at ${rotation}°: the turn is kept`);
    ok(result.w >= 8 && result.h >= 8, `${handle} at ${rotation}°: never smaller than the minimum`);
    if (handle === "n" || handle === "s") near(result.w, shape.w, `${handle}: a top or bottom handle changes the height only`);
    if (handle === "e" || handle === "w") near(result.h, shape.h, `${handle}: a side handle changes the width only`);
  }
  const corner = resize(shape, "se", { x: 10000, y: 10000 }, { keepRatio: true });
  near(corner.w / corner.h, 1.5, `at ${rotation}°: Shift keeps the proportions`, 1e-9);
}
{
  const shape = { x: 0, y: 0, w: 100, h: 100, rotation: 0 };
  const se = resize(shape, "se", { x: 250, y: 160 });
  ok(se.x === 0 && se.y === 0 && se.w === 250 && se.h === 160, "dragging the bottom-right corner to (250, 160) makes it 250 × 160 from the top-left");
  const inverted = resize(shape, "se", { x: -50, y: -50 });
  ok(inverted.w === 8 && inverted.h === 8, "dragging past the opposite corner stops at the minimum, not inside out");
}

// Rotation.
{
  const shape = { x: 0, y: 0, w: 100, h: 100, rotation: 0 };
  near(rotationTowards(shape, { x: 50, y: -100 }), 0, "the rotation handle straight above: upright");
  near(rotationTowards(shape, { x: 200, y: 50 }), 90, "to the right: a quarter turn");
  near(rotationTowards(shape, { x: 120, y: -10 }, 15), 45, "snapped to 15° with Shift");
  near(bounds({ x: 0, y: 0, w: 100, h: 0.0001, rotation: 90 }).h, 100, "a turned object's bounds turn with it", 1e-3);
}

// Snap, align, distribute, order.
{
  near(snap(37, 20), 40, "37 snaps to the 20 grid at 40");
  near(snap(37, 0), 37, "no grid, no snap");
  const shapes = [{ id: "a", x: 0, y: 0, w: 100, h: 50, rotation: 0 }, { id: "b", x: 300, y: 80, w: 60, h: 60, rotation: 0 }, { id: "c", x: 120, y: 200, w: 40, h: 20, rotation: 0 }];
  const left = align(shapes, "left");
  ok([...left.values()].every((point) => point.x === 0), "align left lines every object up on the leftmost edge");
  const right = align(shapes, "right");
  ok(shapes.every((shape) => right.get(shape.id)!.x + shape.w === 360), "align right on the rightmost");
  const middle = align(shapes, "middle");
  ok(shapes.every((shape) => Math.abs(middle.get(shape.id)!.y + shape.h / 2 - 110) < 1e-9), "align middle on the selection's centre line");
  const spread = distribute(shapes, "x");
  const xs = shapes.map((shape) => ({ ...shape, x: spread.get(shape.id)!.x })).sort((p, q) => p.x - q.x);
  const gaps = [xs[1]!.x - (xs[0]!.x + xs[0]!.w), xs[2]!.x - (xs[1]!.x + xs[1]!.w)];
  near(gaps[0]!, gaps[1]!, "distribute leaves equal gaps");
  ok(distribute(shapes.slice(0, 2), "x").size === 0, "and needs three objects");
  near(between(1, 2), 1.5, "a new z between two others");
  ok(between(5, null) > 5 && between(null, 5) < 5 && between(null, null) === 0, "above the top, below the bottom");
}

// Connectors meet the edges of what they join, wherever those are.
{
  const [a, b] = connectorEnds({ x: 0, y: 0, w: 100, h: 100, rotation: 0 }, { x: 300, y: 0, w: 100, h: 100, rotation: 0 });
  nearPoint(a, { x: 100, y: 50 }, "a connector leaves the right edge of the first");
  nearPoint(b, { x: 300, y: 50 }, "and meets the left edge of the second");
}

console.log(`Canvas geometry: ${checks} checks — coordinates stable under zoom and pan, zoom about the finger, fit, culling of 10 000 objects, turned picking, resize from all 8 handles at 4 rotations, rotation, snap, align, distribute, order, connectors`);
