/**
 * The infinite canvas's geometry: world and screen, zoom, culling, picking,
 * handles, snapping, alignment, ordering.
 *
 * Objects live in world units. The view is a scale and an offset —
 * `screen = world × zoom + offset` — so an object's stored coordinates never
 * change because somebody zoomed, panned or opened the canvas on a phone.
 * Only what is in view is drawn: `visible` culls by bounds, so a canvas of
 * thousands of objects draws the dozens on screen.
 */

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type View = { zoom: number; x: number; y: number };
export type Shape = Box & { rotation: number };

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export const toScreen = (point: Point, view: View): Point => ({ x: point.x * view.zoom + view.x, y: point.y * view.zoom + view.y });
export const toWorld = (point: Point, view: View): Point => ({ x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom });

/** Zooms by `factor` keeping the world point under `screenPoint` where it is — the finger or cursor. */
export function zoomAt(view: View, screenPoint: Point, factor: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const world = toWorld(screenPoint, view);
  return { zoom, x: screenPoint.x - world.x * zoom, y: screenPoint.y - world.y * zoom };
}

/** The view that shows `bounds` whole in a viewport, with a margin. */
export function fitView(bounds: Box | null, viewport: { width: number; height: number }, margin = 48): View {
  if (!bounds || bounds.w <= 0 && bounds.h <= 0) return { zoom: 1, x: viewport.width / 2 - (bounds?.x ?? 0), y: viewport.height / 2 - (bounds?.y ?? 0) };
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(
    (viewport.width - margin * 2) / Math.max(bounds.w, 1),
    (viewport.height - margin * 2) / Math.max(bounds.h, 1),
  )));
  return { zoom, x: viewport.width / 2 - (bounds.x + bounds.w / 2) * zoom, y: viewport.height / 2 - (bounds.y + bounds.h / 2) * zoom };
}

/** The part of the world a viewport shows. */
export function viewportBox(view: View, viewport: { width: number; height: number }): Box {
  const a = toWorld({ x: 0, y: 0 }, view);
  return { x: a.x, y: a.y, w: viewport.width / view.zoom, h: viewport.height / view.zoom };
}

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** The corners of a shape, turned about its centre. */
export function corners(shape: Shape): Point[] {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const cos = Math.cos(rad(shape.rotation));
  const sin = Math.sin(rad(shape.rotation));
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const dx = (sx! * shape.w) / 2;
    const dy = (sy! * shape.h) / 2;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
}

/** The axis-aligned box round a shape, rotation included. */
export function bounds(shape: Shape): Box {
  if (!shape.rotation) return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  const points = corners(shape);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function union(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

export const overlaps = (a: Box, b: Box) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
export const contains = (outer: Box, inner: Box) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/** What is worth drawing: in view, or within a margin of it. */
export function visible<T extends Shape>(shapes: readonly T[], view: View, viewport: { width: number; height: number }, margin = 200): T[] {
  const area = viewportBox(view, viewport);
  const padded = { x: area.x - margin / view.zoom, y: area.y - margin / view.zoom, w: area.w + (2 * margin) / view.zoom, h: area.h + (2 * margin) / view.zoom };
  return shapes.filter((shape) => overlaps(bounds(shape), padded));
}

/** Whether a world point is on a shape, its rotation taken into account. */
export function hit(shape: Shape, point: Point, slack = 0): boolean {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const cos = Math.cos(rad(-shape.rotation));
  const sin = Math.sin(rad(-shape.rotation));
  const dx = point.x - cx;
  const dy = point.y - cy;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return Math.abs(lx) <= shape.w / 2 + slack && Math.abs(ly) <= shape.h / 2 + slack;
}

/** The distance from a point to a segment. */
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

export const snap = (value: number, grid: number) => (grid > 0 ? Math.round(value / grid) * grid : value);

// ---------------------------------------------------------------------------
// Handles: resize from any of eight, rotate from the ninth
// ---------------------------------------------------------------------------

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const SIGN: Record<Handle, [number, number]> = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
export const HANDLES = Object.keys(SIGN) as Handle[];

/** Where a handle is, in the world. */
export function handlePoint(shape: Shape, handle: Handle): Point {
  const [sx, sy] = SIGN[handle];
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const cos = Math.cos(rad(shape.rotation));
  const sin = Math.sin(rad(shape.rotation));
  const dx = (sx * shape.w) / 2;
  const dy = (sy * shape.h) / 2;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * The shape after dragging `handle` to `point`: the opposite side or corner
 * stays where it is, in the shape's own turned frame. `keepRatio` holds the
 * proportions (Shift, or an image).
 */
export function resize(shape: Shape, handle: Handle, point: Point, options: { keepRatio?: boolean; min?: number } = {}): Shape {
  const min = options.min ?? 8;
  const [sx, sy] = SIGN[handle];
  const cos = Math.cos(rad(shape.rotation));
  const sin = Math.sin(rad(shape.rotation));
  const turn = (x: number, y: number): Point => ({ x: x * cos - y * sin, y: x * sin + y * cos });
  const centre = { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
  // The point that stays put: the opposite corner, or the middle of the
  // opposite side, in the world.
  const offset = turn((-sx * shape.w) / 2, (-sy * shape.h) / 2);
  const fixed = { x: centre.x + offset.x, y: centre.y + offset.y };
  // The pointer in the shape's own (turned) frame, measured from that point.
  const dx = point.x - fixed.x;
  const dy = point.y - fixed.y;
  const local = { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  let w = sx === 0 ? shape.w : Math.max(min, local.x * sx);
  let h = sy === 0 ? shape.h : Math.max(min, local.y * sy);
  if (options.keepRatio && shape.w > 0 && shape.h > 0) {
    const ratio = shape.w / shape.h;
    if (sx === 0) w = h * ratio;
    else if (sy === 0) h = w / ratio;
    else if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
  }
  const back = turn((sx * w) / 2, (sy * h) / 2);
  const next = { x: fixed.x + back.x, y: fixed.y + back.y };
  return { x: next.x - w / 2, y: next.y - h / 2, w, h, rotation: shape.rotation };
}

/** The rotation that points the shape's top at `point`, snapped to 15° when asked. */
export function rotationTowards(shape: Shape, point: Point, step = 0): number {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  let degrees = (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI + 90;
  if (step > 0) degrees = Math.round(degrees / step) * step;
  return ((degrees % 360) + 360) % 360;
}

// ---------------------------------------------------------------------------
// Alignment, distribution, ordering
// ---------------------------------------------------------------------------

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** New positions that line the shapes up on the selection's edge or centre. */
export function align<T extends Shape & { id: string }>(shapes: readonly T[], how: Alignment): Map<string, Point> {
  const area = union(shapes.map(bounds));
  const moves = new Map<string, Point>();
  if (!area || shapes.length < 2) return moves;
  for (const shape of shapes) {
    const box = bounds(shape);
    let dx = 0;
    let dy = 0;
    if (how === "left") dx = area.x - box.x;
    if (how === "right") dx = area.x + area.w - (box.x + box.w);
    if (how === "center") dx = area.x + area.w / 2 - (box.x + box.w / 2);
    if (how === "top") dy = area.y - box.y;
    if (how === "bottom") dy = area.y + area.h - (box.y + box.h);
    if (how === "middle") dy = area.y + area.h / 2 - (box.y + box.h / 2);
    moves.set(shape.id, { x: shape.x + dx, y: shape.y + dy });
  }
  return moves;
}

/** Even gaps between three or more shapes, across or down. */
export function distribute<T extends Shape & { id: string }>(shapes: readonly T[], axis: "x" | "y"): Map<string, Point> {
  const moves = new Map<string, Point>();
  if (shapes.length < 3) return moves;
  const sorted = [...shapes].sort((a, b) => bounds(a)[axis] - bounds(b)[axis]);
  const size = (box: Box) => (axis === "x" ? box.w : box.h);
  const first = bounds(sorted[0]!);
  const last = bounds(sorted.at(-1)!);
  const total = sorted.reduce((sum, shape) => sum + size(bounds(shape)), 0);
  const gap = (last[axis] + size(last) - first[axis] - total) / (sorted.length - 1);
  let cursor = first[axis];
  for (const shape of sorted) {
    const box = bounds(shape);
    const delta = cursor - box[axis];
    moves.set(shape.id, axis === "x" ? { x: shape.x + delta, y: shape.y } : { x: shape.x, y: shape.y + delta });
    cursor += size(box) + gap;
  }
  return moves;
}

/** A z between two others, so reordering one object rewrites one row. */
export function between(below: number | null, above: number | null): number {
  if (below === null && above === null) return 0;
  if (below === null) return above! - 1;
  if (above === null) return below + 1;
  return (below + above) / 2;
}

/** Where a connector between two shapes meets each one's edge. */
export function connectorEnds(from: Shape, to: Shape): [Point, Point] {
  const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const b = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const edge = (box: Box, centre: Point, toward: Point): Point => {
    const dx = toward.x - centre.x;
    const dy = toward.y - centre.y;
    if (!dx && !dy) return centre;
    const scale = Math.min(dx ? box.w / 2 / Math.abs(dx) : Infinity, dy ? box.h / 2 / Math.abs(dy) : Infinity);
    return { x: centre.x + dx * Math.min(1, scale), y: centre.y + dy * Math.min(1, scale) };
  };
  return [edge(bounds(from), a, b), edge(bounds(to), b, a)];
}
