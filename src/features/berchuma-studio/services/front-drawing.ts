import { buildParts } from "./geometry";
import { partWorldBounds } from "./part-transform";
import type { DesignSpec } from "../types/spec";

/**
 * A design seen from the front, as a small line drawing.
 *
 * Drawn from the design's own parts — the ones the cut list and the price are
 * made of — so a template card or a project card shows the cabinet itself,
 * not an illustration of one. Every board is projected onto the front plane
 * and outlined; fronts are filled lightly so doors and drawers read as the
 * face. No hooks and no browser APIs, so a server page can draw a grid of
 * them without sending a single spec to the browser.
 */

export type FrontBox = { x: number; y: number; width: number; height: number; front: boolean };
export type FrontDrawingData = { boxes: FrontBox[]; minX: number; minY: number; width: number; height: number };

export function frontDrawing(spec: DesignSpec): FrontDrawingData | null {
  try {
    const { parts } = buildParts(spec);
    const boxes = parts.flatMap((part) =>
      part.placements.map((placement) => {
        const bounds = partWorldBounds(part, placement);
        return {
          front: part.role === "door" || part.role === "drawer_front",
          x: Math.round(bounds.min.x),
          y: Math.round(bounds.min.y),
          width: Math.round(bounds.max.x - bounds.min.x),
          height: Math.round(bounds.max.y - bounds.min.y),
          // z runs backwards from the front face: smaller is nearer.
          z: bounds.min.z,
        };
      }),
    );
    if (!boxes.length) return null;
    const minX = Math.min(...boxes.map((box) => box.x));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    const minY = Math.min(0, ...boxes.map((box) => box.y));
    // Back to front, so the fronts are drawn over the carcass behind them.
    const ordered = boxes.sort((a, b) => b.z - a.z).map((box) => ({ x: box.x, y: box.y, width: box.width, height: box.height, front: box.front }));
    return { boxes: ordered, minX, minY, width: maxX - minX, height: maxY - minY };
  } catch {
    return null;
  }
}
