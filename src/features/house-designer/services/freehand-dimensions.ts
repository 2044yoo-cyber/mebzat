import type { Point } from "./freehand";

/**
 * Architectural dimensions for the freehand sketch, laid out in screen
 * pixels.
 *
 * Each wall gets what a drawing gives it: a thin dimension line parallel to
 * the wall and a little off it, extension lines from the wall's ends past
 * that line, a short 45° tick at each end, and the length in millimetres —
 * small, centred on the line and turned to run along it, upright. There is
 * no bubble round the text; the line is broken under it. Where two walls'
 * texts would collide, the second dimension steps out to the next tier, or
 * to the wall's other side.
 */

export const DIMENSION_STYLE = {
  /** Text height, px. */
  font: 10,
  /** Gap between the wall and its extension line, px. */
  gap: 3,
  /** How far the extension line runs past the dimension line, px. */
  overshoot: 3,
  /** Half the length of a tick, px. */
  tick: 4,
  /** Dimension line's distance from the wall, first tier, px; each further tier is this again. */
  offset: 12,
  /** Gap kept between the text and the line either side, px. */
  pad: 2,
} as const;

export type DimensionText = { x: number; y: number; angle: number; text: string; width: number; height: number };
export type Dimension = {
  /** The dimension line, end to end. */
  line: [Point, Point];
  /** Extension lines, wall to just past the dimension line. */
  extensions: [Point, Point][];
  /** The two 45° ticks. */
  ticks: [Point, Point][];
  text: DimensionText;
  /** The text's screen box, for collisions. */
  box: { left: number; top: number; right: number; bottom: number };
};

/** A wall's length as a drawing writes it: millimetres, ≈ while the scale is a guess. */
export function dimensionText(millimetres: number, calibrated: boolean) {
  return `${calibrated ? "" : "≈"}${Math.round(millimetres)}`;
}

/**
 * Lays out one dimension per wall. `segments` are in screen pixels;
 * `lengths` the walls' lengths in millimetres; `measure` the width of a
 * string in the dimension font.
 */
export function layoutDimensions(
  segments: readonly { start: Point; end: Point }[],
  lengths: readonly number[],
  calibrated: boolean,
  measure: (text: string) => number,
): Dimension[] {
  const placed: Dimension["box"][] = [];
  const out: Dimension[] = [];
  segments.forEach((segment, index) => {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const t = { x: dx / length, y: dy / length };
    const n = { x: -t.y, y: t.x };
    const text = dimensionText(lengths[index] ?? 0, calibrated);
    const width = measure(text);
    const height = DIMENSION_STYLE.font;
    // Upright: text runs left to right, or bottom to top on a vertical wall.
    // The angle is kept in [-90°, 90°), so a vertical wall reads upwards.
    let angle = Math.atan2(dy, dx);
    if (angle >= Math.PI / 2 - 1e-6) angle -= Math.PI;
    if (angle < -Math.PI / 2 - 1e-6) angle += Math.PI;
    const mid = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
    const boxAt = (centre: Point): Dimension["box"] => {
      const w = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
      const h = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
      return { left: centre.x - w / 2, top: centre.y - h / 2, right: centre.x + w / 2, bottom: centre.y + h / 2 };
    };
    const hits = (box: Dimension["box"]) => placed.filter((p) => box.left < p.right + 1 && box.right + 1 > p.left && box.top < p.bottom + 1 && box.bottom + 1 > p.top).length;
    // First tier either side, then further out.
    let best: { offset: number; box: Dimension["box"]; hits: number } | null = null;
    for (const tier of [1, 2, 3, 4]) {
      for (const sign of [1, -1]) {
        const offset = sign * DIMENSION_STYLE.offset * tier;
        const box = boxAt({ x: mid.x + n.x * offset, y: mid.y + n.y * offset });
        const count = hits(box);
        if (!best || count < best.hits) best = { offset, box, hits: count };
        if (count === 0) break;
      }
      if (best?.hits === 0) break;
    }
    const { offset, box } = best!;
    const side = Math.sign(offset);
    const at = (base: Point, along: number, across: number) => ({ x: base.x + t.x * along + n.x * across, y: base.y + t.y * along + n.y * across });
    const a = at(segment.start, 0, offset);
    const b = at(segment.end, 0, offset);
    const extension = (end: Point): [Point, Point] => [at(end, 0, side * DIMENSION_STYLE.gap), at(end, 0, offset + side * DIMENSION_STYLE.overshoot)];
    // A tick is drawn at 45° to the dimension line, through its end.
    const d = { x: (t.x + n.x) * Math.SQRT1_2 * DIMENSION_STYLE.tick, y: (t.y + n.y) * Math.SQRT1_2 * DIMENSION_STYLE.tick };
    const tick = (p: Point): [Point, Point] => [{ x: p.x - d.x, y: p.y - d.y }, { x: p.x + d.x, y: p.y + d.y }];
    placed.push(box);
    out.push({
      line: [a, b],
      extensions: [extension(segment.start), extension(segment.end)],
      ticks: [tick(a), tick(b)],
      text: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle, text, width, height },
      box,
    });
  });
  return out;
}
