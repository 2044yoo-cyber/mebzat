/**
 * Is this frame in focus, and is the phone where it started?
 *
 * Both are asked of pixels rather than of sensors, and both are here rather
 * than in the capture screen so they can be checked without a camera.
 */

/**
 * How much fine detail a frame carries, as the variance of a Laplacian.
 *
 * A sharp photograph of a room has edges — door frames, skirting, the line
 * where a wall meets a ceiling — and neighbouring pixels differ sharply across
 * them. Motion blur smears exactly those, so the second derivative collapses
 * while the average brightness does not change at all. It is the standard
 * measure and it is cheap: one pass, no allocation beyond the sum.
 *
 * The number is not comparable between rooms — a blank white wall scores low
 * however sharp it is — so it is used against the frames of the same capture
 * rather than against a fixed threshold.
 */
export function focusScore(
  grey: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0;

  let total = 0;
  let n = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      // The four-neighbour Laplacian: how far this pixel is from the average
      // of the ones around it.
      const lap =
        4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - width] - grey[i + width];
      total += lap * lap;
      n += 1;
    }
  }

  return n === 0 ? 0 : total / n;
}

/**
 * How much sharper than its fellows a frame has to be to be kept.
 *
 * Against the running median of the capture rather than a constant, because
 * the number depends on the room: a bedroom with patterned wallpaper scores an
 * order of magnitude above a white corridor, and a fixed threshold would
 * either reject everything in the corridor or nothing in the bedroom.
 */
export const BLUR_FRACTION = 0.45;

/** Whether a frame is sharp enough to keep, given what this room scores. */
export function isSharpEnough(score: number, reference: number): boolean {
  // Nothing to compare against yet — the first frame of a capture is kept, and
  // becomes the reference the rest are judged by.
  if (reference <= 0) return true;
  return score >= reference * BLUR_FRACTION;
}

/** The middle value, which is what the reference should be. */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * How far the phone has moved away from the spot the capture started at.
 *
 * The hard part of parallax is that nothing on a phone measures position.
 * Accelerometers measure acceleration, and turning that into distance means
 * integrating twice, which turns a small constant error into a large and
 * growing one — a phone sitting still on a table will have "moved" several
 * metres within a minute.
 *
 * So this does not try to know where the phone is. It accumulates how much
 * *un-rotational* movement there has been: acceleration that gravity and
 * turning do not account for. That is a quantity that stays near zero for
 * somebody turning on the spot and grows steadily for somebody walking, which
 * is the distinction worth drawing. It decays, so standing still again lets
 * the warning clear.
 */
export const DRIFT_WARNING = 1;

/** How quickly the accumulated movement fades once somebody stops moving. */
export const DRIFT_DECAY = 0.94;

/**
 * Fold one acceleration reading into the running total.
 *
 * `magnitude` is the size of the acceleration with gravity already removed,
 * in m/s², which is what `DeviceMotionEvent.acceleration` reports. Small
 * wobbles are ignored outright: a hand is never perfectly still and counting
 * its tremor would warn everybody.
 */
export function accumulateDrift(
  drift: number,
  magnitude: number,
  seconds: number,
): number {
  const meaningful = Math.max(0, magnitude - 0.6);
  return Math.max(0, drift * DRIFT_DECAY + meaningful * seconds);
}

export function hasDrifted(drift: number): boolean {
  return drift >= DRIFT_WARNING;
}
