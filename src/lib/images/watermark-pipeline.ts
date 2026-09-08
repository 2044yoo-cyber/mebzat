import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentKind } from "@/lib/moderation/types";

import { applyWatermark, type WatermarkResult } from "./watermark";
import {
  DEFAULT_WATERMARK,
  normaliseSettings,
  shouldWatermark,
  type WatermarkIdentity,
  type WatermarkSettings,
} from "./watermark-settings";

/**
 * Everything the compositor needs, gathered from the database.
 *
 * Kept apart from `watermark.ts` so the drawing stays a pure function of bytes
 * and settings — which is what makes it testable without a database — and so
 * the one place that reads a phone number out of a profile is small enough to
 * read in full.
 */

/** Fetching somebody's avatar must not be able to hold up an upload. */
const LOGO_TIMEOUT_MS = 5_000;
const LOGO_MAX_BYTES = 4 * 1024 * 1024;

async function fetchLogo(url: string | null): Promise<Buffer | null> {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // An avatar_url is written by the profile editor, but it is still a URL from
  // the database being handed to a server-side fetch. Only https, and never a
  // scheme that could reach the filesystem or a metadata endpoint.
  if (parsed.protocol !== "https:") return null;

  try {
    const response = await fetch(parsed, {
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > LOGO_MAX_BYTES) return null;
    return buffer;
  } catch {
    return null;
  }
}

export type PublishWatermarkInput = {
  client: SupabaseClient;
  userId: string | null;
  contentType: ContentKind;
  bytes: Uint8Array;
  mime: string;
};

/**
 * Decide whether this upload gets a mark, and draw it if so.
 *
 * Returns null when the caller should publish the bytes it already has —
 * either because this kind of image is never marked, or because the drawing
 * failed. A null is never treated as success by the caller: the moderation row
 * records `watermarked` from the result, so an image that could not be marked
 * is recorded as unmarked rather than assumed to be protected.
 */
export async function watermarkForPublishing(
  input: PublishWatermarkInput,
): Promise<WatermarkResult | null> {
  if (!input.userId) return null;
  if (!shouldWatermark(input.contentType)) return null;

  const [settingsRow, profileRow] = await Promise.all([
    input.client
      .from("watermark_settings")
      .select(
        "enabled, use_username, use_display_name, use_company, use_logo, use_phone, position, size, opacity",
      )
      .eq("user_id", input.userId)
      .maybeSingle(),
    input.client
      .from("profiles")
      .select("username, full_name, company_name, phone, avatar_url")
      .eq("id", input.userId)
      .maybeSingle(),
  ]);

  // No row means the person has never opened the settings screen, so they get
  // the default: their handle and their picture. Not their phone number.
  const settings: WatermarkSettings = settingsRow.data
    ? normaliseSettings(settingsRow.data as Partial<WatermarkSettings>)
    : { ...DEFAULT_WATERMARK };

  if (!settings.enabled) return null;

  const profile = profileRow.data as {
    username: string | null;
    full_name: string | null;
    company_name: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;

  // The phone is read out of the profile only when the setting says so. It is
  // not passed through and filtered later: an identity that never carries the
  // number cannot accidentally draw it.
  const identity: WatermarkIdentity = {
    username: profile?.username ?? null,
    full_name: profile?.full_name ?? null,
    company_name: profile?.company_name ?? null,
    phone: settings.use_phone ? (profile?.phone ?? null) : null,
  };

  const logo = settings.use_logo ? await fetchLogo(profile?.avatar_url ?? null) : null;

  return applyWatermark({
    bytes: input.bytes,
    mime: input.mime,
    identity,
    settings,
    logo,
  });
}
