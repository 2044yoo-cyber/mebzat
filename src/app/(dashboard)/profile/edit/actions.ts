"use server";

import { revalidatePath } from "next/cache";

import {
  isProfession,
  isTravelRadius,
  parseSpecialties,
} from "@/lib/constants/professions";
import { isCompanySize, isIndustry } from "@/lib/constants/industries";
import { parseLanguages } from "@/lib/constants/languages";
import { isPlausiblePlace } from "@/lib/location/places";
import { parseYears } from "@/lib/profile/experience";
import {
  detailsOf,
  detailsToWrite,
  fieldsFor,
  readPostedDetail,
  type ProfessionDetails,
} from "@/lib/profile/profession-fields";
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
  /**
   * When this save finished, as a millisecond stamp.
   *
   * `success: true` is not enough to confirm a save with. It is already `true`
   * when the *next* save finishes, so a `useEffect` watching it sees no change
   * and never fires — the form saved, said nothing, and looked broken. A stamp
   * differs on every save, which is the property the confirmation needs.
   */
  savedAt?: number;
  /** The same, for a failure, so two identical errors in a row both show. */
  erroredAt?: number;
};

const stamp = () => Date.now();

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
    // `?? undefined`, not the raw value. `FormData.get` returns null for a
    // field the form never rendered — an organisation's post carries no
    // portfolio link — and `z.string().optional()` rejects null, which would
    // fail the whole save with an error about a field nobody was shown.
    portfolioLink: formData.get("portfolioLink") ?? undefined,
    linkedinUrl: formData.get("linkedinUrl") ?? undefined,
    bio: formData.get("bio"),
    website: formData.get("website"),
    languages: formData.get("languages"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    // The inline messages say which field; this says that nothing was saved,
    // which on a form long enough to scroll is the part that gets missed.
    return {
      fieldErrors,
      error: "Nothing was saved — check the fields marked below.",
      erroredAt: stamp(),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Log in again.", erroredAt: stamp() };
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
    portfolioLink,
    linkedinUrl,
  } = parsed.data;

  // The trade block. Validated against the constants rather than trusted:
  // `profession` is a text column precisely so the list can grow without a
  // migration, which means this is the only thing standing between it and
  // whatever a crafted post puts there.
  const professionRaw = String(formData.get("profession") ?? "").trim();
  const profession = isProfession(professionRaw) ? professionRaw : null;

  // A place somebody typed rather than picked is allowed — the list will
  // always be missing somewhere — but it still has to look like a place name,
  // which is the line between "a list you can add to" and a free-text field
  // under a different name.
  const baseAreaRaw = String(formData.get("baseArea") ?? "").trim();
  const baseArea = isPlausiblePlace(baseAreaRaw) ? baseAreaRaw : "";

  const radiusRaw = Number(formData.get("travelRadius"));
  const travelRadius = isTravelRadius(radiusRaw) ? radiusRaw : null;

  const statusRaw = String(formData.get("workStatus") ?? "") as WorkStatus;
  const workStatus = WORK_STATUSES.has(statusRaw) ? statusRaw : undefined;

  // An organisation's two questions, checked against the lists rather than
  // trusted — both are text columns so the lists can grow without a migration,
  // which makes this the only thing between them and a crafted post.
  const industryRaw = formData.get("industry");
  const industry = isIndustry(industryRaw) ? industryRaw : null;
  const companySizeRaw = formData.get("companySize");
  const companySize = isCompanySize(companySizeRaw) ? companySizeRaw : null;

  // A field the form did not render is left alone, rather than written null.
  //
  // The form asks an organisation about its industry and a person about their
  // CV, so a person's post carries no `industry` field at all. Writing the
  // parsed value unconditionally would clear it — and somebody who switched
  // from company to individual, saved, and switched back would find the
  // industry gone. Absent is not the same as cleared.
  const asked = (field: string) => formData.has(field);

  // The trade's own questions.
  //
  // Read against the trade being *saved*, not the one on the row: somebody
  // changing from Carpenter to Contractor posts the contractor's fields, and
  // reading the old trade's list would store nothing and score them at zero.
  //
  // Merged over what is stored, never replacing it. The form posts only the
  // fields the current trade shows, so a contractor's save carries no
  // `own_workshop` — and if absent meant "clear", changing trade would delete
  // the answers of the trade somebody came from, which they would find gone
  // the moment they changed back.
  const shownFields = fieldsFor([profession]);

  let professionDetails: ProfessionDetails | undefined;
  if (shownFields.length > 0) {
    const { data: stored } = await supabase
      .from("profiles")
      .select("profession_details")
      .eq("id", user.id)
      .maybeSingle();

    professionDetails = detailsToWrite(
      detailsOf({ profession_details: stored?.profession_details ?? null }),
      shownFields,
      (field) => readPostedDetail(formData, field),
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      profession,
      ...(professionDetails ? { profession_details: professionDetails } : {}),
      specialties: parseSpecialties(formData.get("specialties")),
      base_area: baseArea || null,
      travel_radius_km: travelRadius,
      serves_entire_city: formData.get("servesEntireCity") === "on",
      ...(workStatus ? { work_status: workStatus } : {}),
      account_type: accountType as AccountType,
      full_name: fullName,
      company_name: companyName || null,
      username,
      location_city:
        locationCity && isPlausiblePlace(locationCity) ? locationCity : null,
      location_country: locationCountry || null,
      phone: phone || null,
      show_phone: showPhone,
      show_email: showEmail,
      years_experience: parseYears(yearsExperience),
      ...(asked("industry") ? { industry } : {}),
      ...(asked("companySize") ? { company_size: companySize } : {}),
      ...(asked("portfolioLink") ? { portfolio_link: portfolioLink || null } : {}),
      ...(asked("linkedinUrl") ? { linkedin_url: linkedinUrl || null } : {}),
      bio: bio || null,
      website: website || null,
      languages: parseLanguages(languages),
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: { username: "That username is taken." },
        error: "That username is taken.",
        erroredAt: stamp(),
      };
    }
    return { error: error.message, erroredAt: stamp() };
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
  return { success: true, savedAt: stamp() };
}
