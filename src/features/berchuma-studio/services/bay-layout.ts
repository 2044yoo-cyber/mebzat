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

/**
 * What a part made inside this bay calls it.
 *
 * Every part label used to end in the bay's internal id, so a cabinet with one
 * opening produced "Back panel — bay-1" and a wardrobe whose wide bay had been
 * split by validation produced "Drawer 1 sides — bay-1-module-2". Neither is a
 * thing a joiner can look for on a drawing: the first names a bay that is the
 * whole cabinet, and the second exposes a repair the reader never asked for.
 *
 * So the bay is named only when there is more than one to tell apart, and it is
 * named by where it is rather than by what it is called internally — bay 2 of
 * three is "bay 2" whatever its id says. The id stays on the part, where the
 * editor uses it to match a part to a selection; it just stops being the label.
 */
export function bayLabelSuffix(cabinet: Cabinet, bayId: string): string {
  if (cabinet.bays.length <= 1) return "";

  const index = cabinet.bays.findIndex((bay) => bay.id === bayId);
  if (index === -1) return "";

  return ` — bay ${index + 1}`;
}
