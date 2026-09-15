import type { Bay, Cabinet } from "../types/spec";

/**
 * Where each bay's opening starts, and how wide it is.
 *
 * Bays are stored as a list of widths with no positions on them: the carcass
 * puts a board between every pair and one at each end, so a bay's position is
 * whatever the bays and boards to its left add up to. That sum is written out
 * in two places — the elevation draws the openings and the 3D view labels them
 * — and when it lived in both it was one edit away from the two disagreeing
 * about where a bay is.
 *
 * `x` is measured from the cabinet's own left edge, not from the design's
 * origin, so a caller drawing in cabinet space uses it as it comes and one
 * drawing in world space adds the cabinet's position to it.
 */
export type BayPlacement = { bay: Bay; x: number; width: number };

export function layOutBays(cabinet: Cabinet, board: number): BayPlacement[] {
  let cursor = board;

  return cabinet.bays.map((bay) => {
    const x = cursor;
    cursor += bay.width + board;
    return { bay, x, width: bay.width };
  });
}

/**
 * True when the bays are worth dimensioning separately.
 *
 * A single bay's opening is the cabinet's width less two boards, and the
 * cabinet's width is already on the drawing, so writing the opening as well
 * adds a number without adding an answer.
 */
export function bayDimensionsWorthDrawing(cabinet: Cabinet): boolean {
  return cabinet.bays.length > 1;
}
