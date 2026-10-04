/**
 * What a watermark says, and where it sits.
 *
 * Client-safe on purpose: the settings screen needs the vocabulary, the
 * defaults and the text-building rule so it can show a live preview, and the
 * preview has to agree with what the server will actually burn in. The
 * compositing itself — sharp, the storage buckets, the profile lookup — lives
 * in `watermark.ts` behind `server-only`.
 *
 * The one thing this file must never do is decide *for* somebody that their
 * phone number goes on a photograph. `use_phone` is false in the defaults and
 * `watermarkLines` only reads a phone when it is explicitly true, so an
 * incomplete settings row can never leak one.
 */

import type { ContentKind } from "@/lib/moderation/types";

export const WATERMARK_POSITIONS = [
  "bottom_right",
  "bottom_left",
  "top_right",
  "top_left",
  "center",
  "tiled",
] as const;
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export const WATERMARK_SIZES = ["small", "medium", "large"] as const;
export type WatermarkSize = (typeof WATERMARK_SIZES)[number];

export const POSITION_LABELS: Record<WatermarkPosition, string> = {
  bottom_right: "Bottom right",
  bottom_left: "Bottom left",
  top_right: "Top right",
  top_left: "Top left",
  center: "Centre",
  tiled: "Tiled across",
};

export const SIZE_LABELS: Record<WatermarkSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/** Font height as a fraction of the image's width. */
export const SIZE_RATIO: Record<WatermarkSize, number> = {
  small: 0.028,
  medium: 0.04,
  large: 0.055,
};

export const OPACITY_MIN = 15;
export const OPACITY_MAX = 80;

export type WatermarkSettings = {
  enabled: boolean;
  use_username: boolean;
  use_display_name: boolean;
  use_company: boolean;
  use_logo: boolean;
  use_phone: boolean;
  position: WatermarkPosition;
  size: WatermarkSize;
  opacity: number;
};

/**
 * What somebody gets before they have opened the settings screen.
 *
 * The brief's own preference: username and a logo. Not the phone number, and
 * not the legal name — a handle identifies the author well enough to trace a
 * stolen photograph back, without publishing anything the author has not
 * already put on their public profile.
 */
export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: true,
  use_username: true,
  use_display_name: false,
  use_company: false,
  use_logo: true,
  use_phone: false,
  position: "bottom_right",
  size: "medium",
  opacity: 45,
};

/** The kinds of upload that get a mark burned in. */
export const WATERMARKED_KINDS: readonly ContentKind[] = [
  // A contractor's finished work. The reason the feature exists.
  "project_image",
  // Marketplace photography, lifted onto competing listings.
  "product_image",
  // Property listing photos, reposted by other agents.
  "listing",
];

/**
 * Avatars, covers and company logos are deliberately absent: a mark on a
 * profile picture is noise, and a logo watermarked with its own name is
 * absurd. Panoramas are absent because a flat overlay on an equirectangular
 * projection is a smear across the viewer's horizon. Floor plans are absent
 * because a mark placed over a dimension line makes the drawing wrong, and
 * they arrive as PDFs as often as images.
 */
export function shouldWatermark(kind: ContentKind): boolean {
  return WATERMARKED_KINDS.includes(kind);
}

export type WatermarkIdentity = {
  username?: string | null;
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The mark's text, as one or two lines.
 *
 * Line one identifies; line two, when the author has asked for it, is the
 * phone number. Two short lines read better on a photograph than one long one,
 * and keeping the number on its own line means turning it off does not reflow
 * everything else.
 */
export function watermarkLines(
  identity: WatermarkIdentity,
  settings: WatermarkSettings,
): string[] {
  const first: string[] = [];

  if (settings.use_company) {
    const company = clean(identity.company_name);
    if (company) first.push(company);
  }
  if (settings.use_display_name) {
    const name = clean(identity.full_name);
    if (name) first.push(name);
  }
  if (settings.use_username) {
    const username = clean(identity.username);
    if (username) first.push(`@${username.replace(/^@+/, "")}`);
  }

  const lines: string[] = [];
  if (first.length > 0) lines.push(first.join("  ·  ").slice(0, 80));

  // Read only under an explicit opt-in. Not "if we happen to have one".
  if (settings.use_phone) {
    const phone = clean(identity.phone);
    if (phone) lines.push(phone.slice(0, 40));
  }

  return lines;
}

/** Nothing to draw and nothing to fetch — skip the work entirely. */
export function isBlank(
  identity: WatermarkIdentity,
  settings: WatermarkSettings,
  hasLogo: boolean,
): boolean {
  return watermarkLines(identity, settings).length === 0 && !hasLogo;
}

/**
 * A settings row as it comes back from the database, made total.
 *
 * Anything missing falls back to the default rather than to a truthy value, so
 * a half-written row cannot turn the phone number on.
 */
export function normaliseSettings(
  row: Partial<WatermarkSettings> | null | undefined,
): WatermarkSettings {
  if (!row) return { ...DEFAULT_WATERMARK };

  const position = WATERMARK_POSITIONS.includes(row.position as WatermarkPosition)
    ? (row.position as WatermarkPosition)
    : DEFAULT_WATERMARK.position;
  const size = WATERMARK_SIZES.includes(row.size as WatermarkSize)
    ? (row.size as WatermarkSize)
    : DEFAULT_WATERMARK.size;
  const opacity = Number.isFinite(row.opacity)
    ? Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Math.round(row.opacity as number)))
    : DEFAULT_WATERMARK.opacity;

  return {
    enabled: row.enabled ?? DEFAULT_WATERMARK.enabled,
    use_username: row.use_username ?? DEFAULT_WATERMARK.use_username,
    use_display_name: row.use_display_name ?? DEFAULT_WATERMARK.use_display_name,
    use_company: row.use_company ?? DEFAULT_WATERMARK.use_company,
    use_logo: row.use_logo ?? DEFAULT_WATERMARK.use_logo,
    use_phone: row.use_phone === true,
    position,
    size,
    opacity,
  };
}
