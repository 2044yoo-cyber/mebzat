import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AccountType, WorkStatus } from "@/types/database.types";

/**
 * Finding somebody who will come to the job.
 *
 * The filter that matters is the *job location*, not where the professional
 * lives. 0073 compared the search city to `profiles.location_city`, so a
 * welder based in Bole who was perfectly happy to travel to Summit did not
 * appear in a search for a welder in Summit — and had no field in which to say
 * he would go. 0078 gives him one, and this asks about that one.
 *
 * Everything is resolved in a single call rather than fetched and filtered
 * here: a rating that has to be computed per row cannot be filtered on in the
 * browser, and neither can a distance.
 */

export const PAGE_SIZE = 24;

export type ProfessionalRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  account_type: AccountType | null;
  location_city: string | null;
  base_area: string | null;
  /** Only present when the professional chose to publish it. */
  phone: string | null;
  profession: string | null;
  specialties: string[];
  years_experience: number | null;
  phone_verified: boolean;
  id_verified: boolean;
  business_verified: boolean;
  license_verified: boolean;
  work_status: WorkStatus;
  rating: number | null;
  review_count: number;
  verified_reviews: number;
  service_count: number;
  trades: string[];
  service_areas: string[];
  serves_entire_city: boolean;
  travel_radius_km: number | null;
  projects_completed: number;
  distance_km: number | null;
  /** How this professional covers the job location. Null when none was asked for. */
  match_kind: "area" | "radius" | "city" | "any" | null;
  total_count: number;
};

export type ProviderType = "individual" | "company";
export type ProfessionalSort = "relevance" | "rating" | "nearest" | "experience";

export type ProfessionalQuery = {
  query?: string;
  category?: string;
  profession?: string;
  /** A location_areas slug. Where the job is. */
  area?: string;
  city?: string;
  provider?: ProviderType;
  minRating?: number;
  minExperience?: number;
  verifiedOnly?: boolean;
  availableOnly?: boolean;
  sort?: ProfessionalSort;
  page?: number;
};

export type ProfessionalResult = {
  professionals: ProfessionalRow[];
  total: number;
  /** False when migration 0078 has not been applied, so the page can explain. */
  available: boolean;
};

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, " ").slice(0, 120);
  return trimmed ? trimmed : undefined;
}

export async function searchProfessionals(
  options: ProfessionalQuery = {},
): Promise<ProfessionalResult> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);

  const { data, error } = await supabase.rpc("search_professionals", {
    p_query: clean(options.query) ?? null,
    p_category: clean(options.category) ?? null,
    p_profession: clean(options.profession) ?? null,
    p_area: clean(options.area) ?? null,
    p_city: clean(options.city) ?? "Addis Ababa",
    p_provider: options.provider ?? null,
    p_min_rating: options.minRating ?? null,
    p_verified_only: options.verifiedOnly ?? false,
    p_available_only: options.availableOnly ?? false,
    p_min_experience: options.minExperience ?? null,
    p_sort: options.sort ?? "relevance",
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });

  if (error) return { professionals: [], total: 0, available: false };

  const rows = (data ?? []) as ProfessionalRow[];
  return {
    professionals: rows,
    // Every row carries the same window count; no rows means no matches.
    total: rows[0]?.total_count ?? 0,
    available: true,
  };
}

// ---------------------------------------------------------------------------
// Areas
// ---------------------------------------------------------------------------

export type Area = {
  slug: string;
  name: string;
  sub_city: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * The places a job can be, for the location field.
 *
 * Read from the database rather than from the TypeScript gazetteer so the list
 * the customer picks from is exactly the list the search can match — offering
 * a name the search function cannot resolve produces "no professionals work
 * here" for a place where several do.
 */
export async function listAreas(city = "Addis Ababa"): Promise<Area[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("location_areas")
    .select("slug, name, sub_city, city, latitude, longitude")
    .eq("city", city)
    .order("name");
  return (data ?? []) as Area[];
}

/**
 * The areas one professional works in, for their profile page.
 *
 * Returned as names in the order they read on a card, with the slugs kept so
 * "do they work in my area?" is a comparison rather than a string match on a
 * display name.
 */
export async function serviceAreasFor(
  profileId: string,
): Promise<{ slug: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("professional_service_areas")
    .select("area_slug, area_name")
    .eq("profile_id", profileId)
    .order("area_name");

  return (data ?? []).map((row) => ({
    slug: row.area_slug as string,
    name: row.area_name as string,
  }));
}

/**
 * The businesses somebody may publish work under.
 *
 * Owner or active member. The same rule 0080's trigger enforces, asked here so
 * the form only offers what the database will accept — a select full of
 * companies that all fail on save is worse than no select.
 */
export async function companiesFor(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();

  const [owned, member] = await Promise.all([
    supabase.from("companies").select("id, name").eq("owner_id", userId),
    supabase
      .from("company_members")
      .select("company_id, companies(id, name)")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const seen = new Map<string, string>();
  for (const row of owned.data ?? []) {
    seen.set(row.id as string, row.name as string);
  }
  for (const row of member.data ?? []) {
    const company = row.companies as unknown as { id: string; name: string } | null;
    if (company) seen.set(company.id, company.name);
  }

  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
