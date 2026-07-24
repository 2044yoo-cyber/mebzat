"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type FavoriteResult = {
  favorited: boolean;
  error?: string;
  requiresAuth?: boolean;
};

/** Toggles the current user's favorite for a product. Called from the client
 * Save button with an optimistic update; returns the authoritative state. */
export async function toggleFavorite(
  productId: string,
): Promise<FavoriteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { favorited: false, requiresAuth: true };
  }

  const { data: existing } = await supabase
    .from("product_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("product_favorites")
      .delete()
      .eq("id", existing.id);
    if (error) return { favorited: true, error: error.message };
    revalidatePath("/saved");
    return { favorited: false };
  }

  const { error } = await supabase
    .from("product_favorites")
    .insert({ user_id: user.id, product_id: productId });
  if (error) return { favorited: false, error: error.message };
  revalidatePath("/saved");
  return { favorited: true };
}
