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
 * How close to 2:1 an image has to be to be called a true equirectangular
 * panorama. Not a gate — a label. Cameras and stitchers round differently, and
 * a few pixels either way is the same picture.
 */
export const RATIO_TOLERANCE = 0.04;

/**
 * The narrowest image still worth calling a panorama.
 *
 * Below this it is an ordinary wide photograph, and wrapping one round a
 * sphere gives something nobody wants. The person is asked rather than
 * refused: it is their picture, and a camera or a processing tool may know
 * something this does not.
 */
export const MIN_PANORAMA_RATIO = 1.5;

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

/**
 * What kind of panorama this is.
 *
 * A true equirectangular image is 2:1 and covers the whole sphere. Plenty of
 * usable panoramas are not: a camera crops, a stitcher trims, an AI tool
 * exports whatever it exports. Those still work — they cover less than the
 * full sphere, and the viewer maps them accordingly — so they are labelled,
 * not refused.
 */
export type PanoramaKind = "equirectangular" | "wide" | "uncertain";

export type PanoramaReading = {
  kind: PanoramaKind;
  ratio: number;
  /** "1.78:1", for showing to a person. */
  label: string;
  /** Set only when the image is larger than a phone's GPU will take. */
  resizeTo: { width: number; height: number } | null;
  /** What to tell the person, when there is anything to say. */
  note: string | null;
  /** True when it is worth asking before uploading. Never an outright block. */
  needsConfirmation: boolean;
  /** The only hard refusals: unreadable, or far too small to look at. */
  refusal: string | null;
};

/** Rounded the way a person writes it. */
export function ratioLabel(ratio: number) {
  return `${ratio.toFixed(2)}:1`;
}

/**
 * Read an image's dimensions and decide what it is.
 *
 * This used to refuse anything that was not 2:1 within a hair, which threw out
 * real panoramas — 4368×2448 among them — with a message telling the person
 * their camera was wrong. Two separate questions had been run together: "is
 * this a full equirectangular sphere" and "can this be used at all". Only the
 * first depends on 2:1.
 */
export function readPanorama(width: number, height: number): PanoramaReading {
  const unreadable: PanoramaReading = {
    kind: "uncertain",
    ratio: 0,
    label: "unknown",
    resizeTo: null,
    note: null,
    needsConfirmation: false,
    refusal: "That image could not be read.",
  };

  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return unreadable;
  }

  const ratio = width / height;
  const label = ratioLabel(ratio);

  if (width < MIN_PANORAMA_WIDTH) {
    return {
      kind: "uncertain",
      ratio,
      label,
      resizeTo: null,
      note: null,
      needsConfirmation: false,
      refusal:
        `This image is ${width} pixels wide, which is too small to look at up ` +
        `close inside a 360° view. ${MIN_PANORAMA_WIDTH} is the minimum.`,
    };
  }

  // Larger than a phone's GPU will take, so it is shrunk first — keeping its
  // own proportions. Forcing it to 2:1 here is what would stretch the room.
  const resizeTo =
    width > MAX_PANORAMA_WIDTH
      ? { width: MAX_PANORAMA_WIDTH, height: Math.round(MAX_PANORAMA_WIDTH / ratio) }
      : null;

  if (Math.abs(ratio - EQUIRECTANGULAR_RATIO) <= RATIO_TOLERANCE) {
    return {
      kind: "equirectangular",
      ratio,
      label,
      resizeTo,
      note: null,
      needsConfirmation: false,
      refusal: null,
    };
  }

  if (ratio >= MIN_PANORAMA_RATIO) {
    return {
      kind: "wide",
      ratio,
      label,
      resizeTo,
      note:
        `Panorama ratio: ${label}. A full 360° photo is 2:1, so this one covers ` +
        `less than the whole sphere — it will be shown at its own proportions ` +
        `rather than stretched to fit.`,
      needsConfirmation: false,
      refusal: null,
    };
  }

  return {
    kind: "uncertain",
    ratio,
    label,
    resizeTo,
    note:
      `This image is ${label}, which is close to an ordinary photograph. It may ` +
      `not contain a complete 360° panorama. You can use it anyway, and it will ` +
      `be shown at its own proportions.`,
    needsConfirmation: true,
    refusal: null,
  };
}

/** How a panorama of these proportions is described in the tour. */
export const PANORAMA_KIND_LABEL: Record<PanoramaKind, string> = {
  equirectangular: "Equirectangular 360°",
  wide: "Wide panorama",
  uncertain: "Needs verification",
};

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
