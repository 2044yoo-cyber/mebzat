import "server-only";

import sharp from "sharp";

import {
  MIN_CONFIDENCE,
  columnProfile,
  exposureGains,
  featherWeights,
  hasUsableOverlap,
  matchOffset,
  outputSize,
  solvePlacements,
  type Match,
} from "./stitch";

/**
 * The half of stitching that needs pixels.
 *
 * `stitch.ts` decides *where* each frame goes; this puts them there. It is
 * separate because that half is arithmetic that can be checked in a script,
 * and this half needs an image library, a server and a few megabytes of
 * buffers.
 *
 * `sharp` was already a dependency — 0069 uses it to draw watermarks — so this
 * adds no package. That mattered to the choice: OpenCV and Hugin are the
 * obvious tools for this job and neither can be carried by a serverless Node
 * deployment, and opencv.js in the browser is around eight megabytes of WASM
 * on a phone, which is the thing the brief warns against.
 */

export type FrameInput = {
  /** Where the phone was pointing, in degrees, when this frame was taken. */
  yaw: number;
  bytes: Uint8Array;
};

export type StitchOutcome =
  | { ok: true; jpeg: Buffer; width: number; height: number; weakSeams: number }
  | { ok: false; code: string };

/** Downsampled width used for matching. Enough to align, cheap to scan. */
const PROFILE_WIDTH = 512;

/**
 * Turn a ring of frames into one equirectangular JPEG.
 *
 * The steps are the brief's, in order. Each one is small; what makes the whole
 * thing tractable is that the capture screen recorded a yaw for every frame,
 * so nothing here has to search for where a photograph belongs — only to
 * refine it.
 */
export async function composePanorama(
  frames: FrameInput[],
): Promise<StitchOutcome> {
  if (frames.length < 2) return { ok: false, code: "too_few_frames" };

  // Sorted by where they were taken, not by when they arrived: uploads finish
  // out of order on a phone, and a ring assembled in arrival order is a ring
  // in the wrong order.
  const ring = [...frames].sort((a, b) => a.yaw - b.yaw);

  // ---- 1. is there any overlap to work with at all? ----------------------
  for (let i = 0; i < ring.length; i += 1) {
    const next = ring[(i + 1) % ring.length];
    const gap = i === ring.length - 1 ? 360 - ring[i].yaw + next.yaw : next.yaw - ring[i].yaw;
    if (!hasUsableOverlap(gap)) return { ok: false, code: "no_overlap" };
  }

  // ---- decode, and normalise every frame to the same height --------------
  let meta: { width: number; height: number };
  try {
    const first = await sharp(Buffer.from(ring[0].bytes)).metadata();
    if (!first.width || !first.height) return { ok: false, code: "decode_failed" };
    meta = { width: first.width, height: first.height };
  } catch {
    return { ok: false, code: "decode_failed" };
  }

  const { width: outWidth, height: outHeight } = outputSize(
    meta.width,
    ring.length,
  );

  // Each frame covers 360/n degrees of the output, plus the overlap either
  // side. Widening it by the overlap is what gives the blend something to
  // work with.
  const sliceWidth = Math.round((outWidth / ring.length) * 1.45);

  let prepared: { data: Buffer; profile: Float64Array; mean: number }[];
  try {
    prepared = await Promise.all(
      ring.map(async (frame) => {
        const image = sharp(Buffer.from(frame.bytes), { failOn: "none" })
          // `.rotate()` with no argument applies the EXIF orientation. A phone
          // held in portrait writes landscape pixels plus a rotation flag, and
          // stitching the pixels without honouring it builds the room on its
          // side.
          .rotate()
          .resize(sliceWidth, outHeight, { fit: "fill" });

        const data = await image.clone().jpeg({ quality: 92 }).toBuffer();

        // The greyscale copy the matcher reads. Small on purpose.
        const grey = await image
          .clone()
          .greyscale()
          .resize(PROFILE_WIDTH, 64, { fit: "fill" })
          .raw()
          .toBuffer();

        const profile = columnProfile(grey, PROFILE_WIDTH, 64);
        const mean =
          profile.reduce((sum, v) => sum + v, 0) / (profile.length || 1);

        return { data, profile, mean };
      }),
    );
  } catch {
    return { ok: false, code: "decode_failed" };
  }

  // ---- 2 and 3. match each adjacent pair, refine the transform -----------
  const scale = sliceWidth / PROFILE_WIDTH;
  const nominalStep = outWidth / ring.length;
  const expectedInProfile = Math.round(nominalStep / scale);

  const matches: Match[] = [];
  let weakSeams = 0;
  for (let i = 0; i < prepared.length - 1; i += 1) {
    const found = matchOffset(
      prepared[i].profile,
      prepared[i + 1].profile,
      expectedInProfile,
      Math.round(expectedInProfile * 0.35),
    );
    if (found.confidence < MIN_CONFIDENCE) weakSeams += 1;
    matches.push({
      offset: Math.round(found.offset * scale),
      confidence: found.confidence,
    });
  }

  // ---- 5. align ----------------------------------------------------------
  const placements = solvePlacements(matches, nominalStep, outWidth);

  // ---- 6. exposure compensation -----------------------------------------
  const gains = exposureGains(prepared.map((p) => p.mean));

  // ---- 7 and 8. seam and feather ----------------------------------------
  // The blend band is the overlap, capped: a band wider than the overlap
  // reaches into pixels the other frame never saw.
  const band = Math.min(
    Math.round(sliceWidth - nominalStep),
    Math.round(sliceWidth * 0.4),
  );
  const feather = featherWeights(Math.max(1, band));

  // Composited left to right so each frame's feathered left edge falls over
  // the frame before it. `sharp` blends with the alpha we give it, which is
  // what turns a hard cut into a ramp.
  const layers: sharp.OverlayOptions[] = [];
  for (let i = 0; i < prepared.length; i += 1) {
    const gain = gains[i];
    const withGain =
      Math.abs(gain - 1) < 0.01
        ? sharp(prepared[i].data)
        : sharp(prepared[i].data).linear(gain, 0);

    const masked = await applyLeftFeather(withGain, sliceWidth, outHeight, feather, i === 0);

    const x = Math.round(placements[i].x) % outWidth;
    layers.push({ input: masked, left: x, top: 0 });

    // A slice that runs off the right-hand edge continues at the left: the
    // image wraps, because the room does.
    if (x + sliceWidth > outWidth) {
      layers.push({ input: masked, left: x - outWidth, top: 0 });
    }
  }

  // ---- 9. output ---------------------------------------------------------
  try {
    const jpeg = await sharp({
      create: {
        width: outWidth,
        height: outHeight,
        channels: 3,
        background: { r: 20, g: 20, b: 22 },
      },
    })
      .composite(layers)
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    return { ok: true, jpeg, width: outWidth, height: outHeight, weakSeams };
  } catch {
    return { ok: false, code: "unknown" };
  }
}

/**
 * Fade a slice in from its left edge.
 *
 * The alpha channel is built by hand rather than with a gradient overlay: a
 * gradient would need an SVG the size of the slice, parsed and rasterised per
 * frame, to express nine hundred numbers we already have.
 */
async function applyLeftFeather(
  image: sharp.Sharp,
  width: number,
  height: number,
  feather: Float64Array,
  opaque: boolean,
): Promise<Buffer> {
  if (opaque) return image.jpeg({ quality: 92 }).toBuffer();

  const alpha = Buffer.alloc(width * height);
  for (let x = 0; x < width; x += 1) {
    const value =
      x < feather.length ? Math.round(feather[x] * 255) : 255;
    for (let y = 0; y < height; y += 1) alpha[y * width + x] = value;
  }

  const rgb = await image.removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 1 })
    .toBuffer();
}
