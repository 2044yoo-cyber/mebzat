/**
 * The rules a door sized by hand has to keep, and the edges it can snap to.
 *
 * Pure geometry on rectangles — a door's face in its cabinet's frame, x from
 * the cabinet's left side and y up from its floor, in millimetres. The doors
 * themselves are worked out in `geometry.ts` (`cabinetFronts`), the one place
 * a door's size comes from; this file only says whether a size is allowed and
 * where a dragged edge wants to land.
 */

export type FrontRect = { x: number; y: number; width: number; height: number };

/** Nothing narrower or shorter than this is a door anybody can hang. */
export const MIN_DOOR = 100;

export function rectsOverlap(a: FrontRect, b: FrontRect, tolerance = 0.5): boolean {
  return a.x < b.x + b.width - tolerance && b.x < a.x + a.width - tolerance && a.y < b.y + b.height - tolerance && b.y < a.y + a.height - tolerance;
}

/**
 * Why a door cannot have this size and place, or null when it can: not
 * smaller than a door, not outside its cabinet, not over another door or a
 * drawer front.
 */
export function doorRectProblem(rect: FrontRect, cabinet: { width: number; height: number }, others: readonly FrontRect[]): string | null {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return "That is not a size";
  if (rect.width < MIN_DOOR || rect.height < MIN_DOOR) return `A door must be at least ${MIN_DOOR} × ${MIN_DOOR} mm`;
  if (rect.width > cabinet.width + 0.5) return `Wider than the cabinet — at most ${Math.round(cabinet.width)} mm`;
  if (rect.height > cabinet.height + 0.5) return `Taller than the cabinet — at most ${Math.round(cabinet.height)} mm`;
  if (rect.x < -0.5 || rect.y < -0.5 || rect.x + rect.width > cabinet.width + 0.5 || rect.y + rect.height > cabinet.height + 0.5) return "A door cannot reach outside its cabinet";
  if (others.some((other) => rectsOverlap(rect, other))) return "It would overlap another door or drawer front";
  return null;
}

/** The nearest target within `tolerance`, or the value as it was. */
export function snapValue(value: number, targets: readonly number[], tolerance: number): { value: number; snapped: boolean } {
  let best: number | null = null;
  for (const target of targets) if (Math.abs(target - value) <= tolerance && (best === null || Math.abs(target - value) < Math.abs(best - value))) best = target;
  return best === null ? { value, snapped: false } : { value: best, snapped: true };
}

/**
 * Leaves laid side by side across a span with `gap` between each: equal
 * widths, the span kept. What "Make Equal" does, and the position a dragged
 * meeting edge snaps to when it is near it.
 */
export function equalLeaves(left: number, right: number, count: number, gap: number): { x: number; width: number }[] {
  const width = (right - left - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({ x: left + index * (width + gap), width }));
}

export type DoorEdge = "left" | "right" | "top" | "bottom";

/**
 * A door with one edge dragged to `value` (millimetres, the cabinet's frame):
 * the opposite edge stays put, the door never folds below `MIN_DOOR`, and
 * with snap on the edge lands on the nearest target within `tolerance`.
 */
export function dragDoorEdge(
  rect: FrontRect,
  edge: DoorEdge,
  value: number,
  options: { targets?: { x: readonly number[]; y: readonly number[] }; snap?: boolean; tolerance?: number } = {},
): { rect: FrontRect; snapped: boolean } {
  const horizontal = edge === "left" || edge === "right";
  const targets = horizontal ? options.targets?.x ?? [] : options.targets?.y ?? [];
  const landed = options.snap ? snapValue(value, targets, options.tolerance ?? 12) : { value, snapped: false };
  const at = Math.round(landed.value * 10) / 10;
  const right = rect.x + rect.width;
  const top = rect.y + rect.height;
  switch (edge) {
    case "left": {
      const x = Math.min(at, right - MIN_DOOR);
      return { rect: { ...rect, x, width: right - x }, snapped: landed.snapped && x === at };
    }
    case "right": {
      const width = Math.max(at - rect.x, MIN_DOOR);
      return { rect: { ...rect, width }, snapped: landed.snapped && width === at - rect.x };
    }
    case "bottom": {
      const y = Math.min(at, top - MIN_DOOR);
      return { rect: { ...rect, y, height: top - y }, snapped: landed.snapped && y === at };
    }
    case "top": {
      const height = Math.max(at - rect.y, MIN_DOOR);
      return { rect: { ...rect, height }, snapped: landed.snapped && height === at - rect.y };
    }
  }
}

/** A board of the cabinet, as its face shows in the cabinet's frame. */
export type FaceBoard = { minX: number; maxX: number; minY: number; maxY: number; upright: boolean };

/**
 * Where a dragged door edge wants to land: the cabinet's sides, the faces of
 * its gables and dividers (bay boundaries), its shelves and fixed boards,
 * the edges of the other doors and drawer fronts — flush with them or a door
 * gap clear of them — the centre line, and the meeting edges that would make
 * the doors of its row equal. Every target is a gap clear of a side, or flush.
 */
export function doorSnapTargets(input: {
  cabinet: { width: number; height: number };
  gap: number;
  boards: readonly FaceBoard[];
  /** Every other door and drawer front of the cabinet. */
  others: readonly FrontRect[];
  /** The span the door's row shares, for the equal-door positions. */
  row?: { left: number; right: number; count: number } | null;
}): { x: number[]; y: number[] } {
  const { cabinet, gap, boards, others, row } = input;
  const x = new Set<number>([0, gap, cabinet.width - gap, cabinet.width, cabinet.width / 2, cabinet.width / 2 - gap / 2, cabinet.width / 2 + gap / 2]);
  const y = new Set<number>([0, gap, cabinet.height - gap, cabinet.height, cabinet.height / 2]);
  for (const board of boards) {
    if (board.upright) {
      for (const value of [board.minX, board.maxX, board.minX - gap, board.maxX + gap, (board.minX + board.maxX) / 2 - gap / 2, (board.minX + board.maxX) / 2 + gap / 2]) x.add(value);
    } else {
      for (const value of [board.minY, board.maxY, board.minY - gap, board.maxY + gap]) y.add(value);
    }
  }
  for (const other of others) {
    for (const value of [other.x, other.x + other.width, other.x - gap, other.x + other.width + gap]) x.add(value);
    for (const value of [other.y, other.y + other.height, other.y - gap, other.y + other.height + gap]) y.add(value);
  }
  if (row && row.count > 1) {
    for (const share of equalLeaves(row.left, row.right, row.count, gap)) {
      x.add(share.x);
      x.add(share.x + share.width);
    }
  }
  const inside = (limit: number) => (value: number) => Number.isFinite(value) && value >= -0.5 && value <= limit + 0.5;
  return { x: [...x].filter(inside(cabinet.width)), y: [...y].filter(inside(cabinet.height)) };
}
