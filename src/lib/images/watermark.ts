import "server-only";

import sharp from "sharp";

import {
  type WatermarkIdentity,
  type WatermarkSettings,
  SIZE_RATIO,
  watermarkLines,
} from "./watermark-settings";

/**
 * Burning the mark into the pixels.
 *
 * The rule this file exists to satisfy: a watermark drawn with HTML or CSS is
 * not protection, because the file underneath it is untouched and one
 * right-click gets the clean copy. So the published image is a *different
 * file* from the one that was uploaded — re-encoded with the mark composited
 * in — and the original is kept privately for its owner.
 *
 * Two things this does besides drawing:
 *
 * - **EXIF is dropped.** sharp only carries metadata across when asked, and it
 *   is not asked. A photograph taken on a phone at a client's house otherwise
 *   publishes that house's GPS coordinates alongside it.
 * - **The longest edge is capped.** A 4000px original is bigger than any
 *   surface renders, costs the viewer their data, and is the version worth
 *   stealing.
 */

/** Wide enough for a full-bleed hero on a large screen; not print-resolution. */
const MAX_EDGE = 2400;

/** Distance from the edge, as a fraction of the font height. */
const MARGIN_RATIO = 1.1;

/**
 * A generous guess at the width of one character at font-size 1.
 *
 * Only ever used to size a scratch canvas that is then trimmed back to the
 * ink, so it must over-estimate and it does not need to be accurate. It was
 * accurate-ish once, and the last letter of "@abelbuilds" was clipped off the
 * right edge of the block; measuring the raster is the fix, and this is now
 * just headroom.
 */
const CHAR_WIDTH = 0.58;

/** How much wider than the guess the scratch canvas is drawn. */
const SCRATCH_SLACK = 1.8;

const FONT_STACK =
  "'DejaVu Sans','Liberation Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** jpeg stays jpeg, png stays png; anything else is published as webp. */
function encode(pipeline: sharp.Sharp, mime: string): { out: sharp.Sharp; mime: string } {
  if (mime === "image/png") return { out: pipeline.png({ compressionLevel: 9 }), mime };
  if (mime === "image/webp") return { out: pipeline.webp({ quality: 86 }), mime };
  return { out: pipeline.jpeg({ quality: 86, mozjpeg: true }), mime: "image/jpeg" };
}

/**
 * The text block, rasterised on its own.
 *
 * Drawn twice per line: once in near-black, offset, then once in white on top.
 * A single white line disappears against a pale wall, which is most of the
 * photographs on this platform.
 */
function textSvg(lines: string[], fontSize: number, width: number, height: number): Buffer {
  const lineHeight = fontSize * 1.3;
  const shadow = Math.max(1, Math.round(fontSize * 0.06));

  const body = lines
    .map((line, index) => {
      const y = Math.round(fontSize + index * lineHeight);
      const text = escapeXml(line);
      const weight = index === 0 ? 700 : 500;
      const scale = index === 0 ? 1 : 0.82;
      const common = `font-family="${FONT_STACK}" font-size="${Math.round(
        fontSize * scale,
      )}" font-weight="${weight}"`;
      return (
        `<text x="${shadow}" y="${y + shadow}" ${common} fill="#000000" fill-opacity="0.55">${text}</text>` +
        `<text x="0" y="${y}" ${common} fill="#ffffff">${text}</text>`
      );
    })
    .join("");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
}

/** The tiled variant: one line, repeated on a rotated grid across the frame. */
function tiledSvg(line: string, fontSize: number, width: number, height: number): Buffer {
  const text = escapeXml(line);
  const stepX = Math.max(fontSize * 8, line.length * fontSize * CHAR_WIDTH * 1.6);
  const stepY = fontSize * 5;
  const parts: string[] = [];

  // The grid is drawn over a box larger than the image so the rotation does
  // not leave bare corners.
  for (let y = -height; y < height * 2; y += stepY) {
    for (let x = -width; x < width * 2; x += stepX) {
      parts.push(
        `<text x="${Math.round(x)}" y="${Math.round(y)}" font-family="${FONT_STACK}" font-size="${Math.round(
          fontSize,
        )}" font-weight="700" fill="#ffffff">${text}</text>`,
      );
    }
  }

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<g transform="rotate(-30 ${Math.round(width / 2)} ${Math.round(height / 2)})">${parts.join("")}</g>` +
      `</svg>`,
  );
}

/** A round logo at the requested size, or null if the bytes are unusable. */
async function roundLogo(bytes: Buffer, size: number): Promise<Buffer | null> {
  try {
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/></svg>`,
    );
    return await sharp(bytes, { failOn: "none" })
      .resize(size, size, { fit: "cover" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * The text, rasterised and trimmed back to exactly the ink.
 *
 * There is no text-measuring API here, and estimating a character width was
 * how the last letter of a handle came to be clipped off the block's right
 * edge. So the lines are drawn on a canvas that is certainly too big and the
 * transparent border is then trimmed away, which gives the true box rather
 * than a guess at it.
 */
async function measuredText(
  lines: string[],
  fontSize: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  const longest = lines.reduce((most, line) => Math.max(most, line.length), 0);
  const scratchWidth = Math.max(
    16,
    Math.ceil(longest * fontSize * CHAR_WIDTH * SCRATCH_SLACK + fontSize * 2),
  );
  const scratchHeight = Math.ceil(lines.length * fontSize * 1.3 + fontSize * 1.2);

  const raster = await sharp(textSvg(lines, fontSize, scratchWidth, scratchHeight))
    .png()
    .toBuffer();

  // If the renderer has no font it produces a transparent layer rather than an
  // error, and compositing that would publish an image recorded as watermarked
  // with no mark on it. Check for ink instead of assuming.
  if ((await inkPixels(raster)) < 8) return null;

  try {
    const { data, info } = await sharp(raster)
      .trim({ threshold: 1 })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    return { buffer: raster, width: scratchWidth, height: scratchHeight };
  }
}

/** How many pixels of the rasterised layer are actually painted. */
async function inkPixels(layer: Buffer): Promise<number> {
  const { data } = await sharp(layer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) painted += 1;
  }
  return painted;
}

export type WatermarkResult = {
  buffer: Buffer;
  mime: string;
  /** False when there was nothing to draw, or nothing drew. */
  watermarked: boolean;
};

/**
 * Composite the mark and re-encode.
 *
 * Never throws: a watermark that cannot be drawn must not stop somebody from
 * publishing their photograph. Every failure path returns the image unmarked
 * and says so, and the caller records that answer rather than assuming the
 * mark is there.
 */
export async function applyWatermark(input: {
  bytes: Uint8Array;
  mime: string;
  identity: WatermarkIdentity;
  settings: WatermarkSettings;
  logo?: Buffer | null;
}): Promise<WatermarkResult | null> {
  const source = Buffer.from(input.bytes);

  try {
    // `.rotate()` with no argument applies the EXIF orientation and then
    // discards it. Doing this first means the mark is placed against the image
    // as people will see it, not as the sensor recorded it.
    const prepared = sharp(source, { failOn: "none" })
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true });

    const { data: baseBytes, info } = await prepared.toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;

    if (!input.settings.enabled || width < 64 || height < 64) {
      const { out, mime } = encode(sharp(baseBytes), input.mime);
      return { buffer: await out.toBuffer(), mime, watermarked: false };
    }

    const lines = watermarkLines(input.identity, input.settings);
    const wantsLogo = input.settings.use_logo && !!input.logo;
    if (lines.length === 0 && !wantsLogo) {
      const { out, mime } = encode(sharp(baseBytes), input.mime);
      return { buffer: await out.toBuffer(), mime, watermarked: false };
    }

    const alpha = input.settings.opacity / 100;
    let fontSize = Math.round(
      Math.min(96, Math.max(12, width * SIZE_RATIO[input.settings.size])),
    );
    const margin = Math.round(fontSize * MARGIN_RATIO);

    let layer: Buffer;
    let left: number;
    let top: number;

    if (input.settings.position === "tiled") {
      // Tiling is about covering the frame, so the logo has no place in it and
      // only the identity line repeats.
      const line = lines[0];
      if (!line) {
        const { out, mime } = encode(sharp(baseBytes), input.mime);
        return { buffer: await out.toBuffer(), mime, watermarked: false };
      }
      layer = await sharp(tiledSvg(line, fontSize, width, height)).png().toBuffer();
      left = 0;
      top = 0;
    } else {
      const available = Math.max(1, width - margin * 2);

      let text = lines.length > 0 ? await measuredText(lines, fontSize) : null;
      if (lines.length > 0 && !text && !wantsLogo) {
        const { out, mime } = encode(sharp(baseBytes), input.mime);
        return { buffer: await out.toBuffer(), mime, watermarked: false };
      }

      // A long company name on a narrow photograph would otherwise run off the
      // edge, so the type shrinks to fit. Measured, then re-drawn once at the
      // size that fits — not estimated, because the estimate is what clipped a
      // handle in the first place.
      let logoSize = wantsLogo ? Math.round(fontSize * 1.9) : 0;
      let gap = wantsLogo ? Math.round(fontSize * 0.6) : 0;
      const natural = (text?.width ?? 0) + logoSize + gap;
      if (natural > available) {
        fontSize = Math.max(10, Math.floor((fontSize * available) / natural));
        logoSize = wantsLogo ? Math.round(fontSize * 1.9) : 0;
        gap = wantsLogo ? Math.round(fontSize * 0.6) : 0;
        if (lines.length > 0) text = await measuredText(lines, fontSize);
      }

      const textWidth = text?.width ?? 0;
      const textHeight = text?.height ?? 0;

      const blockWidth = Math.max(1, logoSize + (textWidth > 0 ? gap + textWidth : 0));
      const blockHeight = Math.max(1, logoSize, textHeight);

      const pieces: sharp.OverlayOptions[] = [];

      if (text) {
        pieces.push({
          input: text.buffer,
          left: logoSize + (logoSize > 0 ? gap : 0),
          top: Math.max(0, Math.round((blockHeight - textHeight) / 2)),
        });
      }

      if (wantsLogo && input.logo) {
        const logo = await roundLogo(input.logo, logoSize);
        if (logo) {
          pieces.push({
            input: logo,
            left: 0,
            top: Math.max(0, Math.round((blockHeight - logoSize) / 2)),
          });
        }
      }

      if (pieces.length === 0) {
        const { out, mime } = encode(sharp(baseBytes), input.mime);
        return { buffer: await out.toBuffer(), mime, watermarked: false };
      }

      layer = await sharp({
        create: {
          width: blockWidth,
          height: blockHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(pieces)
        .png()
        .toBuffer();

      switch (input.settings.position) {
        case "bottom_left":
          left = margin;
          top = height - blockHeight - margin;
          break;
        case "top_right":
          left = width - blockWidth - margin;
          top = margin;
          break;
        case "top_left":
          left = margin;
          top = margin;
          break;
        case "center":
          left = Math.round((width - blockWidth) / 2);
          top = Math.round((height - blockHeight) / 2);
          break;
        default:
          left = width - blockWidth - margin;
          top = height - blockHeight - margin;
      }

      left = Math.max(0, Math.min(left, Math.max(0, width - blockWidth)));
      top = Math.max(0, Math.min(top, Math.max(0, height - blockHeight)));
    }

    // One uniform alpha pass over the finished layer, so the opacity setting
    // means the same thing whether the mark is text, a logo, or both.
    const meta = await sharp(layer).metadata();
    const faded = await sharp(layer)
      .composite([
        {
          input: {
            create: {
              width: meta.width ?? 1,
              height: meta.height ?? 1,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha },
            },
          },
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();

    const { out, mime } = encode(
      sharp(baseBytes).composite([{ input: faded, left, top }]),
      input.mime,
    );

    return { buffer: await out.toBuffer(), mime, watermarked: true };
  } catch (error) {
    console.error("[watermark] could not mark image:", error);
    return null;
  }
}
