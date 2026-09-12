"use server";

import { revalidatePath } from "next/cache";

import {
  isProfession,
  isTravelRadius,
  parseSpecialties,
} from "@/lib/constants/professions";
import { createClient } from "@/lib/supabase/server";
import { profileDetailsSchema } from "@/lib/validations/profile";
import type { AccountType, WorkStatus } from "@/types/database.types";

/** The four the form offers, on the enum that already existed. */
const WORK_STATUSES = new Set<WorkStatus>([
  "available",
  "limited",
  "busy",
  "fully_booked",
]);

export type EditProfileState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export async function updateProfile(
  _prevState: EditProfileState,
  formData: FormData,
): Promise<EditProfileState> {
  const parsed = profileDetailsSchema.safeParse({
    accountType: formData.get("accountType"),
    fullName: formData.get("fullName"),
    companyName: formData.get("companyName"),
    username: formData.get("username"),
    locationCity: formData.get("locationCity"),
    locationCountry: formData.get("locationCountry"),
    phone: formData.get("phone"),
    showPhone: formData.get("showPhone") === "on",
    showEmail: formData.get("showEmail") === "on",
    yearsExperience: formData.get("yearsExperience") || undefined,
    bio: formData.get("bio"),
    website: formData.get("website"),
    languages: formData.get("languages"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Log in again." };
  }

  const {
    accountType,
    fullName,
    companyName,
    username,
    locationCity,
    locationCountry,
    phone,
    showPhone,
    showEmail,
    yearsExperience,
    bio,
    website,
    languages,
  } = parsed.data;

  // The trade block. Validated against the constants rather than trusted:
  // `profession` is a text column precisely so the list can grow without a
  // migration, which means this is the only thing standing between it and
  // whatever a crafted post puts there.
  const professionRaw = String(formData.get("profession") ?? "").trim();
  const profession = isProfession(professionRaw) ? professionRaw : null;

  const baseArea = String(formData.get("baseArea") ?? "").trim().slice(0, 80);

  const radiusRaw = Number(formData.get("travelRadius"));
  const travelRadius = isTravelRadius(radiusRaw) ? radiusRaw : null;

  const statusRaw = String(formData.get("workStatus") ?? "") as WorkStatus;
  const workStatus = WORK_STATUSES.has(statusRaw) ? statusRaw : undefined;

  const { error } = await supabase
    .from("profiles")
    .update({
      profession,
      specialties: parseSpecialties(formData.get("specialties")),
      base_area: baseArea || null,
      travel_radius_km: travelRadius,
      serves_entire_city: formData.get("servesEntireCity") === "on",
      ...(workStatus ? { work_status: workStatus } : {}),
      account_type: accountType as AccountType,
      full_name: fullName,
      company_name: companyName || null,
      username,
      location_city: locationCity || null,
      location_country: locationCountry || null,
      phone: phone || null,
      show_phone: showPhone,
      show_email: showEmail,
      years_experience: yearsExperience ?? null,
      bio: bio || null,
      website: website || null,
      languages: languages
        ? languages.split(",").map((l) => l.trim()).filter(Boolean)
        : [],
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { username: "That username is taken." } };
    }
    return { error: error.message };
  }

  // Service areas are rows, not a column, so they are replaced rather than
  // merged: the form posts the whole set every time and a deselected area has
  // to actually go. Only the caller's own rows are touched, and RLS says the
  // same thing independently.
  const slugs = String(formData.get("serviceAreas") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 40);

  await supabase
    .from("professional_service_areas")
    .delete()
    .eq("profile_id", user.id);

  if (slugs.length > 0) {
    // Names come from the gazetteer, not from the browser: a posted slug is
    // checked against a real area, so an invented one writes nothing rather
    // than creating an area that exists only on one profile.
    const { data: known } = await supabase
      .from("location_areas")
      .select("slug, name, city, country")
      .in("slug", slugs);

    const rows = (known ?? []).map((area) => ({
      profile_id: user.id,
      area_slug: area.slug,
      area_name: area.name,
      city: area.city,
      country: area.country,
    }));

    if (rows.length > 0) {
      await supabase.from("professional_service_areas").insert(rows);
    }
  }

  revalidatePath("/profile");
  revalidatePath("/professionals");
  revalidatePath("/dashboard");
  // The public page renders these, so it has to be rebuilt or the owner
  // switches their number off and still sees it published.
  if (username) revalidatePath(`/u/${username}`);
  return { success: true };
}
