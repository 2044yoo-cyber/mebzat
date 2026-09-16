import "server-only";

import { toFontChoice } from "@/lib/constants/fonts";
import { createClient } from "@/lib/supabase/server";
import type { NavProfile } from "@/components/layout/user-nav";

/** Resolves the current user's nav profile on the server so the header
 * renders the correct signed-in/out state on first paint (no flicker).
 * Returns null when signed out. */
export async function getNavProfile(): Promise<NavProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, font_preference")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    fullName: data?.full_name ?? null,
    email: user.email ?? null,
    avatarUrl: data?.avatar_url ?? null,
    // Read here rather than in a second query: the root layout already waits
    // on this call, and the face the page is drawn in has to be decided before
    // the first paint or the page arrives in one font and repaints in another.
    font: toFontChoice(data?.font_preference),
  };
}
