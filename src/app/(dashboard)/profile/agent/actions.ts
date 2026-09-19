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

const list = (value: FormDataEntryValue | null): string[] =>
  String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

/**
 * Save the agent's profile.
 *
 * Upsert rather than insert-or-update: the row is created the first time the
 * screen is saved and the account carries no empty one before that, so an
 * agent who chose the role and never filled anything in is distinguishable
 * from one who did.
 *
 * Years of experience is written as null when it is not a number, rather than
 * as 0. `0 years` is a claim; a blank is the absence of one, and the column's
 * check constraint accepts null for exactly that reason.
 */
export async function saveAgentProfile(formData: FormData): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Log in again." };

  const yearsRaw = String(formData.get("yearsExperience") ?? "").trim();
  const years = Number.parseInt(yearsRaw, 10);

  const { error } = await supabase.from("agent_profiles").upsert(
    {
      profile_id: user.id,
      agency_name: text(formData.get("agencyName")),
      license_number: text(formData.get("licenseNumber")),
      specialisations: list(formData.get("specialisations")),
      years_experience: Number.isInteger(years) ? years : null,
      contact_phone: text(formData.get("contactPhone")),
      contact_email: text(formData.get("contactEmail")),
      about: text(formData.get("about")),
    },
    { onConflict: "profile_id" },
  );

  if (error) return { error: "Those changes were not saved." };

  await replaceServiceAreas(
    "agent_service_areas",
    user.id,
    postedAreaSlugs(formData.get("serviceAreas")),
  );

  revalidatePath("/profile/agent");
  revalidatePath("/profile");
  return { savedAt: new Date().toISOString() };
}
