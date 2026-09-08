import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AccountType, WorkStatus } from "@/types/database.types";

/**
 * Finding a person.
 *
 * Medosha could find work, services and businesses, and not a person. The
 * filters here are the ones somebody hiring actually applies — trade, city,
 * whether they have been reviewed, whether they can start — and they are
 * resolved in one call rather than fetched and filtered here, because a rating
 * that has to be computed per row cannot be filtered on in the browser.
 *
 * The trade is not a column on `profiles`: it is the category of the services
 * somebody publishes, which is already recorded. A copy on the profile would
 * be a second answer that drifts from the first.
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
  years_experience: number | null;
  phone_verified: boolean;
  work_status: WorkStatus;
  rating: number | null;
  review_count: number;
  verified_reviews: number;
  service_count: number;
  trades: string[];
  total_count: number;
};

export type ProfessionalQuery = {
  query?: string;
  category?: string;
  city?: string;
  minRating?: number;
  verifiedOnly?: boolean;
  availableOnly?: boolean;
  page?: number;
};

export type ProfessionalResult = {
  professionals: ProfessionalRow[];
  total: number;
  /** False when migration 0073 has not been applied, so the page can explain. */
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
    p_city: clean(options.city) ?? null,
    p_min_rating: options.minRating ?? null,
    p_verified_only: options.verifiedOnly ?? false,
    p_available_only: options.availableOnly ?? false,
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
