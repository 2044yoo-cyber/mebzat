import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Profile,
  Service,
  ServiceCertificate,
  ServicePortfolioItem,
} from "@/types/database.types";

/**
 * Everything a public profile page shows, gathered once.
 *
 * The professional layer — services, portfolio, certificates, reviews,
 * reputation, follows — was all built and none of it reached `/u/<username>`,
 * which showed a cover photo, a bio and a list of projects. This is the wiring,
 * not a new system: no table here is new, and the brief's rule against a second
 * user system is the reason it reads `services` and `reviews` rather than
 * inventing profile-shaped copies of them.
 *
 * One read, one place. A page that made a dozen round trips of its own would
 * be a page whose numbers disagreed with the service page's.
 */

export type ProfileRating = {
  average: number;
  total: number;
  histogram: [number, number, number, number, number];
  /** Reviews backed by a booking or a hire. */
  verified: number;
  services: number;
};

export const NO_RATING: ProfileRating = {
  average: 0,
  total: 0,
  histogram: [0, 0, 0, 0, 0],
  verified: 0,
  services: 0,
};

export type ProfileService = Pick<
  Service,
  | "id"
  | "title"
  | "slug"
  | "description"
  | "cover_image_url"
  | "price_from"
  | "price_to"
  | "currency"
  | "unit"
  | "pricing"
  | "rating"
  | "review_count"
  | "accepting_work"
  | "location_city"
> & { category: { name: string; slug: string } | null };

export type ProfileWork = ServicePortfolioItem & {
  serviceTitle: string;
  serviceId: string;
};

export type ProfileCredential = ServiceCertificate & { serviceTitle: string };

export type PublicProfile = {
  profile: Profile;
  rating: ProfileRating;
  services: ProfileService[];
  portfolio: ProfileWork[];
  credentials: ProfileCredential[];
  followers: number;
  projects: number;
  /** Null for a signed-out visitor — there is nothing to toggle. */
  viewerFollows: boolean | null;
  isOwner: boolean;
};

const SERVICE_COLUMNS = `
  id, title, slug, description, cover_image_url, price_from, price_to,
  currency, unit, pricing, rating, review_count, accepting_work, location_city,
  category:service_categories(name, slug)
`;

export async function getPublicProfile(
  username: string,
): Promise<PublicProfile | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!profile) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === profile.id;

  const [reputation, services, followers, projects, follow] = await Promise.all([
    supabase.rpc("professional_reputation", { p_user: profile.id }),
    supabase
      .from("services")
      .select(SERVICE_COLUMNS)
      .eq("provider_id", profile.id)
      .eq("status", "published")
      .order("rating", { ascending: false })
      .limit(24),
    supabase
      .from("follows")
      .select("target_id", { count: "exact", head: true })
      .eq("target_type", "profile")
      .eq("target_id", profile.id),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", profile.id)
      .eq("status", "published"),
    user
      ? supabase
          .from("follows")
          .select("target_id")
          .eq("follower_id", user.id)
          .eq("target_type", "profile")
          .eq("target_id", profile.id)
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

  const list = (services.data ?? []) as unknown as ProfileService[];

  // Portfolio and certificates hang off services, so they can only be fetched
  // once the services are known. Skipped entirely when there are none rather
  // than issuing a query with an empty `in` list.
  const serviceIds = list.map((service) => service.id);
  const titles = new Map(list.map((service) => [service.id, service.title]));

  let portfolio: ProfileWork[] = [];
  let credentials: ProfileCredential[] = [];

  if (serviceIds.length > 0) {
    const [works, certificates] = await Promise.all([
      supabase
        .from("service_portfolio")
        .select("*")
        .in("service_id", serviceIds)
        .order("position", { ascending: true })
        .limit(36),
      supabase
        .from("service_certificates")
        .select("*")
        .in("service_id", serviceIds)
        .order("issued_on", { ascending: false })
        .limit(24),
    ]);

    portfolio = ((works.data ?? []) as ServicePortfolioItem[]).map((work) => ({
      ...work,
      serviceId: work.service_id,
      serviceTitle: titles.get(work.service_id) ?? "",
    }));
    credentials = ((certificates.data ?? []) as ServiceCertificate[]).map(
      (certificate) => ({
        ...certificate,
        serviceTitle: titles.get(certificate.service_id) ?? "",
      }),
    );
  }

  return {
    profile: profile as Profile,
    rating,
    services: list,
    portfolio,
    credentials,
    followers: followers.count ?? 0,
    projects: projects.count ?? 0,
    viewerFollows: user ? Boolean(follow.data) : null,
    isOwner,
  };
}

/**
 * The contact details this viewer may see.
 *
 * A number typed in to receive a confirmation code was being published on a
 * public page, indexed, to anybody who opened it. It is shown now because its
 * owner said to show it — and always to the owner themselves, who would
 * otherwise have no way to check what everybody else can see.
 */
export function visibleContact(
  profile: Profile,
  isOwner: boolean,
): { phone: string | null; email: string | null } {
  return {
    phone: profile.show_phone || isOwner ? profile.phone : null,
    email: profile.show_email || isOwner ? profile.email : null,
  };
}
