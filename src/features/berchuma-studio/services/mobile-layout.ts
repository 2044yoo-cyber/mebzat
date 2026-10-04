/**
 * How tall the 3D viewport is on a phone.
 *
 * The studio used to be a fixed-height column: the drawing took what was left
 * after the header, and the controls came up over it as a sheet. That gave the
 * drawing a strip in the middle of the screen and made editing and watching
 * two different states of the same screen.
 *
 * It is now an ordinary scrolling page whose viewport sticks to the top of the
 * scrollport, so the chrome above scrolls away and the controls scroll *under*
 * the model rather than over it. Which means something has to decide how much
 * of the visible area the model keeps, and this is it.
 *
 * ## Measured, not calculated from dvh
 *
 * `100dvh` is the whole screen. The studio sits inside a top bar, a tab strip
 * and — on a phone — a navigation bar fixed over the bottom of it, and every
 * previous attempt in this codebase to subtract those by hand got a number
 * wrong and put a control under the fold. So the caller measures the scrollport
 * it is actually in and measures what covers it, and these functions do
 * arithmetic on real numbers rather than guesses about chrome.
 */

/**
 * The share of the visible area the model keeps.
 *
 * Two thirds and a bit. Enough that the model is the screen rather than a band
 * across it, and little enough that the first row of controls is visible
 * underneath without scrolling — which is what makes it obvious they are there.
 */
export const VIEWPORT_SHARE = 0.68;

/**
 * Controls always show at least this much, so they are never a hidden strip.
 *
 * Not a free choice: it has to be big enough to bite before the floor below
 * does, or it never applies to anything. The share leaves `usable * 0.32` for
 * the controls, so this rule only starts to matter below `PEEK / 0.32`, and the
 * floor takes over at `MIN_VIEWPORT + PEEK`. At 108 those two crossed the wrong
 * way round — the floor won everywhere the peek would have — and the constant
 * was decoration. Mutating it changed no behaviour, which is how that was
 * found. At 132 it governs a real band, roughly a 370–410 px column: a small
 * window, or a short phone on its side.
 */
export const MIN_CONTROLS_PEEK = 132;

/** And the model never shrinks below this, however little room there is. */
export const MIN_VIEWPORT = 240;

/**
 * What is left of the scrollport once whatever is fixed over it is taken off.
 *
 * On a phone the navigation bar is `position: fixed` at the bottom of the
 * window, on top of the scrolling column rather than inside it — so the column
 * believes it is taller than the part of it anybody can see. A viewport sized
 * to the column's own height puts its bottom row of controls behind the bar.
 */
export function usableHeight(scrollport: number, coveredAtBottom: number): number {
  return Math.max(0, scrollport - Math.max(0, coveredAtBottom));
}

/**
 * How tall to make the sticky viewport, given the room there is.
 *
 * Zero for a scrollport that has not been measured yet: the caller leaves the
 * height unset until it has a real number, so the first paint is the CSS
 * fallback rather than a box of the wrong size that then jumps.
 */
export function stickyViewportHeight(usable: number): number {
  if (usable <= 0) return 0;

  const wanted = Math.round(usable * VIEWPORT_SHARE);

  // Never so tall that the controls below it are off the screen entirely.
  const leavingRoom = Math.min(wanted, usable - MIN_CONTROLS_PEEK);

  // ...and never so short it stops being a model. On a very short screen the
  // floor wins and the controls give way, because a 90 px drawing is not worth
  // having whatever is under it.
  return Math.max(Math.min(MIN_VIEWPORT, usable), leavingRoom);
}

/**
 * How much of a box a fixed bar covers at its bottom edge.
 *
 * Both rectangles come from `getBoundingClientRect`, so this is the overlap of
 * two windows-space boxes and needs no knowledge of which CSS variable the bar
 * was sized from. The bar is `lg:hidden`, so on a desktop there is no bar to
 * measure and the answer is zero without a special case.
 */
export function coveredAtBottom(
  box: { top: number; bottom: number },
  bar: { top: number; bottom: number } | null,
): number {
  if (!bar) return 0;
  const overlap = Math.min(box.bottom, bar.bottom) - Math.max(box.top, bar.top);
  return Math.max(0, overlap);
}
