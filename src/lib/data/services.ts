import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Service,
  ServiceCategory,
  ServiceCertificate,
  ServiceEventKind,
  ServicePortfolioItem,
} from "@/types/database.types";

/** Reads for professional Services. */

export const PAGE_SIZE = 24;

export type ServiceRow = Service & {
  provider: {
    id: string;
    username: string | null;
    full_name: string | null;
    company_name: string | null;
    avatar_url: string | null;
    account_type: string | null;
    verification_status: string | null;
  } | null;
  company: { id: string; name: string; slug: string; logo_url: string | null } | null;
  category: { id: string; slug: string; name: string } | null;
};

export type ServiceResult = {
  services: ServiceRow[];
  total: number;
  available: boolean;
};

export type ServiceSort = "rating" | "cheapest" | "newest";

const COLUMNS = `
  *,
  provider:profiles!provider_id(id, username, full_name, company_name, avatar_url, account_type, verification_status),
  company:companies(id, name, slug, logo_url),
  category:service_categories(id, slug, name)
`;

const SORTS: Record<ServiceSort, { column: string; ascending: boolean }> = {
  rating: { column: "rating", ascending: false },
  cheapest: { column: "price_from", ascending: true },
  newest: { column: "created_at", ascending: false },
};

function sanitize(term: string): string {
  return term.replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim();
}

export async function getServices(options: {
  q?: string;
  categorySlug?: string;
  city?: string;
  acceptingOnly?: boolean;
  sort?: ServiceSort;
  page?: number;
  pageSize?: number;
} = {}): Promise<ServiceResult> {
  const {
    q,
    categorySlug,
    city,
    acceptingOnly = false,
    sort = "rating",
    page = 1,
    pageSize = PAGE_SIZE,
  } = options;

  const supabase = await createClient();

  let categoryId: string | null = null;
  if (categorySlug) {
    const { data: category } = await supabase
      .from("service_categories")
      .select("id")
      .eq("slug", categorySlug)
      .maybeSingle();
    // An unknown slug should show nothing, not silently show everything.
    if (!category) return { services: [], total: 0, available: true };
    categoryId = category.id;
  }

  let builder = supabase
    .from("services")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "published");

  const term = q ? sanitize(q) : "";
  if (term) {
    builder = builder.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (categoryId) builder = builder.eq("category_id", categoryId);
  if (city) builder = builder.eq("location_city", city);
  if (acceptingOnly) builder = builder.eq("accepting_work", true);

  const order = SORTS[sort];
  const from = (page - 1) * pageSize;

  const { data, count, error } = await builder
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .range(from, from + pageSize - 1);

  if (error) return { services: [], total: 0, available: false };

  return {
    services: (data ?? []) as unknown as ServiceRow[],
    total: count ?? 0,
    available: true,
  };
}

export async function getService(id: string): Promise<ServiceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as ServiceRow;
}

export async function getServiceCategories(): Promise<ServiceCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_categories")
    .select("*")
    .order("position", { ascending: true });

  return (data ?? []) as ServiceCategory[];
}

// --- Service management (0014) ---------------------------------------------

export type ServiceAnalytics = {
  views: number;
  searchAppearances: number;
  quoteRequests: number;
  messages: number;
  calls: number;
  profileVisits: number;
  bookmarks: number;
  bidsSubmitted: number;
  bidsAccepted: number;
  jobsCompleted: number;
  revenue: number;
  averageBid: number | null;
  conversionRate: number;
};

export const EMPTY_ANALYTICS: ServiceAnalytics = {
  views: 0,
  searchAppearances: 0,
  quoteRequests: 0,
  messages: 0,
  calls: 0,
  profileVisits: 0,
  bookmarks: 0,
  bidsSubmitted: 0,
  bidsAccepted: 0,
  jobsCompleted: 0,
  revenue: 0,
  averageBid: null,
  conversionRate: 0,
};

/** Every service belonging to one provider, including drafts and paused ones. */
export async function getMyServices(userId: string): Promise<ServiceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select(COLUMNS)
    .eq("provider_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as ServiceRow[];
}

/** Headline metrics for one service over a window. */
export async function getServiceAnalytics(
  serviceId: string,
  days = 30,
): Promise<ServiceAnalytics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("service_analytics", {
    target_service_id: serviceId,
    days,
  });

  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return EMPTY_ANALYTICS;

  return {
    views: Number(row.views ?? 0),
    searchAppearances: Number(row.search_appearances ?? 0),
    quoteRequests: Number(row.quote_requests ?? 0),
    messages: Number(row.messages ?? 0),
    calls: Number(row.calls ?? 0),
    profileVisits: Number(row.profile_visits ?? 0),
    bookmarks: Number(row.bookmarks ?? 0),
    bidsSubmitted: Number(row.bids_submitted ?? 0),
    bidsAccepted: Number(row.bids_accepted ?? 0),
    jobsCompleted: Number(row.jobs_completed ?? 0),
    revenue: Number(row.revenue ?? 0),
    averageBid: row.average_bid === null ? null : Number(row.average_bid),
    conversionRate: Number(row.conversion_rate ?? 0),
  };
}

/** Daily counts of one event kind, for the sparkline. */
export async function getServiceTrend(
  serviceId: string,
  kind: ServiceEventKind,
  days = 30,
): Promise<{ day: string; total: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("service_event_trend", {
    target_service_id: serviceId,
    target_kind: kind,
    days,
  });
  return (data ?? []) as { day: string; total: number }[];
}

export async function getServicePortfolio(
  serviceId: string,
): Promise<ServicePortfolioItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_portfolio")
    .select("*")
    .eq("service_id", serviceId)
    .order("position", { ascending: true });
  return (data ?? []) as ServicePortfolioItem[];
}

export async function getServiceCertificates(
  serviceId: string,
): Promise<ServiceCertificate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_certificates")
    .select("*")
    .eq("service_id", serviceId)
    .order("issued_on", { ascending: false });
  return (data ?? []) as ServiceCertificate[];
}

/** Whether the viewer has bookmarked or follows a service. */
export async function getServiceEngagement(
  serviceId: string,
  userId: string | null,
): Promise<{ bookmarked: boolean; following: boolean }> {
  if (!userId) return { bookmarked: false, following: false };

  const supabase = await createClient();
  const [bookmark, follow] = await Promise.all([
    supabase
      .from("service_bookmarks")
      .select("service_id")
      .eq("service_id", serviceId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("service_follows")
      .select("service_id")
      .eq("service_id", serviceId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return {
    bookmarked: bookmark.data !== null,
    following: follow.data !== null,
  };
}
