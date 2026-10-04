"use server";

import { revalidatePath } from "next/cache";

import { isFontChoice } from "@/lib/constants/fonts";
import { createClient } from "@/lib/supabase/server";

export type FontActionState = { error?: string; savedAt?: number };

/**
 * Remembers the reading face on the account.
 *
 * The browser has already applied it by the time this runs — the setting is
 * useless if it waits for a round trip — so this is about the *next* device,
 * not this one. Which is also why a failure here is worth reporting rather
 * than swallowing: the reader can see it worked, and would otherwise never
 * learn it did not stick.
 */
export async function saveFontPreference(
  choice: string,
): Promise<FontActionState> {
  if (!isFontChoice(choice)) {
    return { error: "That is not one of the fonts." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not an error the reader needs to see. A signed-out visitor is allowed to
    // choose a font; it lives in their browser and there is no row to put it
    // on. The caller treats a missing stamp as "kept locally".
    return {};
  }

  const { error } = await supabase
    .from("profiles")
    .update({ font_preference: choice })
    .eq("id", user.id);

  if (error) return { error: error.message };

  // The root layout renders `data-font` from this column, so every route has
  // to be rebuilt or the next navigation serves the old face.
  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}
