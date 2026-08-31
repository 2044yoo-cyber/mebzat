"use client";

import {
  PHOTO_MAX_EDGE,
  THUMB_MAX_EDGE,
  judgePhoto,
  type PhotoIssue,
} from "@/lib/property/listing";

/**
 * Preparing a photo in the browser.
 *
 * A seller in Addis is uploading from a phone on mobile data, and the photo
 * their phone took is eight megabytes. Sending that as-is costs them money and
 * takes a minute per picture; resizing first turns a ten-photo listing from
 * eighty megabytes into about four.
 *
 * It also means the quality check happens before the upload rather than after,
 * so "this one is too dark" arrives while they are still in the room and can
 * take another — which is the only moment that advice is worth anything.
 *
 * Everything here is canvas work, so it needs no library and no server round
 * trip. HEIC is the exception and is handled below.
 */

export type PreparedPhoto = {
  /** The resized image, as a JPEG or WebP blob. */
  blob: Blob;
  /** A small square for the grid and for the blur placeholder. */
  thumbnail: Blob;
  /** A tiny data URL, for `next/image`'s blurDataURL. */
  blurDataUrl: string;
  width: number;
  height: number;
  score: number;
  issues: PhotoIssue[];
  originalBytes: number;
  bytes: number;
};

/** WebP where the browser has it, JPEG everywhere else. */
function bestFormat(): { type: string; extension: string } {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const webp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  return webp
    ? { type: "image/webp", extension: "webp" }
    : { type: "image/jpeg", extension: "jpg" };
}

export const PHOTO_FORMAT = typeof document === "undefined"
  ? { type: "image/jpeg", extension: "jpg" }
  : bestFormat();

/**
 * Decodes a file to a bitmap.
 *
 * `createImageBitmap` handles HEIC on Safari, where the format is native. On
 * a browser that cannot decode it the error is caught and reported as "this
 * phone's format" rather than a generic failure, because the seller needs to
 * know to change a camera setting rather than to try again.
 */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Fall back to an <img>, which sometimes succeeds where createImageBitmap
    // does not — notably for progressive JPEGs on older Chrome.
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return await createImageBitmap(image);
    } catch {
      const heic = /\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
      throw new Error(
        heic
          ? "This is an iPhone HEIC photo and this browser cannot read it. In Settings → Camera → Formats, choose “Most Compatible”, or share the photo to convert it to JPEG."
          : "That image could not be read. Try a JPEG or PNG.",
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function fit(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function draw(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process images.");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode the image.")),
      PHOTO_FORMAT.type,
      quality,
    );
  });
}

/**
 * Brightness and sharpness, measured on a small copy.
 *
 * Sampled at 64px rather than full size: the numbers are indistinguishable
 * and it is roughly a thousand times less work, which matters when a seller
 * drops twenty photos at once and expects the page to stay responsive.
 */
function measure(bitmap: ImageBitmap): { brightness: number; sharpness: number } {
  const size = 64;
  const canvas = draw(bitmap, size, size);
  const context = canvas.getContext("2d");
  if (!context) return { brightness: 128, sharpness: 10 };

  const { data } = context.getImageData(0, 0, size, size);
  const luma = new Float32Array(size * size);

  let total = 0;
  for (let index = 0; index < luma.length; index += 1) {
    const offset = index * 4;
    // `data` is a Uint8ClampedArray of exactly size*size*4 bytes and `offset`
    // is derived from the loop bound, so these are in range. Read through
    // locals with a default rather than asserting four times per pixel.
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const value = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[index] = value;
    total += value;
  }

  // A Laplacian: how much each pixel differs from its neighbours. A blurred
  // photo has almost none of this.
  let edges = 0;
  let counted = 0;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const i = y * size + x;
      // The loop skips the border, so every neighbour exists.
      const value =
        4 * (luma[i] ?? 0) -
        (luma[i - 1] ?? 0) -
        (luma[i + 1] ?? 0) -
        (luma[i - size] ?? 0) -
        (luma[i + size] ?? 0);
      edges += Math.abs(value);
      counted += 1;
    }
  }

  return {
    brightness: total / luma.length,
    sharpness: counted > 0 ? edges / counted : 0,
  };
}

/** Resizes, compresses, measures and thumbnails one photo. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await decode(file);

  try {
    const full = fit(bitmap.width, bitmap.height, PHOTO_MAX_EDGE);
    const thumb = fit(bitmap.width, bitmap.height, THUMB_MAX_EDGE);

    const { brightness, sharpness } = measure(bitmap);
    const { score, issues } = judgePhoto({
      // Judged on the original, not the resize: the resize is always big
      // enough, so measuring it would report every photo as fine.
      width: bitmap.width,
      height: bitmap.height,
      brightness,
      sharpness,
    });

    const blob = await toBlob(draw(bitmap, full.width, full.height), 0.82);
    const thumbnail = await toBlob(draw(bitmap, thumb.width, thumb.height), 0.7);

    // 16px wide, which is enough to suggest the colours and small enough to
    // sit inline in the HTML without weighing the page down.
    const tiny = fit(bitmap.width, bitmap.height, 16);
    const blurDataUrl = draw(bitmap, tiny.width, tiny.height).toDataURL(
      "image/jpeg",
      0.5,
    );

    return {
      blob,
      thumbnail,
      blurDataUrl,
      width: full.width,
      height: full.height,
      score,
      issues,
      originalBytes: file.size,
      bytes: blob.size,
    };
  } finally {
    bitmap.close();
  }
}

/** How much smaller the upload got, for the progress line. */
export function savedPercent(originalBytes: number, bytes: number): number {
  if (originalBytes <= 0) return 0;
  return Math.max(0, Math.round((1 - bytes / originalBytes) * 100));
}
