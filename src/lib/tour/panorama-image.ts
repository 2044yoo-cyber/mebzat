/**
 * What makes an image usable as a 360° panorama.
 *
 * The viewer maps an image onto the inside of a sphere, which only works if
 * the image is *equirectangular*: longitude across, latitude down, so the
 * width is exactly twice the height. Hand it an ordinary photograph and it
 * still renders — smeared across the whole sphere, with the sky and the floor
 * stretched to nothing. Nothing errors. It just looks wrong, and the person
 * who uploaded it has no way to know why.
 *
 * So the check happens in the browser, before the upload, where the message
 * can say what to do about it.
 */

/** Width ÷ height for an equirectangular image. */
export const EQUIRECTANGULAR_RATIO = 2;

/**
 * How far off 2:1 is still accepted. Cameras and stitching software round
 * differently — a Theta writes 5376×2688 exactly, other stitchers land a few
 * pixels out — and rejecting a genuine panorama over one pixel would be worse
 * than the slight vertical stretch that tolerance costs.
 */
export const RATIO_TOLERANCE = 0.04;

/** Below this the panorama is mush as soon as anyone zooms in. */
export const MIN_PANORAMA_WIDTH = 1024;

/**
 * The widest panorama that is stored.
 *
 * Not a limit of the format — it is what phones can actually display. A GPU
 * has a maximum texture size, commonly 4096 on the phones most of Medosha's
 * traffic comes from, and a texture over it fails to upload: a black sphere,
 * no error. Anything larger is downscaled in the browser first, which also
 * keeps most files under the bucket's 25MB.
 */
export const MAX_PANORAMA_WIDTH = 4096;

/** The formats the `panoramas` bucket accepts. PNG is not among them: a
 * lossless 4096-wide panorama is far past the size limit. */
export const PANORAMA_TYPES = ["image/jpeg", "image/webp"] as const;

export type PanoramaCheck =
  | { ok: true; resizeTo: { width: number; height: number } | null }
  | { ok: false; reason: string };

/**
 * Whether an image of these dimensions can be a panorama, and whether it has
 * to be shrunk first.
 *
 * Dimensions only — the file's type and size are checked separately, because
 * they are known before the image has been decoded and there is no point
 * decoding a 90MB TIFF to tell somebody it is a TIFF.
 */
export function checkPanorama(width: number, height: number): PanoramaCheck {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { ok: false, reason: "That image could not be read." };
  }

  const ratio = width / height;
  if (Math.abs(ratio - EQUIRECTANGULAR_RATIO) > RATIO_TOLERANCE) {
    return {
      ok: false,
      reason:
        `A 360° photo has to be twice as wide as it is tall. This one is ` +
        `${width}×${height}. Use the 360° mode on your camera or phone, and ` +
        `upload the flat image it saves rather than a screenshot of it.`,
    };
  }

  if (width < MIN_PANORAMA_WIDTH) {
    return {
      ok: false,
      reason:
        `This panorama is ${width} pixels wide, which is too small to look ` +
        `at up close. ${MIN_PANORAMA_WIDTH} is the minimum.`,
    };
  }

  if (width > MAX_PANORAMA_WIDTH) {
    // Kept at 2:1 rather than scaled by the true ratio, so a panorama a few
    // pixels off square-on comes out exactly equirectangular afterwards.
    return {
      ok: true,
      resizeTo: { width: MAX_PANORAMA_WIDTH, height: MAX_PANORAMA_WIDTH / 2 },
    };
  }

  return { ok: true, resizeTo: null };
}

/**
 * A first guess at what to call a scene, from the file that became it.
 *
 * Half the panoramas a person uploads are named for the room — "living
 * room.jpg", "master_bedroom.jpg" — and half carry whatever the camera wrote,
 * which is a serial number. A serial number as a scene title is worse than a
 * placeholder, because it looks deliberate: nobody edits "R0010234", and it
 * ships to the buyer that way.
 *
 * Either guess is editable; this only decides which one is less work.
 */
export function sceneName(fileName: string, index: number) {
  const stem = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // A camera's naming scheme: an optional short *upper-case* prefix and a run
  // of digits — IMG_2201, DSC00042, R0010234, GS__0198.
  //
  // The case matters. "unit 401" is how half the flats in Addis are labelled,
  // and an earlier version of this matched it as a serial number and threw the
  // name away. A camera writes upper case; a person writing a room name does
  // not. Something like "SW 101" is still caught, which is the cost of the
  // rule and cheaper than losing every unit number.
  if (!stem || /^[A-Z]{0,4}\s?\d{3,}$/.test(stem)) return `Scene ${index + 1}`;

  return stem.charAt(0).toUpperCase() + stem.slice(1);
}
