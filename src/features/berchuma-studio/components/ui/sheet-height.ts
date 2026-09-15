/**
 * How tall the controls sheet is, as a share of the editor.
 *
 * Kept apart from the component because it is the part worth checking: a drag
 * is a stream of pointer positions and a stack of snap decisions, and none of
 * that needs a browser to be reasoned about.
 */

/**
 * The three heights the sheet settles at.
 *
 * `peek` leaves the design almost the whole screen and the sheet a strip you
 * can still read a heading from — it is what the drag is for. `half` is where
 * the sheet opens, which is roughly what it was fixed at before. `full` is for
 * working through a long list of sections without the list scrolling under
 * your thumb every few items.
 *
 * Three, not a free drag: a sheet that stays wherever it was let go ends up at
 * 37% and stays there, and the person has to fiddle with it again on every
 * visit. Snapping means a flick has a destination.
 */
export const SNAPS = [0.22, 0.68, 0.92] as const;

export const PEEK = SNAPS[0];
export const OPEN = SNAPS[1];
export const FULL = SNAPS[2];

/** Where the sheet starts, and returns to when it is reopened. */
export const DEFAULT_SNAP = OPEN;

/**
 * The share of the editor the sheet should take, given a drag in progress.
 *
 * `travel` is how far the pointer has moved since it went down, in pixels,
 * positive downwards — the direction that makes the sheet smaller. Clamped to
 * the outermost snaps, so dragging past the bottom does not close the sheet
 * out from under the finger and dragging past the top does not cover the
 * header it is attached to.
 */
export function heightDuringDrag(
  startHeight: number,
  travel: number,
  editorHeight: number,
): number {
  if (editorHeight <= 0) return startHeight;
  const next = startHeight - travel / editorHeight;
  return Math.min(FULL, Math.max(PEEK, next));
}

/**
 * Where it lands when the finger comes off.
 *
 * A flick goes one snap in the direction it was thrown, however short it was;
 * a slow drag goes to whichever snap it ended up nearest. That distinction is
 * the whole feel of a sheet: without it, a quick flick down from `full` stops
 * at `half` because that is the nearest, and the gesture reads as ignored.
 *
 * `velocity` is in fractions of the editor per second, positive downwards.
 */
const FLICK = 0.9;

export function settle(height: number, velocity: number): number {
  const flicked = Math.abs(velocity) > FLICK;

  if (flicked) {
    // The snap beyond where it is now, in the direction of travel. `velocity`
    // is positive downwards and the list runs upwards, hence the inversion.
    const ordered = [...SNAPS];
    if (velocity > 0) {
      const below = ordered.filter((snap) => snap < height - 0.01);
      if (below.length > 0) return below[below.length - 1];
      return ordered[0];
    }
    const above = ordered.filter((snap) => snap > height + 0.01);
    if (above.length > 0) return above[0];
    return ordered[ordered.length - 1];
  }

  let best = SNAPS[0] as number;
  let bestGap = Infinity;
  for (const snap of SNAPS) {
    const gap = Math.abs(snap - height);
    if (gap < bestGap) {
      bestGap = gap;
      best = snap;
    }
  }
  return best;
}

/**
 * Whether a drag on the sheet's body should move the sheet or scroll the list.
 *
 * The rule every bottom sheet needs and most get wrong. A list scrolled to the
 * top, pulled down, moves the sheet — that is how you put it away without
 * reaching for the handle. A list scrolled anywhere else keeps the gesture,
 * because otherwise reading down a list of twenty sections drags the sheet shut
 * the moment you overshoot the end.
 */
export function dragOwnsGesture(scrollTop: number, travel: number): boolean {
  return scrollTop <= 0 && travel > 0;
}
