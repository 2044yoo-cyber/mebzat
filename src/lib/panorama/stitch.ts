/**
 * Turning a ring of overlapping photographs into one equirectangular image.
 *
 * ## What this is, and what it deliberately is not
 *
 * No AI. Nothing here invents a pixel it was not given; every output pixel
 * comes from an input pixel, and where two inputs overlap the output is a
 * weighted average of both. A room this cannot see stays a seam, not a
 * hallucination.
 *
 * It is also not a general-purpose stitcher. OpenCV's `Stitcher` solves a hard
 * problem — arbitrary photographs in arbitrary poses — using feature
 * detection, RANSAC and bundle adjustment, and it needs a native binary this
 * deployment cannot carry. The problem here is much smaller, because the
 * capture screen constrains it: one person, one spot, one axis of rotation,
 * and a recorded yaw for every frame.
 *
 * That reduces the transform between adjacent frames from a full homography to
 * essentially one number — how far round the phone turned — with a small
 * vertical correction for the hand drifting up or down. Solving for one number
 * is cheap enough to do on a normal server inside a request, which is why
 * there is no queue and no worker here.
 *
 * ## The nine steps, and where each one is
 *
 *  1. detect overlapping regions       `overlapWindow`
 *  2. match adjacent frames            `matchOffset`  (normalised cross-correlation)
 *  3. calculate the transformation     `solvePlacements`
 *  4. warp                             `columnAngles` → the caller's resampler
 *  5. align                            `solvePlacements`, accumulating offsets
 *  6. exposure compensation            `exposureGains`
 *  7. seam calculation                 `bestSeam`
 *  8. blend                            `featherWeights`
 *  9. output                           the caller composites onto a 2:1 canvas
 *
 * Steps 1, 2, 3, 5, 6, 7 and 8 are here, as pure functions over plain arrays,
 * so they can be checked without a camera, a browser or a GPU. The warping and
 * compositing need an image library and live in the route that calls this.
 *
 * ## Matching on intensity rather than sparse features
 *
 * A feature detector (ORB, SIFT) finds corners, describes them, and matches
 * descriptors. It is the right tool when the transform has eight unknowns. Here
 * it has essentially one, and a plain normalised cross-correlation over the
 * overlap strip finds it directly: slide one strip across the other, and the
 * offset with the highest correlation is the answer. It is conventional image
 * registration, it has no training data and no model, and on a 200-column strip
 * it costs microseconds.
 *
 * Normalised, specifically — not a plain sum of differences. Two frames of the
 * same wall taken a second apart can differ in exposure by a stop, and an
 * unnormalised score would then prefer the darkest alignment over the correct
 * one.
 */

/** The output is equirectangular: 360° across, 180° down, so twice as wide as tall. */
export const EQUIRECT_RATIO = 2;

/** Section 4: eight to twelve frames, every 30–45°. */
export const MIN_FRAMES = 8;
export const MAX_FRAMES = 12;
export const DEFAULT_FRAMES = 9;

/**
 * The angles to capture at, evenly spaced around one turn.
 *
 * Evenly spaced because the overlap between consecutive frames is what the
 * matcher works on, and an uneven ring leaves one pair with too little of it
 * and another with more than it needs.
 */
export function capturePlan(frames = DEFAULT_FRAMES): number[] {
  const n = Math.min(Math.max(Math.round(frames), MIN_FRAMES), MAX_FRAMES);
  const step = 360 / n;
  return Array.from({ length: n }, (_, i) => Math.round(i * step * 10) / 10);
}

/** The gap between captures, in degrees. */
export function captureStep(frames = DEFAULT_FRAMES): number {
  return 360 / Math.min(Math.max(Math.round(frames), MIN_FRAMES), MAX_FRAMES);
}

/**
 * How far round the phone is from the angle it should next capture at.
 *
 * Signed and wrapped to (-180, 180], so 350° to 10° is +20 rather than -340.
 * The capture screen uses the sign to say "keep turning" rather than "you have
 * gone too far", and the magnitude to decide when to fire.
 */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

/**
 * Whether two frames at these angles overlap enough to be matched.
 *
 * Section 17 asks for a real message when they do not. The horizontal field of
 * view of a phone's rear camera is around 65°; two frames 40° apart therefore
 * share about 25° of view, which is a quarter of each frame and plenty. Two
 * frames 70° apart share nothing, and no amount of cleverness recovers that —
 * the answer is to say so and ask the person to turn more slowly.
 */
export function hasUsableOverlap(
  degreesApart: number,
  fovDegrees = 65,
  minOverlapDegrees = 12,
): boolean {
  return Math.abs(degreesApart) <= fovDegrees - minOverlapDegrees;
}

/**
 * The columns of each frame that the other one also saw.
 *
 * Returned as fractions of the frame width, so the caller can scale them to
 * whatever resolution it is working at.
 */
export function overlapWindow(
  degreesApart: number,
  fovDegrees = 65,
): { leftStart: number; rightEnd: number; fraction: number } | null {
  const shared = fovDegrees - Math.abs(degreesApart);
  if (shared <= 0) return null;

  const fraction = shared / fovDegrees;
  return {
    // The right-hand edge of the earlier frame,
    leftStart: 1 - fraction,
    // and the left-hand edge of the later one.
    rightEnd: fraction,
    fraction,
  };
}

/**
 * Mean luminance per column, which is what the matcher actually compares.
 *
 * One number per column rather than a 2-D patch: the unknown is horizontal, so
 * collapsing the vertical axis throws away nothing that matters and turns the
 * search from O(w·h·range) into O(w·range). It also makes the match robust to
 * the small vertical drift a handheld capture always has.
 */
export function columnProfile(
  grey: Uint8Array | number[],
  width: number,
  height: number,
): Float64Array {
  const profile = new Float64Array(width);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = 0; y < height; y += 1) sum += grey[y * width + x];
    profile[x] = sum / height;
  }
  return profile;
}

/** Pearson correlation of two equal-length slices. 1 is identical, 0 is nothing. */
export function correlate(
  a: Float64Array | number[],
  b: Float64Array | number[],
): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;

  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i += 1) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  const denom = Math.sqrt(varA * varB);
  // A flat strip — a blank wall, an overexposed window — has no variance and
  // therefore no answer. Zero, not one: "I cannot tell" must not read as "a
  // perfect match", or a featureless wall would win every alignment.
  return denom === 0 ? 0 : cov / denom;
}

export type Match = {
  /** Columns to shift the later frame by, relative to where the angle put it. */
  offset: number;
  /** How much to trust it. Below `MIN_CONFIDENCE` the angle is used instead. */
  confidence: number;
};

/** Under this, the correlation peak is noise and the recorded angle is better. */
export const MIN_CONFIDENCE = 0.35;

/**
 * The horizontal correction between two frames, by sliding one over the other.
 *
 * `expected` is where the recorded yaw says the seam is; the search only looks
 * `searchRadius` columns either side of it. That is the whole reason this is
 * cheap — an unconstrained search would be the width of the frame, and would
 * also find false peaks in a repeating pattern like a tiled floor or a row of
 * identical windows. The angle keeps it honest.
 */
export function matchOffset(
  left: Float64Array,
  right: Float64Array,
  expected: number,
  searchRadius = 40,
): Match {
  let best = { offset: expected, confidence: 0 };

  for (let shift = expected - searchRadius; shift <= expected + searchRadius; shift += 1) {
    // The overlapping span at this shift, in the left frame's coordinates.
    const start = Math.max(0, shift);
    const end = Math.min(left.length, right.length + shift);
    const span = end - start;
    // Too little left to compare is not a match, however well it scores.
    if (span < 16) continue;

    const a = left.subarray(start, end);
    const b = right.subarray(start - shift, end - shift);
    const score = correlate(a, b);

    if (score > best.confidence) best = { offset: shift, confidence: score };
  }

  return best;
}

export type FramePlacement = {
  index: number;
  /** Where this frame's left edge sits on the output, in columns. */
  x: number;
  /** What the match was worth. Carried so the caller can report a weak stitch. */
  confidence: number;
};

/**
 * Where every frame sits on the finished panorama.
 *
 * Accumulated left to right: each frame is placed relative to the one before
 * it, so an error in one pair carries forward. That is the nature of a single
 * pass, and the correction for it is the last step — the ring has to close,
 * because the first frame and the last are the same wall.
 *
 * The residual is spread evenly across every frame rather than dumped on the
 * final seam. Dumping it makes one join visibly wrong and the rest perfect,
 * which is exactly where a viewer's eye goes; spreading it makes every join
 * slightly soft, which nobody notices.
 */
export function solvePlacements(
  matches: Match[],
  nominalStep: number,
  totalWidth: number,
): FramePlacement[] {
  const placements: FramePlacement[] = [{ index: 0, x: 0, confidence: 1 }];

  let x = 0;
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    // A match nobody should trust falls back to the angle the phone recorded,
    // which is never wildly wrong even when it is not precise.
    const step = match.confidence >= MIN_CONFIDENCE ? match.offset : nominalStep;
    x += step;
    placements.push({ index: i + 1, x, confidence: match.confidence });
  }

  // The ring must close. `n` frames evenly spaced around a full turn put frame
  // i at i·width/n, so after the n−1 accumulated steps the last frame belongs
  // at width·(n−1)/n — not at the full width, which would be the position of
  // the frame after it, which is the first frame again.
  const n = placements.length;
  if (n > 1) {
    const expectedFinal = (totalWidth * (n - 1)) / n;
    const drift = x - expectedFinal;
    if (drift !== 0) {
      const perFrame = drift / (n - 1);
      for (let i = 1; i < n; i += 1) {
        placements[i].x -= perFrame * i;
      }
    }
  }

  return placements;
}

/**
 * Per-frame brightness multipliers, so the seams do not band.
 *
 * A phone's automatic exposure changes as it turns — a window in frame makes
 * the next shot darker — and the join between a bright frame and a dark one is
 * a vertical stripe no amount of blending hides.
 *
 * Every frame is scaled towards the mean of all of them. Towards, not to: the
 * darkening at the edge of a wide lens is real, and flattening it completely
 * costs more than the banding it fixes.
 */
export function exposureGains(means: number[], strength = 0.8): number[] {
  const usable = means.filter((m) => m > 0);
  if (usable.length === 0) return means.map(() => 1);

  const target = usable.reduce((sum, m) => sum + m, 0) / usable.length;

  return means.map((mean) => {
    if (mean <= 0) return 1;
    const full = target / mean;
    const gain = 1 + (full - 1) * strength;
    // A frame that is nearly black would otherwise be multiplied into noise.
    return Math.min(Math.max(gain, 0.5), 2);
  });
}

/**
 * The column in the overlap where the two frames disagree least.
 *
 * Cutting at a fixed midpoint puts the seam wherever it lands, which on a
 * moving subject is through the middle of somebody walking past. Cutting where
 * the two frames already agree hides the join in whatever they both saw the
 * same way — usually a flat stretch of wall or floor.
 */
export function bestSeam(
  left: Float64Array,
  right: Float64Array,
  from: number,
  to: number,
): number {
  if (to <= from) return from;

  let bestX = from;
  let bestCost = Infinity;
  for (let x = from; x < to; x += 1) {
    const cost = Math.abs(left[x] - right[x]);
    if (cost < bestCost) {
      bestCost = cost;
      bestX = x;
    }
  }
  return bestX;
}

/**
 * The weight of the later frame across a blend band, 0 to 1.
 *
 * A hard cut at the seam shows as a line wherever the two frames differ at all
 * — and after exposure compensation they still differ a little. A linear ramp
 * across a band of columns spreads that difference over enough pixels that the
 * eye stops finding an edge.
 */
export function featherWeights(bandWidth: number): Float64Array {
  const width = Math.max(1, Math.round(bandWidth));
  const weights = new Float64Array(width);
  for (let i = 0; i < width; i += 1) {
    // +1 in the denominator so the band never starts at a full 0 or ends at a
    // full 1: both extremes are a hard cut by another name.
    weights[i] = (i + 1) / (width + 1);
  }
  return weights;
}

/**
 * The longitude each output column stands for.
 *
 * Equirectangular means the horizontal axis is longitude, linearly: column 0 is
 * -180°, the middle is 0°, the last column approaches +180°.
 */
export function columnAngles(width: number): Float64Array {
  const angles = new Float64Array(width);
  for (let x = 0; x < width; x += 1) {
    angles[x] = (x / width) * 360 - 180;
  }
  return angles;
}

/**
 * The output size for a given source frame width.
 *
 * Section 19 is explicit that a reliable medium-resolution panorama beats a
 * slow high-resolution one, so this is capped well below what the frames could
 * in principle support. 4096×2048 is the cap the `panoramas` bucket and the
 * viewer already work to.
 */
export function outputSize(
  frameWidth: number,
  frameCount: number,
): { width: number; height: number } {
  // Each frame covers roughly 360/n degrees of the finished image, so the
  // natural width is its own width times the number of frames, less overlap.
  const natural = Math.round(frameWidth * frameCount * 0.62);
  const width = Math.min(4096, Math.max(2048, natural - (natural % 2)));
  return { width, height: width / EQUIRECT_RATIO };
}

// ---------------------------------------------------------------------------
// Why a stitch failed, in words somebody can act on
// ---------------------------------------------------------------------------

export const STITCH_ERRORS = {
  too_few_frames:
    "There were not enough photos to make a full circle. Try again and keep turning until the ring is complete.",
  no_overlap:
    "We couldn't stitch this panorama because the photos did not overlap enough. Please try again and rotate more slowly.",
  frames_missing:
    "Some photos did not finish uploading. Check your connection and try again.",
  decode_failed:
    "One of the photos could not be read. Please capture the room again.",
  too_large:
    "Those photos were too large to process. Try again — the app will use a smaller size.",
  unknown:
    "Something went wrong making your 360 photo. Your photos are saved, so you can try again.",
} as const;

export type StitchError = keyof typeof STITCH_ERRORS;

export function stitchErrorMessage(code: string | null | undefined): string {
  if (code && code in STITCH_ERRORS) {
    return STITCH_ERRORS[code as StitchError];
  }
  return STITCH_ERRORS.unknown;
}
