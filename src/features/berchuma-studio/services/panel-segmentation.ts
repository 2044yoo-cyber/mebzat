import type { Board } from "../types/spec";

/** A cuttable section of a longer, divider-supported panel span. */
export type PanelSpan = {
  /** Offset from the span's own left/start edge, in millimetres. */
  offset: number;
  /** Cut length of this section, in millimetres. */
  length: number;
};

/**
 * The longest declared cut length this stock can supply.
 *
 * Grain-locked panels must keep their declared length along the sheet's
 * length. Non-directional melamine can be turned, so its longer sheet side is
 * available. The companion dimensions used by wardrobe panels are separately
 * kept within the sheet width by validation.
 */
export function longestCutLength(board: Board): number {
  return board.grain === "none"
    ? Math.max(board.sheet.length, board.sheet.width)
    : board.sheet.length;
}

/**
 * Splits a horizontal panel only at existing structural supports when one is
 * available. A fallback cut is still returned for a plinth, whose generator
 * adds its own internal cross support at that join; carcass top/bottom panels
 * are fed divider centres by the wardrobe validator and therefore never need
 * the fallback in a valid design.
 */
export function splitSpanAtSupports(
  length: number,
  board: Board,
  supports: readonly number[] = [],
): PanelSpan[] {
  const total = Math.max(0, Math.round(length));
  const maximum = Math.max(1, Math.floor(longestCutLength(board)));
  if (total <= maximum) return [{ offset: 0, length: total }];

  const sorted = [...new Set(
    supports
      .map((support) => Math.round(support))
      .filter((support) => support > 0 && support < total),
  )].sort((a, b) => a - b);

  const spans: PanelSpan[] = [];
  let start = 0;

  while (total - start > maximum) {
    // Take the furthest existing divider that leaves this part cuttable. This
    // minimises joins while ensuring every joint lands on a physical support.
    const supported = sorted.filter(
      (support) => support > start && support <= start + maximum,
    );
    const end = supported.at(-1) ?? start + maximum;
    spans.push({ offset: start, length: end - start });
    start = end;
  }

  spans.push({ offset: start, length: total - start });
  return spans;
}
