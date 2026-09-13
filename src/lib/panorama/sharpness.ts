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
 * Below this a frame is not soft, it is smeared past use.
 *
 * An absolute floor, and deliberately a low one. This used to be a fraction of
 * the median of the frames already accepted, which was wrong in a way that
 * made the capture unusable: the score depends on what is in front of the
 * camera, not only on how still it was held. A wall with a picture rail scores
 * an order of magnitude above a plain painted one. So a target facing a blank
 * wall could never reach half of what a bookcase had scored, and was refused
 * over and over — a hundred and forty photographs to finish three points,
 * every one of them perfectly sharp.
 *
 * Comparing across scenes cannot work. What can be said absolutely is that a
 * frame with almost no second derivative anywhere has no edges at all, and a
 * room always has some. That is what this catches, and nothing else: slight
 * handheld softness passes, because this is a property tour and not tripod
 * work, and because stillness is enforced before the shutter rather than
 * judged after it.
 */
export const CLEARLY_BAD = 28;

/**
 * How many goes one target gets.
 *
 * Two. The first is almost always kept; a clearly smeared one buys a second,
 * and whichever of the two is sharper is then used whatever it scores. Nothing
 * about this loop can repeat.
 */
export const MAX_ATTEMPTS_PER_TARGET = 2;

/** Whether this frame is worth one more go, given how many it has had. */
export function shouldRetake(score: number, attempt: number): boolean {
  return score < CLEARLY_BAD && attempt < MAX_ATTEMPTS_PER_TARGET;
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
