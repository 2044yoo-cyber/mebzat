import "server-only";

import { NO_RATING, type ProfileRating, type ProfileService } from "./professional-profile";
import { createClient } from "@/lib/supabase/server";
import type { Company, TeamRole } from "@/types/database.types";

/**
 * Everything a business page shows, gathered once.
 *
 * The same shape as `professional-profile.ts` and for the same reason: a
 * business's standing and a person's are the same question asked of a
 * different subject, and two implementations would give two numbers.
 *
 * Three columns this deliberately does not trust as they stand — `rating`,
 * `review_count` and `followers_count` were declared in 0006 and never
 * written by anything, so 0072 gave them triggers and a backfill. The rating
 * still comes from the aggregate rather than the column, because the column
 * is a cache of reviews of the company alone while the page is about the
 * business including the services it sells.
 */

export type CompanyTeamMember = {
  id: string;
  role: TeamRole;
  title: string | null;
  member: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    phone_verified: boolean;
  } | null;
};

export type PublicCompany = {
  company: Company;
  rating: ProfileRating;
  services: ProfileService[];
  team: CompanyTeamMember[];
  /** Null for a signed-out visitor — there is nothing to toggle. */
  viewerFollows: boolean | null;
  isOwner: boolean;
};

const SERVICE_COLUMNS = `
  id, title, slug, description, cover_image_url, price_from, price_to,
  currency, unit, pricing, rating, review_count, accepting_work, location_city,
  category:service_categories(name, slug)
`;

export async function getPublicCompany(
  slug: string,
): Promise<PublicCompany | null> {
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!company) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = Boolean(user && company.owner_id === user.id);

  const [reputation, services, team, follow] = await Promise.all([
    supabase.rpc("company_reputation", { p_company: company.id }),
    supabase
      .from("services")
      .select(SERVICE_COLUMNS)
      .eq("company_id", company.id)
      .eq("status", "published")
      .order("rating", { ascending: false })
      .limit(24),
    supabase
      .from("company_members")
      .select(
        "id, role, title, member:profiles!user_id(id, username, full_name, avatar_url, phone_verified)",
      )
      .eq("company_id", company.id)
      // Invited-but-not-joined is not somebody who works there.
      .eq("status", "active")
      .limit(24),
    user
      ? supabase
          .from("follows")
          .select("target_id")
          .eq("follower_id", user.id)
          .eq("target_type", "company")
          .eq("target_id", company.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const row = reputation.data?.[0];
  const rating: ProfileRating = row
    ? {
        average: Number(row.average) || 0,
        total: Number(row.total) || 0,
        histogram: [
          Number(row.one) || 0,
          Number(row.two) || 0,
          Number(row.three) || 0,
          Number(row.four) || 0,
          Number(row.five) || 0,
        ],
        verified: Number(row.verified_total) || 0,
        services: Number(row.service_count) || 0,
      }
    : NO_RATING;

  return {
    company: company as Company,
    rating,
    services: (services.data ?? []) as unknown as ProfileService[],
    team: (team.data ?? []) as unknown as CompanyTeamMember[],
    viewerFollows: user ? Boolean(follow.data) : null,
    isOwner,
  };
}
