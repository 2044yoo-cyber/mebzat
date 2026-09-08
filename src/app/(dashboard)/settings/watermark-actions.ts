"use server";

import { revalidatePath } from "next/cache";

import {
  normaliseSettings,
  OPACITY_MAX,
  OPACITY_MIN,
  WATERMARK_POSITIONS,
  WATERMARK_SIZES,
  type WatermarkSettings,
} from "@/lib/images/watermark-settings";
import { createClient } from "@/lib/supabase/server";

/**
 * Saving the watermark settings.
 *
 * Everything here belongs to one person and affects only their own uploads, so
 * there is nothing to authorise beyond "is this your row" — which row-level
 * security enforces anyway. What this function is actually for is validating
 * the shape: a position or a size that is not in the enum, or an opacity
 * outside the range, would be refused by the database with an error nobody can
 * read, and `use_phone` deserves to be read as a strict boolean rather than as
 * whatever truthy value arrived.
 */

export type SaveResult = { ok: true } | { ok: false; message: string };

export async function saveWatermarkSettings(
  input: WatermarkSettings,
): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, message: "Sign in first." };

  if (!WATERMARK_POSITIONS.includes(input.position)) {
    return { ok: false, message: "That position is not one of the options." };
  }
  if (!WATERMARK_SIZES.includes(input.size)) {
    return { ok: false, message: "That size is not one of the options." };
  }
  if (
    !Number.isFinite(input.opacity) ||
    input.opacity < OPACITY_MIN ||
    input.opacity > OPACITY_MAX
  ) {
    return {
      ok: false,
      message: `Opacity must be between ${OPACITY_MIN}% and ${OPACITY_MAX}%.`,
    };
  }

  const settings = normaliseSettings(input);

  const { error } = await supabase.from("watermark_settings").upsert(
    {
      user_id: user.id,
      enabled: settings.enabled,
      use_username: settings.use_username,
      use_display_name: settings.use_display_name,
      use_company: settings.use_company,
      use_logo: settings.use_logo,
      // Strict. `normaliseSettings` already insists on an exact `true`, and
      // this is the write that would publish somebody's number.
      use_phone: settings.use_phone === true,
      position: settings.position,
      size: settings.size,
      opacity: settings.opacity,
    },
    { onConflict: "user_id" },
  );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
