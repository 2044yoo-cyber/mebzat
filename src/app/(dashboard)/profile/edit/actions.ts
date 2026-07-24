"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { profileDetailsSchema } from "@/lib/validations/onboarding";

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
    fullName: formData.get("fullName"),
    companyName: formData.get("companyName"),
    username: formData.get("username"),
    locationCity: formData.get("locationCity"),
    locationCountry: formData.get("locationCountry"),
    phone: formData.get("phone"),
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
    fullName,
    companyName,
    username,
    locationCity,
    locationCountry,
    phone,
    yearsExperience,
    bio,
    website,
    languages,
  } = parsed.data;

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      company_name: companyName || null,
      username,
      location_city: locationCity || null,
      location_country: locationCountry || null,
      phone: phone || null,
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

  revalidatePath("/profile");
  return { success: true };
}
