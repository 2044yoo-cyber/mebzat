import type { Part } from "../types/parts";
import type { Cabinet } from "../types/spec";

/**
 * A cabinet measured the way a wardrobe drawing is: the clear width of each
 * column between its boards, the overall width and height, and inside each
 * column the clear heights between shelves, the length of each hanging rail
 * and the hanging height under it, and every drawer front's height.
 *
 * Read off the parts `buildParts` makes — the same boards the cut list cuts —
 * never worked out a second time, so a dimension on the drawing is the
 * distance between two boards that will actually be there.
 *
 * Millimetres, in the design's frame: x to the right, y up from the floor.
 * Only for a cabinet on a straight run (no part turned); a turned one is
 * measured on its own elevation.
 */

export type Span = { from: number; to: number; size: number };
export type RailDimension = { from: number; to: number; y: number; length: number; hang: Span | null };
export type ColumnDimensions = { from: number; to: number; width: number; gaps: Span[]; rails: RailDimension[]; drawers: Span[] };
export type CabinetDimensions = { left: number; right: number; bottom: number; top: number; front: number; columns: ColumnDimensions[] };

type Box = { role: Part["role"]; minX: number; maxX: number; minY: number; maxY: number; minZ: number };

const span = (from: number, to: number): Span => ({ from, to, size: Math.round(to - from) });

export function cabinetDimensions(cabinet: Pick<Cabinet, "id" | "position" | "size">, parts: readonly Part[]): CabinetDimensions | null {
  const own = parts.filter((part) => part.cabinetId === cabinet.id);
  if (!own.length || own.some((part) => (part.rotationY ?? 0) % 360 !== 0)) return null;
  const boxes: Box[] = own.flatMap((part) => part.placements.map((at) => ({ role: part.role, minX: at.x, maxX: at.x + part.size.x, minY: at.y, maxY: at.y + part.size.y, minZ: at.z })));

  // Columns: the clear openings between the upright boards, left to right.
  const uprights = boxes.filter((box) => box.role === "gable" || box.role === "divider").sort((a, b) => a.minX - b.minX);
  const columns: ColumnDimensions[] = [];
  for (let index = 0; index + 1 < uprights.length; index += 1) {
    const from = uprights[index]!.maxX;
    const to = uprights[index + 1]!.minX;
    if (to - from < 50) continue;
    const centre = (from + to) / 2;
    const across = (box: Box) => box.minX <= centre && box.maxX >= centre;

    // What a person reaches past, floor to ceiling: boards, and a bank of
    // drawers taken as one block (the fronts are measured on their own).
    const fronts = boxes.filter((box) => box.role === "drawer_front" && across(box)).sort((a, b) => a.minY - b.minY);
    const obstacles = [
      ...boxes.filter((box) => (box.role === "top" || box.role === "bottom" || box.role === "shelf") && across(box)).map((box) => ({ minY: box.minY, maxY: box.maxY })),
      ...fronts.map((box) => ({ minY: box.minY, maxY: box.maxY })),
    ].sort((a, b) => a.minY - b.minY);
    const merged: { minY: number; maxY: number }[] = [];
    for (const obstacle of obstacles) {
      const last = merged.at(-1);
      // Drawer fronts stand a few millimetres apart: one block, not five gaps.
      if (last && obstacle.minY <= last.maxY + 10) last.maxY = Math.max(last.maxY, obstacle.maxY);
      else merged.push({ ...obstacle });
    }
    const gaps: Span[] = [];
    for (let at = 0; at + 1 < merged.length; at += 1) if (merged[at + 1]!.minY - merged[at]!.maxY > 20) gaps.push(span(merged[at]!.maxY, merged[at + 1]!.minY));

    const rails = boxes.filter((box) => box.role === "rail" && across(box)).map((rail) => {
      const below = merged.filter((obstacle) => obstacle.maxY <= rail.minY + 1).sort((a, b) => b.maxY - a.maxY)[0];
      return { from: rail.minX, to: rail.maxX, y: (rail.minY + rail.maxY) / 2, length: Math.round(rail.maxX - rail.minX), hang: below ? span(below.maxY, rail.minY) : null };
    });

    columns.push({ from, to, width: Math.round(to - from), gaps, rails, drawers: fronts.map((box) => span(box.minY, box.maxY)) });
  }

  return {
    left: cabinet.position.x,
    right: cabinet.position.x + cabinet.size.width,
    bottom: cabinet.position.y,
    top: cabinet.position.y + cabinet.size.height,
    front: Math.min(...boxes.map((box) => box.minZ)),
    columns,
  };
}
