import "server-only";

import sharp from "sharp";

import {
  horizontalFovFromFx,
  intrinsicsFromFov,
  type CameraIntrinsics,
} from "./camera";
import { ASSUMED_HFOV } from "./sphere";
import {
  angleBetween,
  basisFrom,
  directionOf,
  dot,
  forwardOf,
  isRotationMatrix,
  rollOf,
  verticalFov,
  yawPitchOf,
  type Basis,
  type Matrix3,
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
  targetId?: string;
  imageNumber?: number;
  captureOrder?: number;
  /** Where the phone said it was pointing, in the capture's local frame. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Full camera-to-world rotation after screen-orientation correction. */
  rotation?: Matrix3 | number[];
  intrinsics?: CameraIntrinsics;
  /** What the camera sees across, in degrees. */
  hfov?: number;
  vfov?: number;
  calibrationSource?: "device" | "intrinsics" | "estimated";
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
       * The lower-quartile correlation between each frame and a mosaic of its
       * angular neighbours, which directly measures whether one
       * rotation can explain them all. Around 0.4 is a phone turned about
       * itself; it falls off a cliff as the lens moves away from the point the
       * person is turning about, because no rotation can account for the
       * camera having travelled.
       */
      alignment: number;
      /** Horizontal camera angle recovered from the overlapping photographs. */
      fieldOfView: number;
      /** Capture targets excluded because their pixels contradicted their pose. */
      rejectedTargetIds: string[];
      debug?: {
        gyroOnly: Buffer;
        refined: Buffer;
        noBlending: Buffer;
      };
    }
  | {
      ok: false;
      code: string;
      rejectedTargetIds?: string[];
      debug?: { gyroOnly: Buffer; refined: Buffer; noBlending: Buffer };
    };

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
 * Calibrated on the synthetic room, 22 frames at 1440x1080, three degrees of
 * pose error, varying only how far the lens sits from the point it turns
 * about:
 *
 *     at the axis   0.625     20cm   0.434, and only 91% covered
 *     5cm           0.718     30cm   refused
 *     10cm          0.713     40cm   refused
 *     15cm          0.731     60cm   refused
 *
 * A phone held against the chest passes at about four times the floor; one
 * held out at arm's length is refused. That is the difference the instructions
 * have been asking for since the beginning.
 *
 * ## Why this table replaces one that read 0.41 / 0.21 / 0.05
 *
 * The old numbers were measured against a plan whose rings did not meet. The
 * app asked the camera for a 16:9 frame, which at 70 degrees across is 43
 * degrees tall, and the plan spaced its rings 45 degrees apart — so between
 * every pair of rings ran a band nobody photographed, and the frames on either
 * side of it had nothing to correlate against. Every score on that table was
 * depressed by a geometry defect rather than by parallax, and a correct
 * capture came back at 0.21 with the floor at 0.18.
 *
 * That is what produced "Some areas could not be aligned correctly" for
 * somebody who had held the phone exactly as asked. The fix is in sphere.ts:
 * the ring spacing is derived from how tall a frame is, and the capture asks
 * for the 4:3 frame the plan is sized for.
 *
 * Near the collapse the score moves about with the particular pose errors — a
 * different draw of the same three degrees puts 30cm either side of the line.
 * That is the reason for a floor well under a good capture rather than just
 * under one: the number being separated is 0.7 from 0.4, not 0.21 from 0.18.
 */
export const MIN_ALIGNMENT = 0.18;

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
 * The second pass: finer, and against nearby spherical neighbours rather than
 * only the neighbours that happened to come first.
 *
 * The first pass lays frames down one at a time and matches each against those
 * already placed, which has a weakness that shows in exactly the wrong place.
 * The first frame is never refined at all, the second is refined against one
 * neighbour, and the plan starts at the horizon — so the most visible part of
 * the room gets the least correction, and every frame after inherits whatever
 * error those first few kept. That is what bends a ceiling line where two
 * frames meet.
 *
 * So every frame is then refined again against a mosaic of only the frames
 * whose gyro footprints can overlap it, with itself left out. Leaving it out
 * matters: a frame compared against itself always prefers not to move.
 */
const POLISH_RANGE = 1.5;
const POLISH_STEP = 0.5;

/**
 * How well the frames must already agree before the second pass is worth
 * running.
 *
 * Because it only helps when a single rotation can explain the frames. Where
 * one can, refining each against all the others finds it: on the synthetic
 * room photographed from the axis it took the correlation from 0.947 to 0.953
 * and halved the badly-placed pixels. Where one cannot — a phone carried round
 * at arm's length, so every frame sees the room from somewhere else — there is
 * nothing to converge on, and the same pass chases the parallax instead,
 * making it slightly worse: 0.904 down to 0.897.
 *
 * So it is run when the first pass says the frames admit a rotation, and
 * skipped when it says they do not. That also means the four seconds it costs
 * are only spent when they buy something.
 */
const POLISH_ABOVE = 0.45;

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
 * So each pixel leans towards whichever frame is looking most directly at it,
 * and the others are mixed in across a wide band either side of the line
 * midway between them.
 *
 * ## Why this moved from 0.9 back towards feathering
 *
 * 0.9 meant a frame contributed only where it was within a tenth of being the
 * best view of a pixel — a narrow band, and effectively a cut. That was the
 * right call when it was made and the wrong one to leave: it was chosen while
 * the plan's rings did not overlap at all, when alignment was around 0.63 and
 * feathering genuinely doubled furniture. With the geometry fixed, alignment
 * on the same room is 0.82, and two frames that agree that well can be faded
 * into each other without doubling anything.
 *
 * What a cut costs, on the other hand, is visible at every join, because two
 * photographs of one wall never agree exactly and a cut puts the whole of that
 * disagreement on one line. Measured on the synthetic room, going from 0.9 to
 * fully feathered costs 0.8 of a percentage point of edge crispness (82.3% to
 * 81.5%) and visibly evens out the flat walls.
 *
 * 0.25 keeps a little of the preference — enough that a badly placed frame
 * does not get equal say in a region another frame is looking straight at —
 * while blending across most of the overlap.
 */
const SEAM_SHARE = 0.25;

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

/** Visual evidence may fine-tune a gyro pose, never replace it. */
export const MAX_GYRO_CORRECTION = 3.5;

/** A measurable neighbour match below this is actively contradictory. */
export const FRAME_REJECT_BELOW = 0.2;

/** Recover an estimated lens angle only when overlap evidence is already sound. */
const FOV_SEARCH = [-12, -9, -6, -3, 0, 3, 6, 9, 12] as const;
const FOV_ACCEPT_MARGIN = 0.025;
const FOV_MIN_CONFIDENCE = 0.55;

type Decoded = {
  id: string;
  captureOrder: number;
  pose: { yaw: number; pitch: number; roll: number };
  gyro: { yaw: number; pitch: number; roll: number };
  hfov: number;
  vfov: number;
  intrinsics: CameraIntrinsics;
  calibrationSource: "device" | "intrinsics" | "estimated";
  width: number;
  height: number;
  pixels: Uint8Array;
  gain: number;
  confidence: number;
  accepted: boolean;
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
  options: { debug?: boolean } = {},
): Promise<StitchOutcome> {
  if (frames.length < 4) return { ok: false, code: "too_few_frames" };

  // ---- decode, at a size worth sampling -----------------------------------
  const decoded: Decoded[] = [];
  for (const [frameIndex, frame] of frames.entries()) {
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

      const inputIntrinsics = validIntrinsics(frame.intrinsics)
        ? scaleIntrinsics(frame.intrinsics, width, height)
        : null;
      const hfov = inputIntrinsics
        ? horizontalFovFromFx(width, inputIntrinsics.fx)
        : frame.hfov && frame.hfov > 20
          ? frame.hfov
          : ASSUMED_HFOV;
      const vfov = inputIntrinsics
        ? (2 * Math.atan(height / (2 * inputIntrinsics.fy)) * 180) / Math.PI
        : frame.vfov && frame.vfov > 15
          ? frame.vfov
          : verticalFov(hfov, width, height);
      const intrinsics = inputIntrinsics ?? intrinsicsFromFov(width, height, hfov, vfov);
      const rotation = isRotationMatrix(frame.rotation) ? frame.rotation : null;
      const fromMatrix = rotation ? yawPitchOf(forwardOf(rotation)) : null;
      const pose = {
        yaw: fromMatrix?.yaw ?? frame.yaw,
        pitch: fromMatrix?.pitch ?? frame.pitch,
        roll: rotation ? rollOf(rotation) : frame.roll,
      };
      decoded.push({
        id: frame.targetId ?? `frame_${frameIndex + 1}`,
        captureOrder: frame.captureOrder ?? frameIndex + 1,
        pose,
        gyro: { ...pose },
        hfov,
        vfov,
        intrinsics,
        calibrationSource: frame.calibrationSource ?? "estimated",
        width,
        height,
        pixels: new Uint8Array(data),
        gain: 1,
        confidence: -1,
        accepted: true,
      });
    } catch {
      return { ok: false, code: "unreadable" };
    }
  }

  // The lens's own falloff, divided out before anything looks at a pixel.
  //
  // First, because everything downstream reads these buffers: the pose
  // refinement correlates them, the exposure ratio is measured across them,
  // and the sphere is painted from them. Correcting here means all three see
  // an evenly lit frame, and nothing else in the file has to know this
  // happened.
  //
  // Null when the frames show no meaningful falloff, and then nothing is
  // touched — a lens that is already even must not be "corrected" by a profile
  // made of whatever the room happened to look like.
  const vignette = estimateVignette(decoded);
  if (vignette) {
    for (const frame of decoded) applyVignette(frame, vignette);
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

  // Most browsers report pixels but not focal length. Treating every rear
  // camera as one fixed angle changes every overlap and bends doors at joins.
  // Device-reported intrinsics win; visual calibration is allowed only from a
  // well-correlated horizon, because a weak guess must never fold the room.
  const fieldOfView = calibrateFieldOfView(order);
  const gyroOrder = order.map((frame) => ({
    ...frame,
    pose: { ...frame.gyro },
    gyro: { ...frame.gyro },
    accepted: true,
    gain: 1,
  }));

  // ---- refine the poses against the pixels --------------------------------
  const { weak: weakSeams, alignment, rejectedTargetIds } = refinePoses(order);
  const debug = options.debug
    ? await createDebugOutputs(
        gyroOrder,
        order,
        outputWidth(order),
        outputWidth(order) / 2,
      ).catch(() => undefined)
    : undefined;

  // Checked before a pixel is painted, so a capture that did not come together
  // costs nothing further and is never shown as a panorama.
  if (alignment < MIN_ALIGNMENT) {
    return { ok: false, code: "poor_alignment", rejectedTargetIds, debug };
  }

  const accepted = order.filter((frame) => frame.accepted);
  if (accepted.length < 4) {
    return { ok: false, code: "retake_required", rejectedTargetIds, debug };
  }

  // ---- paint the sphere ----------------------------------------------------
  const outWidth = outputWidth(accepted);
  const height = outWidth / 2;
  const table = yawTable(outWidth);

  // Who owns what, before anything is drawn.
  const best = new Float32Array(outWidth * height);
  {
    const probe = blankCanvas(outWidth, height);
    for (const frame of accepted) survey(best, probe, frame, table);
  }

  // The detail: one frame per pixel, so nothing is doubled.
  const seamed = blankCanvas(outWidth, height);
  for (const frame of accepted) paint(seamed, frame, table, best, "seam");
  const { rgb, covered } = resolve(seamed);
  release(seamed);

  if (covered < MIN_COVERAGE) {
    return {
      ok: false,
      code: rejectedTargetIds.length > 0 ? "retake_required" : "incomplete_sphere",
      rejectedTargetIds,
      debug,
    };
  }

  // The colour: every frame that can see a pixel, faded across the whole
  // overlap, so brightness changes gradually and no step can form.
  const wide = blankCanvas(outWidth, height);
  for (const frame of accepted) paint(wide, frame, table, best, "wide");
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
      fieldOfView,
      rejectedTargetIds,
      debug,
    };
  } catch {
    return { ok: false, code: "unknown" };
  }
}

function calibrateFieldOfView(order: Decoded[]): number {
  if (order.some((frame) => frame.calibrationSource !== "estimated")) {
    return median(order.map((frame) => frame.hfov));
  }
  const horizon = order.filter((frame) => Math.abs(frame.pose.pitch) <= 35);
  if (horizon.length < 6) return order[0]?.hfov ?? ASSUMED_HFOV;
  const base = fovAgreement(horizon, 0);
  let best = { delta: 0, score: base };
  for (const delta of FOV_SEARCH) {
    if (delta === 0) continue;
    const score = fovAgreement(horizon, delta);
    if (score > best.score) best = { delta, score };
  }
  const accepted =
    base >= 0.35 &&
    best.score >= FOV_MIN_CONFIDENCE &&
    best.score > base + FOV_ACCEPT_MARGIN
      ? best.delta
      : 0;
  if (accepted !== 0) {
    for (const frame of order) {
      frame.hfov = clamp(frame.hfov + accepted, 40, 95);
      frame.vfov = verticalFov(frame.hfov, frame.width, frame.height);
      frame.intrinsics = intrinsicsFromFov(
        frame.width,
        frame.height,
        frame.hfov,
        frame.vfov,
      );
    }
  }
  const values = order.map((frame) => frame.hfov).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? ASSUMED_HFOV;
}

/** Median direct overlap agreement at one candidate lens angle. */
function fovAgreement(order: Decoded[], delta: number): number {
  const scores: number[] = [];
  const frames = order.map((original) => {
    const hfov = clamp(original.hfov + delta, 40, 95);
    const vfov = verticalFov(hfov, original.width, original.height);
    return {
      ...original,
      hfov,
      vfov,
      intrinsics: intrinsicsFromFov(original.width, original.height, hfov, vfov),
    };
  }).sort((a, b) => a.pose.yaw - b.pose.yaw);
  for (let index = 0; index < frames.length; index += 1) {
    const a = frames[index];
    const b = frames[(index + 1) % frames.length];
    const spacing = angleBetween(
      directionOf(a.pose.yaw, a.pose.pitch),
      directionOf(b.pose.yaw, b.pose.pitch),
    );
    // A candidate that claims only a sliver overlaps can get an impressive
    // correlation from one repeated light or one plain strip. It is not a
    // usable calibration and it is exactly how a room gets folded.
    if ((Math.min(a.hfov, b.hfov) - spacing) / Math.min(a.hfov, b.hfov) < 0.2) {
      scores.push(-1);
      continue;
    }
    let best = -1;
    // Sensor yaw can be a few degrees wrong; lens scale cannot be judged by
    // forcing that unrelated error into the score.
    for (let correction = -6; correction <= 6; correction += 1) {
      const aa = basisFrom(a.pose.yaw, a.pose.pitch, a.pose.roll);
      const bb = basisFrom(b.pose.yaw + correction, b.pose.pitch, b.pose.roll);
      let n = 0, sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
      for (let yaw = 0; yaw < 360; yaw += 2) {
        for (let pitch = -28; pitch <= 28; pitch += 4) {
          const direction = directionOf(yaw, pitch);
          const pa = sample(a, direction, aa);
          const pb = sample(b, direction, bb);
          if (!pa || !pb) continue;
          const la = 0.2126 * pa.r + 0.7152 * pa.g + 0.0722 * pa.b;
          const lb = 0.2126 * pb.r + 0.7152 * pb.g + 0.0722 * pb.b;
          n += 1; sumA += la; sumB += lb; sumAA += la * la; sumBB += lb * lb; sumAB += la * lb;
        }
      }
      const va = sumAA - sumA * sumA / Math.max(1, n);
      const vb = sumBB - sumB * sumB / Math.max(1, n);
      // A narrow candidate can manufacture a perfect score from one plain
      // strip because it says the frames barely overlap. That is not evidence
      // of a lens angle; require roughly eight shared longitude samples.
      const score = n < 80 || va <= 1e-6 || vb <= 1e-6 ? -1 : (sumAB - sumA * sumB / n) / Math.sqrt(va * vb);
      best = Math.max(best, score);
    }
    scores.push(best);
  }
  scores.sort((a, b) => a - b);
  return scores.length === 0 ? -1 : scores[Math.floor(scores.length * 0.25)];
}

/** Let a canvas go before the next one is allocated. Both at once is 270MB. */
function release(canvas: Canvas): void {
  canvas.sum = new Float32Array(0);
  canvas.weight = new Float32Array(0);
}

async function createDebugOutputs(
  gyro: Decoded[],
  refined: Decoded[],
  width: number,
  height: number,
): Promise<{ gyroOnly: Buffer; refined: Buffer; noBlending: Buffer }> {
  const [gyroOnly, refinedImage, noBlending] = await Promise.all([
    renderProjection(gyro, width, height),
    renderProjection(refined.filter((frame) => frame.accepted), width, height),
    renderDiagnostic(refined, width, height),
  ]);
  return { gyroOnly, refined: refinedImage, noBlending };
}

async function renderProjection(
  frames: Decoded[],
  width: number,
  height: number,
): Promise<Buffer> {
  const table = yawTable(width);
  const best = new Float32Array(width * height);
  const probe = blankCanvas(width, height);
  for (const frame of frames) survey(best, probe, frame, table);
  const canvas = blankCanvas(width, height);
  for (const frame of frames) paint(canvas, frame, table, best, "seam");
  const { rgb } = resolve(canvas);
  release(canvas);
  return sharp(Buffer.from(rgb), { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 84 })
    .toBuffer();
}

async function renderDiagnostic(
  frames: Decoded[],
  width: number,
  height: number,
): Promise<Buffer> {
  const best = new Float32Array(width * height);
  const owner = new Int16Array(width * height);
  owner.fill(-1);
  const probe = blankCanvas(width, height);
  const table = yawTable(width);
  frames.forEach((frame, index) => survey(best, probe, frame, table, owner, index));

  const canvas = blankCanvas(width, height);
  for (const frame of frames) paint(canvas, frame, table, best, "seam");
  const rgb = resolve(canvas).rgb;
  release(canvas);
  const colours = [
    [255, 80, 80], [70, 170, 255], [80, 220, 130], [255, 190, 60],
    [190, 100, 255], [40, 220, 220], [255, 110, 190], [180, 210, 50],
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = y * width + x;
      const frameIndex = owner[at];
      if (frameIndex < 0) continue;
      const colour = colours[frameIndex % colours.length];
      const pixel = at * 3;
      rgb[pixel] = rgb[pixel] * 0.78 + colour[0] * 0.22;
      rgb[pixel + 1] = rgb[pixel + 1] * 0.78 + colour[1] * 0.22;
      rgb[pixel + 2] = rgb[pixel + 2] * 0.78 + colour[2] * 0.22;
      const right = x + 1 < width ? owner[at + 1] : owner[y * width];
      const below = y + 1 < height ? owner[at + width] : frameIndex;
      if (right !== frameIndex || below !== frameIndex) {
        rgb[pixel] = 255;
        rgb[pixel + 1] = 255;
        rgb[pixel + 2] = 255;
      }
    }
  }

  const labels = frames.map((frame) => {
    const x = ((frame.pose.yaw % 360 + 360) % 360) / 360 * width;
    const y = (90 - frame.pose.pitch) / 180 * height;
    const confidence = frame.confidence < -0.99 ? "n/a" : frame.confidence.toFixed(2);
    const text = `#${frame.captureOrder} ${frame.id} yaw ${frame.pose.yaw.toFixed(1)} pitch ${frame.pose.pitch.toFixed(1)} roll ${frame.pose.roll.toFixed(1)} FOV ${frame.hfov.toFixed(1)} confidence ${confidence} ${frame.accepted ? "accepted" : "REJECTED"}`;
    return `<text x="${x.toFixed(0)}" y="${Math.max(18, y).toFixed(0)}" fill="white" stroke="black" stroke-width="3" paint-order="stroke" font-size="14">${escapeXml(text)}</text>`;
  }).join("");
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels}</svg>`,
  );
  return sharp(Buffer.from(rgb), { raw: { width, height, channels: 3 } })
    .composite([{ input: svg }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character] ?? character);
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
function refinePoses(
  order: Decoded[],
): { weak: number; alignment: number; rejectedTargetIds: string[] } {
  const roughScores: number[] = [];
  const canvas = blankCanvas(REFINE_WIDTH, REFINE_WIDTH / 2);
  const table = yawTable(canvas.width);
  const flat = new Float32Array(canvas.width * canvas.height);
  const placed: Decoded[] = [];

  // First pass: only frames whose gyro directions are close enough to overlap
  // may influence one another. A repeated light on the opposite wall is not a
  // neighbour, no matter how attractive its pixel correlation looks.
  for (const frame of order) {
    fillNeighbourCanvas(canvas, placed, frame, table, flat);
    const staying = agreement(canvas, frame, 0, 0).score;
    if (staying > -1) roughScores.push(staying);

    let best = { score: staying, dYaw: 0, dPitch: 0 };
    for (let dy = -REFINE_RANGE; dy <= REFINE_RANGE; dy += REFINE_STEP) {
      for (let dp = -REFINE_RANGE; dp <= REFINE_RANGE; dp += REFINE_STEP) {
        if (dy === 0 && dp === 0) continue;
        if (!withinGyroLimit(frame, dy, dp)) continue;
        const score = agreement(canvas, frame, dy, dp).score;
        if (score > best.score) best = { score, dYaw: dy, dPitch: dp };
      }
    }

    if (best.score > WEAK_SEAM && best.score > staying + ACCEPT_MARGIN) {
      frame.pose.yaw += best.dYaw;
      frame.pose.pitch = clamp(frame.pose.pitch + best.dPitch, -90, 90);
    }

    const settled = agreement(canvas, frame, 0, 0);
    if (settled.score > WEAK_SEAM) {
      frame.gain = clamp(settled.ratio, 0.7, 1.45);
    }
    placed.push(frame);
  }

  const roughSorted = [...roughScores].sort((a, b) => a - b);
  const rough =
    roughSorted.length === 0
      ? 1
      : roughSorted[Math.floor(roughSorted.length / 2)];

  // Rotation-only coordinate descent. This is deliberately not an unrestricted
  // homography or an all-pairs solve: nearby spherical neighbours contribute,
  // and every candidate remains inside the gyro trust region.
  if (rough >= POLISH_ABOVE) {
    for (const frame of order) {
      fillNeighbourCanvas(canvas, order, frame, table, flat);
      const staying = agreement(canvas, frame, 0, 0).score;
      if (staying <= -1) continue;

      let best = { score: staying, dYaw: 0, dPitch: 0 };
      for (let dy = -POLISH_RANGE; dy <= POLISH_RANGE; dy += POLISH_STEP) {
        for (let dp = -POLISH_RANGE; dp <= POLISH_RANGE; dp += POLISH_STEP) {
          if (dy === 0 && dp === 0) continue;
          if (!withinGyroLimit(frame, dy, dp)) continue;
          const score = agreement(canvas, frame, dy, dp).score;
          if (score > best.score) best = { score, dYaw: dy, dPitch: dp };
        }
      }

      if (best.score > WEAK_SEAM && best.score > staying + ACCEPT_MARGIN) {
        frame.pose.yaw += best.dYaw;
        frame.pose.pitch = clamp(frame.pose.pitch + best.dPitch, -90, 90);
      }
    }
  }

  // Judge each frame against a mosaic that does not contain itself. A blank
  // overlap is inconclusive and keeps the gyro placement; a measurable,
  // strongly negative overlap is contradictory and the frame is excluded.
  const scores: number[] = [];
  let weak = 0;
  for (const frame of order) {
    fillNeighbourCanvas(canvas, order, frame, table, flat);
    const result = agreement(canvas, frame, 0, 0);
    frame.confidence = result.score;
    if (result.score <= -1) {
      weak += 1;
      continue;
    }
    scores.push(result.score);
    if (
      result.score < FRAME_REJECT_BELOW ||
      !withinGyroLimit(frame, 0, 0)
    ) {
      frame.accepted = false;
    }
  }

  // A lower quartile catches a bad region without letting one blank ceiling
  // frame condemn an otherwise sound capture or one lucky seam rescue it.
  const sorted = scores.sort((a, b) => a - b);
  const alignment =
    sorted.length === 0 ? 1 : sorted[Math.floor(sorted.length * 0.25)];
  const rejectedTargetIds = order
    .filter((frame) => !frame.accepted)
    .map((frame) => frame.id);

  return { weak, alignment, rejectedTargetIds };
}

function fillNeighbourCanvas(
  canvas: Canvas,
  candidates: Decoded[],
  frame: Decoded,
  table: ReturnType<typeof yawTable>,
  flat: Float32Array,
): void {
  canvas.sum.fill(0);
  canvas.weight.fill(0);
  for (const other of candidates) {
    if (other !== frame && areAngularNeighbours(frame, other)) {
      paint(canvas, other, table, flat);
    }
  }
}

function areAngularNeighbours(a: Decoded, b: Decoded): boolean {
  const distance = angleBetween(
    directionOf(a.gyro.yaw, a.gyro.pitch),
    directionOf(b.gyro.yaw, b.gyro.pitch),
  );
  const reach = Math.max(a.hfov, a.vfov, b.hfov, b.vfov) * 1.25;
  return distance <= Math.min(105, reach);
}

function withinGyroLimit(frame: Decoded, dYaw: number, dPitch: number): boolean {
  const candidate = directionOf(
    frame.pose.yaw + dYaw,
    clamp(frame.pose.pitch + dPitch, -90, 90),
  );
  return (
    angleBetween(candidate, directionOf(frame.gyro.yaw, frame.gyro.pitch)) <=
    MAX_GYRO_CORRECTION
  );
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
      const hit = sample(frame, directionOf(yaw, pitch), basis);
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
): { r: number; g: number; b: number; edge: number } | null {
  const depth = dot(direction, basis.forward);
  if (depth <= 1e-6) return null;

  const px = frame.intrinsics.fx * (dot(direction, basis.right) / depth) + frame.intrinsics.cx;
  const py = frame.intrinsics.cy - frame.intrinsics.fy * (dot(direction, basis.up) / depth);
  if (px < 0 || px > frame.width - 1 || py < 0 || py > frame.height - 1) return null;

  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(frame.width - 1, x0 + 1);
  const y1 = Math.min(frame.height - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;

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
    edge: edgeWeight(frame, px, py),
  };
}

function edgeWeight(frame: Decoded, px: number, py: number): number {
  const halfX = Math.max(1, frame.width / 2);
  const halfY = Math.max(1, frame.height / 2);
  const x = Math.abs(px - frame.intrinsics.cx) / halfX;
  const y = Math.abs(py - frame.intrinsics.cy) / halfY;
  return Math.max(0, 1 - x) * Math.max(0, 1 - y);
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
  owner?: Int16Array,
  frameIndex = -1,
): void {
  const basis = basisFrom(frame.pose.yaw, frame.pose.pitch, frame.pose.roll);
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

      const px = frame.intrinsics.fx * ((dx * rx + dy * ry + dz * rz) / depth) + frame.intrinsics.cx;
      if (px < 0 || px > frame.width - 1) continue;
      const py = frame.intrinsics.cy - frame.intrinsics.fy * ((dx * ux + dy * uy + dz * uz) / depth);
      if (py < 0 || py > frame.height - 1) continue;

      const q = edgeWeight(frame, px, py);
      if (q > best[row + x]) {
        best[row + x] = q;
        if (owner) owner[row + x] = frameIndex;
      }
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

      const px = frame.intrinsics.fx * ((dx * rx + dy * ry + dz * rz) / depth) + frame.intrinsics.cx;
      if (px < 0 || px > lastX) continue;
      const py = frame.intrinsics.cy - frame.intrinsics.fy * ((dx * ux + dy * uy + dz * uz) / depth);
      if (py < 0 || py > lastY) continue;
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
      const q = edgeWeight(frame, px, py);

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
 * How much darker the lens is away from the middle, measured from the frames.
 *
 * ## What this fixes
 *
 * Every phone lens is darker at the corners of its frame than at the centre —
 * commonly ten to twenty-five per cent. Photograph a plain white ceiling with
 * five frames and lay them side by side and you get a row of bright middles
 * with dark boundaries between them: a lattice of scallops across a surface
 * that is one flat colour. On a real ceiling, seen through a viewer that shows
 * a chunk of the sphere at once, that lattice reads as wedges — the "diamond
 * shapes" a panorama gets described by.
 *
 * It is worth being precise about why no amount of blending fixes it. Blending
 * decides *which* frames a pixel comes from and in what proportion. Where two
 * frames meet, both of them are at their dark edge; averaging two dark corners
 * gives a dark corner. Measured on the synthetic room with a 22% falloff, a
 * plain white ceiling came out spanning 26 grey levels with the seam cut hard,
 * and 22 with it feathered all the way. The step is not in the join. It is in
 * the photographs.
 *
 * ## Why it is measured rather than assumed
 *
 * Falloff varies by phone, by lens, and with the aperture — there is no
 * constant to write down. But a capture is twenty-odd frames pointing in every
 * direction, so whatever the *room* looks like averages out across them, and
 * what survives at a given distance from the frame centre is the lens.
 *
 * So: bin every frame's pixels by how far they sit from the centre, average
 * across all frames, and normalise to the middle. What comes back is the
 * lens's own radial response.
 *
 * Returned as a lookup over r², so applying it needs no square root.
 */
const VIGNETTE_BINS = 24;

/** Below this the lens is even enough that correcting it is only noise. */
const VIGNETTE_MIN_FALLOFF = 0.04;

/** No pixel is brightened by more than this, however dark the corner read. */
const VIGNETTE_MAX_GAIN = 1.8;

export function estimateVignette(
  frames: readonly { pixels: Uint8Array; width: number; height: number }[],
): Float32Array | null {
  const sums = new Float64Array(VIGNETTE_BINS);
  const counts = new Float64Array(VIGNETTE_BINS);

  for (const frame of frames) {
    const { width, height, pixels } = frame;
    if (width < 8 || height < 8) continue;
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const maxR2 = cx * cx + cy * cy;
    if (maxR2 <= 0) continue;

    // Every fourth pixel each way. The profile is 24 numbers averaged over
    // millions of samples; reading all of them buys nothing.
    for (let y = 0; y < height; y += 4) {
      const dy = y - cy;
      for (let x = 0; x < width; x += 4) {
        const dx = x - cx;
        const t = (dx * dx + dy * dy) / maxR2;
        const bin = Math.min(VIGNETTE_BINS - 1, (t * VIGNETTE_BINS) | 0);
        const i = (y * width + x) * 3;
        sums[bin] += pixels[i] + pixels[i + 1] + pixels[i + 2];
        counts[bin] += 3;
      }
    }
  }

  if (counts[0] === 0) return null;

  const profile = new Float32Array(VIGNETTE_BINS);
  for (let b = 0; b < VIGNETTE_BINS; b += 1) {
    profile[b] = counts[b] > 0 ? sums[b] / counts[b] : 0;
  }

  // Fill any empty bin from the one before it, so the curve has no holes.
  for (let b = 1; b < VIGNETTE_BINS; b += 1) {
    if (profile[b] <= 0) profile[b] = profile[b - 1];
  }
  const centre = profile[0];
  if (centre <= 1) return null;

  // Fitted, not filtered.
  //
  // A lens's falloff is a smooth, near-quadratic function of distance from the
  // centre — cos-to-the-fourth, in the textbook idealisation. Anything sharp in
  // the binned profile is the *room* failing to average out, and applying it
  // would draw that room's structure onto every frame as concentric rings.
  //
  // This started as a three-tap average over the bins, which turned out to do
  // almost nothing: on a deliberately awful fixture — four frames of a room
  // made of concentric bands — it took the largest step between neighbouring
  // bins from 0.307 to 0.249, a fifth of the way. Fitting a quadratic in t
  // instead takes it to a curve with no steps in it at all, because the thing
  // being applied is a quadratic rather than 24 numbers.
  //
  // Least squares on [1, t, t²], solved directly: three unknowns, and a 3x3
  // normal-equations solve is less code than pulling in a matrix library.
  const smooth = fitQuadratic(profile);

  const falloff = 1 - smooth[VIGNETTE_BINS - 1] / centre;
  if (!Number.isFinite(falloff) || falloff < VIGNETTE_MIN_FALLOFF) return null;

  // The correction is the reciprocal of the response, and it only ever
  // brightens: a profile that comes back brighter at the edge than the middle
  // is the room, not the lens, and dimming the middle to match it would be
  // inventing a shadow.
  const gains = new Float32Array(VIGNETTE_BINS);
  for (let b = 0; b < VIGNETTE_BINS; b += 1) {
    const g = smooth[b] > 1 ? centre / smooth[b] : 1;
    gains[b] = Math.min(VIGNETTE_MAX_GAIN, Math.max(1, g));
  }
  return gains;
}

/**
 * The gain, applied so that it cannot clip and cannot darken.
 *
 * ## Why not simply multiply
 *
 * A white ceiling photographed by a phone sits around 230, and a corner gain of
 * 1.28 takes that to 294 — which clips at 255, and a clipped region is flat.
 * Correcting the vignette by multiplication alone *creates* an artefact at
 * exactly the place the vignette was most visible: a plain ceiling on the
 * synthetic room went from 26 grey levels of variation to 36, because the
 * bright half of every frame had been pushed to the top of the range and stuck
 * there.
 *
 * ## Why not a knee either
 *
 * The first attempt compressed everything above a threshold. That fixed the
 * clipping and introduced a worse fault: it is not the identity when the gain
 * is 1. A pixel at 230 in the middle of a frame — where the lens needs no
 * correction at all — came out at 220. Every frame centre was darkened, the
 * render grew a dark blob in the middle of every panel, and it looked worse
 * than doing nothing. The metrics said it was better, which is what metrics do
 * when they are not measuring the thing you are looking at.
 *
 * ## What this is
 *
 * `1 - (1 - u)^g` on the unit interval. At g = 1 it is exactly u, so an
 * uncorrected pixel is untouched to the last bit. Above 1 it brightens, with
 * most of the lift in the shadows where the eye wants it, and it approaches
 * white asymptotically so nothing clips.
 */
function lift(value: number, gain: number): number {
  if (gain <= 1.0001) return value;
  const u = value / 255;
  if (u <= 0) return 0;
  if (u >= 1) return 255;
  return 255 * (1 - Math.pow(1 - u, gain));
}

/**
 * A quadratic through the binned profile, evaluated back at each bin.
 *
 * Weighted by nothing: every bin covers an equal slice of t by construction,
 * so every bin is an equally good sample of the curve. Falls back to the input
 * if the system is degenerate, which it cannot be for 24 distinct t but which
 * costs one line to be sure of.
 */
function fitQuadratic(profile: Float32Array): Float32Array {
  const n = profile.length;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  let y0 = 0, y1 = 0, y2 = 0;
  for (let b = 0; b < n; b += 1) {
    const t = (b + 0.5) / n;
    const t2 = t * t;
    const y = profile[b];
    s0 += 1;
    s1 += t;
    s2 += t2;
    s3 += t2 * t;
    s4 += t2 * t2;
    y0 += y;
    y1 += y * t;
    y2 += y * t2;
  }

  // [s0 s1 s2][a]   [y0]
  // [s1 s2 s3][b] = [y1]
  // [s2 s3 s4][c]   [y2]
  const m = [
    [s0, s1, s2, y0],
    [s1, s2, s3, y1],
    [s2, s3, s4, y2],
  ];
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return profile;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c < 4; c += 1) m[r][c] -= f * m[col][c];
    }
  }
  const a = m[0][3] / m[0][0];
  const b2 = m[1][3] / m[1][1];
  const c2 = m[2][3] / m[2][2];

  const out = new Float32Array(n);
  for (let b = 0; b < n; b += 1) {
    const t = (b + 0.5) / n;
    out[b] = a + b2 * t + c2 * t * t;
  }
  return out;
}

/** Divides the lens's falloff out of a frame, in place. */
export function applyVignette(
  frame: { pixels: Uint8Array; width: number; height: number },
  gains: Float32Array,
): void {
  const { width, height, pixels } = frame;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxR2 = cx * cx + cy * cy;
  if (maxR2 <= 0) return;

  for (let y = 0; y < height; y += 1) {
    const dy = y - cy;
    const dy2 = dy * dy;
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const t = (dx * dx + dy2) / maxR2;
      // Interpolated between bins, because 24 steps applied as steps would
      // replace one visible artefact with 24 concentric rings.
      const f = Math.min(VIGNETTE_BINS - 1.0001, t * VIGNETTE_BINS);
      const b0 = f | 0;
      const frac = f - b0;
      const g = gains[b0] + (gains[b0 + 1] - gains[b0]) * frac;
      const i = (y * width + x) * 3;
      pixels[i] = lift(pixels[i], g);
      pixels[i + 1] = lift(pixels[i + 1], g);
      pixels[i + 2] = lift(pixels[i + 2], g);
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function validIntrinsics(value: unknown): value is CameraIntrinsics {
  if (!value || typeof value !== "object") return false;
  const k = value as CameraIntrinsics;
  return (
    [k.fx, k.fy, k.cx, k.cy, k.width, k.height].every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    ) &&
    k.fx > 0 &&
    k.fy > 0 &&
    k.width > 0 &&
    k.height > 0 &&
    k.cx >= 0 &&
    k.cx <= k.width &&
    k.cy >= 0 &&
    k.cy <= k.height
  );
}

function scaleIntrinsics(
  intrinsics: CameraIntrinsics,
  width: number,
  height: number,
): CameraIntrinsics {
  const sx = width / intrinsics.width;
  const sy = height / intrinsics.height;
  return {
    fx: intrinsics.fx * sx,
    fy: intrinsics.fy * sy,
    cx: intrinsics.cx * sx,
    cy: intrinsics.cy * sy,
    width,
    height,
  };
}
