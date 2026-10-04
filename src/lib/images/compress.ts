/**
 * Shrink a photograph in the browser before it is uploaded.
 *
 * A phone camera writes 4000×3000 at 8–14 MB. The project-images bucket takes
 * 10 MB, so some of those were refused outright, and the ones that fit spent a
 * minute uploading on a phone connection to be displayed at 900 px wide. Both
 * of those read to the person as "the upload does not work".
 *
 * This is a convenience, not a check. The bucket's own size and type limits
 * are what actually hold — anything here runs in the browser and a determined
 * caller can skip it.
 */

/** Wider than any layout that displays these, with room for a 2× screen. */
const MAX_EDGE = 2000;

/** Below this, re-encoding costs quality and saves nothing worth having. */
const SKIP_BELOW_BYTES = 600 * 1024;

const QUALITY = 0.85;

export type CompressResult = {
  blob: Blob;
  mime: string;
  /** For the upload path's extension. */
  extension: string;
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? "jpg";
}

/**
 * Returns the original untouched when it is already small enough, or when
 * anything at all goes wrong. A photograph that cannot be resized should still
 * be uploadable.
 */
export async function compressImage(file: File): Promise<CompressResult> {
  const original: CompressResult = {
    blob: file,
    mime: file.type || "image/jpeg",
    extension: extensionFor(file.type),
  };

  if (file.size <= SKIP_BELOW_BYTES) return original;
  if (typeof createImageBitmap !== "function") return original;

  try {
    // `from-image` applies the EXIF rotation. Without it a photograph taken in
    // portrait is drawn on its side, which is worse than not resizing it.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });

    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return original;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // A PNG of a photograph re-encodes larger than the JPEG it came from, so
    // everything lands as JPEG — except a PNG that is still its original size,
    // which is usually a drawing or a screenshot and stays lossless.
    const mime = "image/jpeg";

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, QUALITY),
    );

    // Re-encoding is not guaranteed to be smaller — a small image at a high
    // quality setting can grow. Keep whichever is less.
    if (!blob || blob.size >= file.size) return original;

    return { blob, mime, extension: extensionFor(mime) };
  } catch {
    return original;
  }
}
