"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  accountTypeSchema,
  profileDetailsSchema,
} from "@/lib/validations/onboarding";
import type { AccountType } from "@/types/database.types";

export type OnboardingState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const typeParsed = accountTypeSchema.safeParse({
    accountType: formData.get("accountType"),
  });

  if (!typeParsed.success) {
    return { error: "Choose an account type to continue." };
  }

  const detailsParsed = profileDetailsSchema.safeParse({
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

  if (!detailsParsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of detailsParsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
  } = detailsParsed.data;

  const { error } = await supabase
    .from("profiles")
    .update({
      account_type: typeParsed.data.accountType as AccountType,
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
      onboarding_completed: true,
      onboarding_step: 2,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { username: "That username is taken." } };
    }
    return { error: error.message };
  }

  redirect("/dashboard");
}
