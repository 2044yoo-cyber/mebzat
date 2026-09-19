"use server";

import { revalidatePath } from "next/cache";

import {
  postedAreaSlugs,
  replaceServiceAreas,
} from "@/lib/data/role-profiles";
import { createClient } from "@/lib/supabase/server";

export type SaveResult = { error?: string; savedAt?: string };

const text = (value: FormDataEntryValue | null): string | null => {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Save the shop.
 *
 * Categories are posted as one checkbox per category and read with `getAll`,
 * which is the whole reason they are not a comma-joined string: a category
 * whose name contains a comma would have split into two, and "Doors, Windows
 * and Frames" is a real category name.
 *
 * They are stored as slugs rather than as ids. A category renamed next year
 * still matches; a category deleted leaves a slug that matches nothing rather
 * than a dangling foreign key that refuses the whole save.
 */
export async function saveSellerProfile(
  formData: FormData,
): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Log in again." };

  const categories = [
    ...new Set(
      formData
        .getAll("categories")
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 30);

  const delivers = formData.get("delivers") !== null;

  const { error } = await supabase.from("seller_profiles").upsert(
    {
      profile_id: user.id,
      store_name: text(formData.get("storeName")),
      category_slugs: categories,
      contact_phone: text(formData.get("contactPhone")),
      contact_email: text(formData.get("contactEmail")),
      about: text(formData.get("about")),
      delivers,
      // A delivery note on a shop that does not deliver is a line nobody ever
      // sees and everybody later argues about. It is dropped with the tick.
      delivery_note: delivers ? text(formData.get("deliveryNote")) : null,
    },
    { onConflict: "profile_id" },
  );

  if (error) return { error: "Those changes were not saved." };

  await replaceServiceAreas(
    "seller_service_areas",
    user.id,
    postedAreaSlugs(formData.get("serviceAreas")),
  );

  revalidatePath("/profile/seller");
  revalidatePath("/profile");
  return { savedAt: new Date().toISOString() };
}
