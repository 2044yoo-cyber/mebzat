import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CompanyCardData } from "@/components/companies/company-card";

const CARD_COLUMNS =
  "id, slug, name, category, city, country, logo_url, cover_url, is_claimed, verified, rating, projects_completed";

function sanitize(term: string) {
  return term.replace(/[,()%]/g, " ").trim();
}

export type CompaniesQuery = {
  q?: string;
  claimed?: boolean;
  page?: number;
  pageSize?: number;
};

export type CompaniesResult = {
  companies: CompanyCardData[];
  total: number;
  available: boolean;
};

/** Public business directory. Resilient to the companies table not existing
 * yet (returns available:false) so the app renders before 0006 is applied. */
export async function getCompanies(
  params: CompaniesQuery = {},
): Promise<CompaniesResult> {
  const { q, claimed, page = 1, pageSize = 24 } = params;
  const supabase = await createClient();

  let query = supabase
    .from("companies")
    .select(CARD_COLUMNS, { count: "exact" });

  const term = q ? sanitize(q) : "";
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,category.ilike.%${term}%,city.ilike.%${term}%`,
    );
  }
  if (typeof claimed === "boolean") query = query.eq("is_claimed", claimed);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query
    .order("verified", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) return { companies: [], total: 0, available: false };

  return {
    companies: (data ?? []) as CompanyCardData[],
    total: count ?? 0,
    available: true,
  };
}

export async function getCompanyBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export type OwnedCompany = { id: string; name: string; slug: string };

/** Companies this person owns, for the "post as" picker on a job form.
 * owner_id is null until a claim is verified, so an unclaimed company never
 * appears here even if the person imported it. Returns [] rather than
 * throwing: not owning a company is the normal case, and the form is
 * expected to render without the picker. */
export async function getMyCompanies(userId: string): Promise<OwnedCompany[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("owner_id", userId)
    .order("name");

  if (error) return [];
  return (data ?? []) as OwnedCompany[];
}
