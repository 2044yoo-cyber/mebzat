import "server-only";

import sharp from "sharp";

import {
  ASSUMED_HFOV,
} from "./sphere";
import {
  basisFrom,
  directionOf,
  dot,
  verticalFov,
  type Basis,
  type Vector3,
} from "./orientation";

/**
 * Photographs of a room in, one equirectangular panorama out.
 *
 * ## Why the old one collapsed to a point
 *
 * It projected every frame onto a cylinder and laid them out in a row. A
 * cylinder has no top and no bottom, so the rows of the output above and below
 * the band that had actually been photographed were filled by stretching the
 * nearest pixels outwards — and at the pole, "outwards" is every direction at
 * once, so the whole ceiling converged on one point. The funnel was not a bug
 * in the blending. It was the projection being asked a question it could not
 * answer.
 *
 * This maps the sphere instead. Every output pixel is a direction; for each
 * direction it asks which photographs can see it and samples them. A direction
 * nothing photographed gets no pixels, rather than somebody else's pixels
 * stretched to reach it — which is why the capture screen will not let anybody
 * finish with a hole in the sphere.
 *
 * ## The pose comes from the phone, then from the pixels
 *
 * Each frame arrives with the yaw, pitch and roll the phone reported when it
 * was taken. That is a good first guess and a bad final answer: the sensors
 * drift, and a degree of error puts a doorway two hundred pixels from itself.
 * So the poses are refined against the image content — each frame is nudged
 * over a small grid of offsets and scored against the mosaic already built,
 * which is the same normalised cross-correlation the old cylindrical stitcher
 * used, in two dimensions instead of one.
 */

export type FrameInput = {
  /** Where the phone said it was pointing, in the capture's local frame. */
  yaw: number;
  pitch: number;
  roll: number;
  /** What the camera sees across, in degrees. */
  hfov?: number;
  bytes: Uint8Array;
};

export type StitchOutcome =
  | {
      ok: true;
      jpeg: Buffer;
      width: number;
      height: number;
      /** How much of the sphere ended up with real pixels, 0–1. */
      covered: number;
      /** Frames the refinement could not settle against their neighbours. */
      weakSeams: number;
      /**
       * How well the frames could be brought into agreement, -1 to 1.
       *
       * The median correlation between each frame and the mosaic its
       * neighbours had already built, which is a direct measure of whether one
       * rotation can explain them all. Around 0.4 is a phone turned about
       * itself; it falls off a cliff as the lens moves away from the point the
       * person is turning about, because no rotation can account for the
       * camera having travelled.
       */
      alignment: number;
    }
  | { ok: false; code: string };

/** Below this the panorama has holes worth refusing rather than publishing. */
export const MIN_COVERAGE = 0.9;

/**
 * How well the frames have to agree before the result is worth showing.
 *
 * This is the quality check, and what it is really measuring is parallax. A
 * phone turned about roughly its own position photographs a room that one
 * rotation explains, and each frame correlates strongly with the mosaic its
 * neighbours have already built. A phone held out at arm's length travels
 * through an arc as its owner turns, so every frame sees the room from
 * somewhere slightly different, and nothing — no rotation, no refinement —
 * can bring them into register. That is the melting.
 *
 * Calibrated on the synthetic room, varying only how far the lens sits from
 * the point it turns about:
 *
 *     at the axis   0.41      15cm   0.21
 *     5cm           0.43      20cm   0.15
 *     10cm          0.31      30cm   0.05      40cm   0.06
 *
 * 0.12 sits in the collapse: a phone held against the chest passes, one held
 * out at arm's length does not — which is the difference the instructions have
 * been asking for since the beginning and nothing has ever checked.
 */
export const MIN_ALIGNMENT = 0.12;

/** The widest output worth making from phone frames. */
const MAX_OUTPUT_WIDTH = 4096;

/** What each frame is decoded to before it is sampled. */
const WORK_WIDTH = 1400;

/** The low-resolution pass the pose refinement scores against. */
const REFINE_WIDTH = 512;

/** How far a frame may be nudged from where the phone said it was. */
const REFINE_RANGE = 3;
const REFINE_STEP = 1;

/**
 * How close to the best frame another has to be before it is blended in.
 *
 * This is the seam. Feathering across the whole overlap — which is what this
 * used to do — averages two photographs of the same wall over a third of every
 * frame, and wherever they do not agree to the pixel the result is both of
 * them at half strength: a sofa with a second sofa inside it, a person you can
 * see through. Alignment is never that good, because the phone is not rotating
 * about its own lens.
 *
 * So each pixel is taken from whichever frame is looking most directly at it,
 * and the others are mixed in only where they are within a tenth of being the
 * best themselves. That is a narrow band along the line midway between two
 * frames — enough to hide the join, too narrow to double anything.
 */
const SEAM_SHARE = 0.9;

/**
 * How far the low-frequency blend is spread, as a fraction of the image width.
 *
 * The seam fixes doubling and creates a different problem: two frames metered
 * a moment apart differ in brightness, and choosing one of them per pixel puts
 * that difference on a line. The eye finds a straight edge in a flat wall
 * immediately, however small the step.
 *
 * So the picture is built twice. Detail comes from the seamed composite, where
 * each pixel has one frame and nothing is doubled. Colour and brightness come
 * from a widely feathered one, where two frames fade into each other across
 * the whole overlap so no step can form — and where the doubling that
 * feathering causes lives entirely in detail that is then thrown away. Adding
 * the first's detail to the second's colour is two-band blending, which is
 * what section 10 asks for.
 */
const BAND_SIGMA = 0.006;

/** Below this correlation the refinement did not find anything to lock onto. */
const WEAK_SEAM = 0.25;

/**
 * How much better than leaving it alone a nudge has to score before it is
 * taken.
 *
 * Without this the refinement is free to move every frame by whatever offset
 * scored highest on noise, and because each frame is then painted at its new
 * pose for the next one to match against, those movements accumulate: on a
 * synthetic room with exactly correct poses the whole ring drifted three
 * degrees and the output got thirty times worse. A correction has to earn its
 * place against the sensor reading, which is already a good answer.
 */
const ACCEPT_MARGIN = 0.05;

type Decoded = {
  pose: { yaw: number; pitch: number; roll: number };
  hfov: number;
  vfov: number;
  width: number;
  height: number;
  pixels: Uint8Array;
  gain: number;
};

/** A sphere's worth of accumulated colour, waiting to be divided by its weight. */
type Canvas = {
  width: number;
  height: number;
  sum: Float32Array;
  weight: Float32Array;
};

function blankCanvas(width: number, height: number): Canvas {
  return {
    width,
    height,
    sum: new Float32Array(width * height * 3),
    weight: new Float32Array(width * height),
  };
}

export async function composePanorama(
  frames: FrameInput[],
): Promise<StitchOutcome> {
  if (frames.length < 4) return { ok: false, code: "too_few_frames" };

  // ---- decode, at a size worth sampling -----------------------------------
  const decoded: Decoded[] = [];
  for (const frame of frames) {
    try {
      const image = sharp(Buffer.from(frame.bytes), { failOn: "none" }).rotate();
      const meta = await image.metadata();
      if (!meta.width || !meta.height) return { ok: false, code: "unreadable" };

      const scale = Math.min(1, WORK_WIDTH / meta.width);
      const width = Math.max(1, Math.round(meta.width * scale));
      const height = Math.max(1, Math.round(meta.height * scale));

      const { data } = await image
        .resize(width, height, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const hfov = frame.hfov && frame.hfov > 20 ? frame.hfov : ASSUMED_HFOV;
      decoded.push({
        pose: { yaw: frame.yaw, pitch: frame.pitch, roll: frame.roll },
        hfov,
        vfov: verticalFov(hfov, width, height),
        width,
        height,
        pixels: new Uint8Array(data),
        gain: 1,
      });
    } catch {
      return { ok: false, code: "unreadable" };
    }
  }

  // Exposure is compensated during refinement, where each frame can be
  // compared with its neighbours over the ground they actually share. It used
  // to be done here, from whole-frame averages against the median of the set,
  // and that is wrong for a reason worth writing down: a frame pointed at a
  // window is legitimately brighter than one pointed at a dark corner, and
  // scaling them towards a common average flattens the room. On the synthetic
  // room with frames that were already evenly exposed it made the result four
  // times further from the truth than leaving them alone.

  // ---- order: the horizon first, then outwards ----------------------------
  //
  // Each frame is refined against what is already down, so the order decides
  // what there is to refine against. Starting at the horizon and working
  // towards the poles means every frame after the first few has a neighbour.
  const order = decoded
    .map((frame, index) => ({ frame, index }))
    .sort((a, b) => {
      const byPitch = Math.abs(a.frame.pose.pitch) - Math.abs(b.frame.pose.pitch);
      return byPitch !== 0 ? byPitch : a.frame.pose.yaw - b.frame.pose.yaw;
    })
    .map((entry) => entry.frame);

  // ---- refine the poses against the pixels --------------------------------
  const { weak: weakSeams, alignment } = refinePoses(order);

  // Checked before a pixel is painted, so a capture that did not come together
  // costs nothing further and is never shown as a panorama.
  if (alignment < MIN_ALIGNMENT) return { ok: false, code: "poor_alignment" };

  // ---- paint the sphere ----------------------------------------------------
  const outWidth = outputWidth(order);
  const height = outWidth / 2;
  const table = yawTable(outWidth);

  // Who owns what, before anything is drawn.
  const best = new Float32Array(outWidth * height);
  {
    const probe = blankCanvas(outWidth, height);
    for (const frame of order) survey(best, probe, frame, table);
  }

  // The detail: one frame per pixel, so nothing is doubled.
  const seamed = blankCanvas(outWidth, height);
  for (const frame of order) paint(seamed, frame, table, best, "seam");
  const { rgb, covered } = resolve(seamed);
  release(seamed);

  if (covered < MIN_COVERAGE) return { ok: false, code: "incomplete_sphere" };

  // The colour: every frame that can see a pixel, faded across the whole
  // overlap, so brightness changes gradually and no step can form.
  const wide = blankCanvas(outWidth, height);
  for (const frame of order) paint(wide, frame, table, best, "wide");
  const spread = resolve(wide).rgb;
  release(wide);

  try {
    const blended = await blendBands(rgb, spread, outWidth, height);

    const jpeg = await sharp(Buffer.from(blended), {
      raw: { width: outWidth, height, channels: 3 },
    })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    return {
      ok: true,
      jpeg,
      width: outWidth,
      height,
      covered,
      weakSeams,
      alignment,
    };
  } catch {
    return { ok: false, code: "unknown" };
  }
}

/** Let a canvas go before the next one is allocated. Both at once is 270MB. */
function release(canvas: Canvas): void {
  canvas.sum = new Float32Array(0);
  canvas.weight = new Float32Array(0);
}

/**
 * Detail from the first, colour from the second.
 *
 * Both are blurred by the same amount. What that removes from the seamed
 * picture is its colour, and what it leaves in the feathered one is only
 * colour — so the seamed picture minus its own blur is pure detail, and adding
 * it to the feathered one's blur gives a picture that is sharp where the
 * seamed one is sharp and smooth where the feathered one is smooth.
 */
async function blendBands(
  detail: Uint8Array,
  colour: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const sigma = Math.max(2, Math.round(width * BAND_SIGMA));
  const raw = { width, height, channels: 3 as const };

  const [detailLow, colourLow] = await Promise.all([
    sharp(Buffer.from(detail), { raw }).blur(sigma).raw().toBuffer(),
    sharp(Buffer.from(colour), { raw }).blur(sigma).raw().toBuffer(),
  ]);

  const out = new Uint8Array(width * height * 3);
  for (let i = 0; i < out.length; i += 1) {
    const value = detail[i] - detailLow[i] + colourLow[i];
    out[i] = value < 0 ? 0 : value > 255 ? 255 : value;
  }
  return out;
}

/**
 * The output's width, which sets its height at half.
 *
 * A frame covering 60° across at 1400px implies 8400px for a full turn, which
 * is more than a phone's optics justify and more than a phone can then
 * display. This takes what the frames support and caps it.
 */
function outputWidth(frames: Decoded[]): number {
  const best = frames.reduce(
    (wide, frame) => Math.max(wide, (frame.width * 360) / frame.hfov),
    0,
  );
  const capped = Math.min(MAX_OUTPUT_WIDTH, Math.max(2048, best));
  // Even, and a multiple of two so the 2:1 height is a whole number.
  return Math.round(capped / 64) * 64;
}

/**
 * Nudge each frame until it agrees with its neighbours.
 *
 * Scored on a small canvas, because the question is whether a wall lines up
 * and not what its grout looks like — and because the search is a few dozen
 * placements per frame, which at full size would be the whole stitch over
 * again for each one.
 */
function refinePoses(order: Decoded[]): { weak: number; alignment: number } {
  const scores: number[] = [];
  const canvas = blankCanvas(REFINE_WIDTH, REFINE_WIDTH / 2);
  const table = yawTable(canvas.width);
  // The refinement lays frames down one at a time and matches each against
  // what is already there, so there is no complete survey to seam against.
  // Every frame is its own best view here, which is what a flat allowance of
  // zero means.
  const flat = new Float32Array(canvas.width * canvas.height);
  let weak = 0;

  order.forEach((frame, index) => {
    if (index === 0) {
      paint(canvas, frame, table, flat);
      return;
    }

    // What staying put is worth. Every other placement is measured against it,
    // and it is also the evidence for whether this capture worked at all.
    const staying = agreement(canvas, frame, 0, 0).score;
    // -1 is `agreement` saying it could not tell — too little shared ground,
    // or a wall so blank there is no pattern to match. That is not a frame
    // that disagrees, so it is not counted as one.
    if (staying > -1) scores.push(staying);

    let best = { score: staying, dYaw: 0, dPitch: 0 };
    for (let dy = -REFINE_RANGE; dy <= REFINE_RANGE; dy += REFINE_STEP) {
      for (let dp = -REFINE_RANGE; dp <= REFINE_RANGE; dp += REFINE_STEP) {
        if (dy === 0 && dp === 0) continue;
        const score = agreement(canvas, frame, dy, dp).score;
        if (score > best.score) best = { score, dYaw: dy, dPitch: dp };
      }
    }

    // Nothing to lock onto — a blank wall, or no overlap at all. The phone's
    // own reading is then the best answer available, so it is kept rather than
    // replaced by whichever offset happened to score highest on noise.
    if (best.score < WEAK_SEAM) {
      weak += 1;
    } else if (best.score > staying + ACCEPT_MARGIN) {
      frame.pose.yaw += best.dYaw;
      frame.pose.pitch = clamp(frame.pose.pitch + best.dPitch, -90, 90);
    }

    // Now that it is in the right place, how bright is it against what is
    // already there? Sequential, so the correction travels round the room from
    // the first frame rather than every frame being pulled towards an average
    // none of them should match.
    const settled = agreement(canvas, frame, 0, 0);
    if (settled.score > WEAK_SEAM) {
      frame.gain = clamp(settled.ratio, 0.7, 1.45);
    }

    paint(canvas, frame, table, flat);
  });

  // The median rather than the mean: one frame pointed at a blank ceiling
  // should not condemn a capture, and one lucky frame should not rescue one.
  const sorted = [...scores].sort((a, b) => a - b);
  const alignment =
    sorted.length === 0 ? 1 : sorted[Math.floor(sorted.length / 2)];

  return { weak, alignment };
}

/**
 * How well a frame agrees with what is already on the canvas, at an offset.
 *
 * Normalised cross-correlation over the pixels they share: normalised because
 * the two may differ in brightness and the question is whether the *pattern*
 * matches, not whether the exposure does.
 */
function agreement(
  canvas: Canvas,
  frame: Decoded,
  dYaw: number,
  dPitch: number,
): { score: number; ratio: number } {
  const basis = basisFrom(
    frame.pose.yaw + dYaw,
    clamp(frame.pose.pitch + dPitch, -90, 90),
    frame.pose.roll,
  );
  const tanH = Math.tan((frame.hfov / 2) * (Math.PI / 180));
  const tanV = Math.tan((frame.vfov / 2) * (Math.PI / 180));

  let n = 0;
  let sumA = 0;
  let sumB = 0;
  let sumAA = 0;
  let sumBB = 0;
  let sumAB = 0;

  const box = footprint(canvas, frame, dPitch);
  for (let y = box.top; y <= box.bottom; y += 2) {
    const pitch = 90 - (y / (canvas.height - 1)) * 180;
    for (let i = 0; i < box.columns.length; i += 2) {
      const x = box.columns[i];
      const index = y * canvas.width + x;
      if (canvas.weight[index] <= 0) continue;

      const yaw = (x / canvas.width) * 360;
      const hit = sample(frame, directionOf(yaw, pitch), basis, tanH, tanV);
      if (!hit) continue;

      const w = canvas.weight[index];
      const a =
        (0.2126 * canvas.sum[index * 3] +
          0.7152 * canvas.sum[index * 3 + 1] +
          0.0722 * canvas.sum[index * 3 + 2]) /
        w;
      const b = (0.2126 * hit.r + 0.7152 * hit.g + 0.0722 * hit.b) * frame.gain;
      n += 1;
      sumA += a;
      sumB += b;
      sumAA += a * a;
      sumBB += b * b;
      sumAB += a * b;
    }
  }

  // Too little shared ground to be evidence of anything.
  if (n < 60) return { score: -1, ratio: 1 };

  // How much brighter the neighbours are than this frame, over the ground they
  // share. That — and not a comparison of whole-frame averages — is exposure
  // compensation: it asks whether the same wall came out the same brightness
  // twice, which is answerable, rather than whether two different walls did,
  // which is not.
  const ratio = sumB > 1 ? sumA / sumB : 1;

  const varA = sumAA - (sumA * sumA) / n;
  const varB = sumBB - (sumB * sumB) / n;
  if (varA <= 1e-6 || varB <= 1e-6) return { score: -1, ratio };
  return {
    score: (sumAB - (sumA * sumB) / n) / Math.sqrt(varA * varB),
    ratio,
  };
}

/** Which output pixels one frame could possibly touch. */
function footprint(
  canvas: Canvas,
  frame: Decoded,
  dPitch = 0,
): { top: number; bottom: number; columns: number[] } {
  const pitch = clamp(frame.pose.pitch + dPitch, -90, 90);
  // The half-angle to a corner, which is what actually bounds the frame.
  const halfDiag =
    (Math.atan(
      Math.hypot(
        Math.tan((frame.hfov / 2) * (Math.PI / 180)),
        Math.tan((frame.vfov / 2) * (Math.PI / 180)),
      ),
    ) *
      180) /
    Math.PI;

  const top = Math.max(
    0,
    Math.floor(((90 - (pitch + halfDiag)) / 180) * (canvas.height - 1)),
  );
  const bottom = Math.min(
    canvas.height - 1,
    Math.ceil(((90 - (pitch - halfDiag)) / 180) * (canvas.height - 1)),
  );

  // Near a pole a frame spans every longitude, so there is no useful column
  // range to narrow to — and cos(pitch) there is the number that would make
  // the arithmetic below divide by nearly zero.
  const columns: number[] = [];
  const flat = Math.cos((pitch * Math.PI) / 180);
  if (Math.abs(pitch) + halfDiag >= 88 || flat < 1e-3) {
    for (let x = 0; x < canvas.width; x += 1) columns.push(x);
    return { top, bottom, columns };
  }

  const halfYaw = Math.min(180, halfDiag / flat);
  const centre = (frame.pose.yaw / 360) * canvas.width;
  const span = Math.ceil((halfYaw / 360) * canvas.width);
  for (let d = -span; d <= span; d += 1) {
    columns.push((Math.round(centre) + d + canvas.width * 2) % canvas.width);
  }
  return { top, bottom, columns };
}

/** Read one direction out of one frame, bilinearly, or null if it misses. */
function sample(
  frame: Decoded,
  direction: Vector3,
  basis: Basis,
  tanH: number,
  tanV: number,
): { r: number; g: number; b: number; edge: number } | null {
  const depth = dot(direction, basis.forward);
  if (depth <= 1e-6) return null;

  const sx = dot(direction, basis.right) / depth / tanH;
  const sy = dot(direction, basis.up) / depth / tanV;
  if (sx < -1 || sx > 1 || sy < -1 || sy > 1) return null;

  const fx = ((sx + 1) / 2) * (frame.width - 1);
  const fy = ((1 - sy) / 2) * (frame.height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(frame.width - 1, x0 + 1);
  const y1 = Math.min(frame.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const at = (x: number, y: number, c: number) =>
    frame.pixels[(y * frame.width + x) * 3 + c];

  const mix = (c: number) =>
    (at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx) * (1 - ty) +
    (at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx) * ty;

  return {
    r: mix(0),
    g: mix(1),
    b: mix(2),
    // 1 in the middle of the frame, 0 at its edge. This is the feathering:
    // where two frames overlap, the one looking more directly at the wall
    // contributes more, and neither arrives as a hard line.
    edge: (1 - Math.abs(sx)) * (1 - Math.abs(sy)),
  };
}

/**
 * A canvas-wide table of the sine and cosine of every column's yaw.
 *
 * Built once and reused by every frame. Without it the inner loop of the
 * stitch runs four trigonometric functions per pixel per frame — about eighty
 * million of them for one panorama, which was most of the time the whole
 * stitch took.
 */
function yawTable(width: number): { sin: Float64Array; cos: Float64Array } {
  const sin = new Float64Array(width);
  const cos = new Float64Array(width);
  for (let x = 0; x < width; x += 1) {
    const yaw = ((x / width) * 360 * Math.PI) / 180;
    sin[x] = Math.sin(yaw);
    cos[x] = Math.cos(yaw);
  }
  return { sin, cos };
}

/**
 * How well each frame can see each pixel, keeping only the best.
 *
 * The first of two passes: nothing is sampled and no colour is read, because
 * the question is only which frame owns which part of the sphere. `paint` then
 * asks each frame again and takes it only where it is at or near the best.
 */
function survey(
  best: Float32Array,
  canvas: Canvas,
  frame: Decoded,
  table: ReturnType<typeof yawTable>,
): void {
  const basis = basisFrom(frame.pose.yaw, frame.pose.pitch, frame.pose.roll);
  const tanH = Math.tan((frame.hfov / 2) * (Math.PI / 180));
  const tanV = Math.tan((frame.vfov / 2) * (Math.PI / 180));
  const box = footprint(canvas, frame);

  const [fx0, fy0, fz0] = basis.forward;
  const [rx, ry, rz] = basis.right;
  const [ux, uy, uz] = basis.up;

  for (let y = box.top; y <= box.bottom; y += 1) {
    const pitch = ((90 - (y / (canvas.height - 1)) * 180) * Math.PI) / 180;
    const flat = Math.cos(pitch);
    const dz = Math.sin(pitch);
    const row = y * canvas.width;

    for (const x of box.columns) {
      const dx = flat * table.sin[x];
      const dy = flat * table.cos[x];

      const depth = dx * fx0 + dy * fy0 + dz * fz0;
      if (depth <= 1e-6) continue;

      const sx = (dx * rx + dy * ry + dz * rz) / depth / tanH;
      if (sx < -1 || sx > 1) continue;
      const sy = (dx * ux + dy * uy + dz * uz) / depth / tanV;
      if (sy < -1 || sy > 1) continue;

      const q = (1 - (sx < 0 ? -sx : sx)) * (1 - (sy < 0 ? -sy : sy));
      if (q > best[row + x]) best[row + x] = q;
    }
  }
}

/**
 * Add one frame's contribution to the canvas.
 *
 * Written flat — no per-pixel objects, the projection inlined — because this
 * is the loop that runs tens of millions of times. `sample` says the same
 * thing more legibly and is what the refinement uses, where it runs on a
 * canvas a seventh the width and legibility is worth more than the
 * microseconds.
 */
function paint(
  canvas: Canvas,
  frame: Decoded,
  table: ReturnType<typeof yawTable>,
  best: Float32Array,
  /** Seam: one frame per pixel. Wide: everything that can see it. */
  mode: "seam" | "wide" = "seam",
): void {
  const basis = basisFrom(frame.pose.yaw, frame.pose.pitch, frame.pose.roll);
  const tanH = Math.tan((frame.hfov / 2) * (Math.PI / 180));
  const tanV = Math.tan((frame.vfov / 2) * (Math.PI / 180));
  const box = footprint(canvas, frame);

  const [fx0, fy0, fz0] = basis.forward;
  const [rx, ry, rz] = basis.right;
  const [ux, uy, uz] = basis.up;
  const { pixels, width: fw, height: fh, gain } = frame;
  const lastX = fw - 1;
  const lastY = fh - 1;

  for (let y = box.top; y <= box.bottom; y += 1) {
    const pitch = ((90 - (y / (canvas.height - 1)) * 180) * Math.PI) / 180;
    const flat = Math.cos(pitch);
    const dz = Math.sin(pitch);
    const row = y * canvas.width;

    for (const x of box.columns) {
      const dx = flat * table.sin[x];
      const dy = flat * table.cos[x];

      const depth = dx * fx0 + dy * fy0 + dz * fz0;
      if (depth <= 1e-6) continue;

      const sx = (dx * rx + dy * ry + dz * rz) / depth / tanH;
      if (sx < -1 || sx > 1) continue;
      const sy = (dx * ux + dy * uy + dz * uz) / depth / tanV;
      if (sy < -1 || sy > 1) continue;

      const px = ((sx + 1) / 2) * lastX;
      const py = ((1 - sy) / 2) * lastY;
      const x0 = px | 0;
      const y0 = py | 0;
      const x1 = x0 < lastX ? x0 + 1 : lastX;
      const y1 = y0 < lastY ? y0 + 1 : lastY;
      const tx = px - x0;
      const ty = py - y0;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;

      const i00 = (y0 * fw + x0) * 3;
      const i10 = (y0 * fw + x1) * 3;
      const i01 = (y1 * fw + x0) * 3;
      const i11 = (y1 * fw + x1) * 3;

      // 1 in the middle of the frame, 0 at its edge. A frame is used only
      // where it is the best view of this pixel, or within a tenth of being
      // it; everywhere else another frame is looking more directly at the
      // same wall and this one would only be a second copy of it.
      const q = (1 - (sx < 0 ? -sx : sx)) * (1 - (sy < 0 ? -sy : sy));

      let w: number;
      if (mode === "wide") {
        w = q * q + 1e-4;
      } else {
        const over = q - best[row + x] * SEAM_SHARE;
        if (over <= 0) continue;
        w = over * over;
      }
      const gw = gain * w;

      const out = (row + x) * 3;
      canvas.sum[out] +=
        (pixels[i00] * w00 + pixels[i10] * w10 + pixels[i01] * w01 + pixels[i11] * w11) * gw;
      canvas.sum[out + 1] +=
        (pixels[i00 + 1] * w00 + pixels[i10 + 1] * w10 + pixels[i01 + 1] * w01 + pixels[i11 + 1] * w11) * gw;
      canvas.sum[out + 2] +=
        (pixels[i00 + 2] * w00 + pixels[i10 + 2] * w10 + pixels[i01 + 2] * w01 + pixels[i11 + 2] * w11) * gw;
      canvas.weight[row + x] += w;
    }
  }
}

/**
 * Divide the accumulated colour by its weight, and deal with what is missing.
 *
 * Small holes — a pixel or two between two frames that not quite met — are
 * filled from their neighbours. Anything larger is left grey, because filling
 * it would mean inventing a part of the room nobody photographed, and because
 * a panorama with a grey patch is a panorama somebody can see is unfinished.
 * The capture screen is what stops it getting this far.
 */
function resolve(canvas: Canvas): { rgb: Uint8Array; covered: number } {
  const { width, height } = canvas;
  const rgb = new Uint8Array(width * height * 3);
  const filled = new Uint8Array(width * height);

  let covered = 0;
  for (let i = 0; i < width * height; i += 1) {
    const w = canvas.weight[i];
    if (w > 0) {
      rgb[i * 3] = clamp(canvas.sum[i * 3] / w, 0, 255);
      rgb[i * 3 + 1] = clamp(canvas.sum[i * 3 + 1] / w, 0, 255);
      rgb[i * 3 + 2] = clamp(canvas.sum[i * 3 + 2] / w, 0, 255);
      filled[i] = 1;
      covered += 1;
    }
  }

  // A bounded number of passes, so this can only close seams — it cannot creep
  // across a missing ceiling one ring of pixels at a time.
  for (let pass = 0; pass < 6; pass += 1) {
    const grown = filled.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (filled[i]) continue;
        let n = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = (x + dx + width) % width;
            const j = ny * width + nx;
            if (!filled[j]) continue;
            n += 1;
            r += rgb[j * 3];
            g += rgb[j * 3 + 1];
            b += rgb[j * 3 + 2];
          }
        }
        if (n >= 3) {
          rgb[i * 3] = r / n;
          rgb[i * 3 + 1] = g / n;
          rgb[i * 3 + 2] = b / n;
          grown[i] = 1;
        }
      }
    }
    filled.set(grown);
  }

  for (let i = 0; i < width * height; i += 1) {
    if (!filled[i]) {
      rgb[i * 3] = 28;
      rgb[i * 3 + 1] = 28;
      rgb[i * 3 + 2] = 30;
    }
  }

  return { rgb, covered: covered / (width * height) };
}



function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}
