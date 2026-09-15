/**
 * How far back "undo" goes, and what counts as one step.
 *
 * Kept as pure functions rather than living inside the hook, because the part
 * worth checking is the *bookkeeping* — what gets pushed, what gets merged
 * into the step before it, and what falls off the end — and none of that needs
 * React to be reasoned about.
 */

/**
 * How many steps back it remembers.
 *
 * A design is a few hundred kilobytes of structured clone, so this is not
 * free; forty is enough to get out of any sequence of edits somebody makes in
 * one sitting without holding a session's worth of them in memory.
 */
export const DEPTH = 40;

/**
 * Edits closer together than this are one step.
 *
 * Dragging a cabinet across the screen calls the setter on every animation
 * frame — sixty times a second, each one a complete new design. Pushed
 * individually, a single drag would fill the whole history, and pressing undo
 * would appear to do nothing at all: it would step back one frame of a
 * gesture, which is a millimetre.
 *
 * So an edit arriving hard on the heels of the last one replaces it rather
 * than stacking on it, and the history holds where the cabinet *was before the
 * drag* rather than where it was a sixtieth of a second ago.
 *
 * 400 ms because it has to be longer than a frame by a wide margin and shorter
 * than the gap between two things a person meant separately. Pressing "+" twice
 * quickly is the case this gets wrong — it records one step, not two — and
 * that is the right way round: merging two steps loses an undo, splitting a
 * drag loses the feature.
 */
export const COALESCE_MS = 400;

export type Step<T> = { state: T; at: number };

/**
 * Whether a new edit continues the last one or begins a new step.
 *
 * `previousAt` is null when there is no history yet, which is always a new
 * step: the first edit on a design has to be undoable back to the design.
 */
export function continuesStep(
  previousAt: number | null,
  now: number,
  coalesceMs: number = COALESCE_MS,
): boolean {
  if (previousAt === null) return false;
  return now - previousAt < coalesceMs;
}

/**
 * The history after an edit.
 *
 * `past` holds the states to go *back* to, oldest first. The state being
 * replaced is what gets pushed — not the new one — because undo means "put
 * back what was there before this edit".
 *
 * A continuing edit does not push: the top of the stack is already the state
 * this whole gesture started from, and pushing again would bury it under a
 * frame of itself.
 */
export function remember<T>(
  past: Step<T>[],
  replacing: T,
  now: number,
  depth: number = DEPTH,
): Step<T>[] {
  const top = past[past.length - 1] ?? null;
  if (continuesStep(top?.at ?? null, now)) {
    // Same gesture. Keep the state from before it began, but move the clock
    // forward so a drag that runs for four seconds does not split in two
    // halfway through.
    return [...past.slice(0, -1), { state: top!.state, at: now }];
  }

  const next = [...past, { state: replacing, at: now }];
  return next.length > depth ? next.slice(next.length - depth) : next;
}

/** The state to go back to, and the history that remains. Null when empty. */
export function rewind<T>(past: Step<T>[]): { state: T; past: Step<T>[] } | null {
  const top = past[past.length - 1];
  if (!top) return null;
  return { state: top.state, past: past.slice(0, -1) };
}

/** Whether there is anything to go back to. */
export function canRewind<T>(past: Step<T>[]): boolean {
  return past.length > 0;
}
