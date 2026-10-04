import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  BriefAttachment,
  BriefBid,
  ProfessionalMatch,
  ProjectBrief,
} from "@/types/database.types";

/** Reads for the project marketplace. */

export const PAGE_SIZE = 20;

export type BriefRow = ProjectBrief & {
  client: {
    id: string;
    username: string | null;
    full_name: string | null;
    company_name: string | null;
    avatar_url: string | null;
    location_city: string | null;
  } | null;
};

/**
 * A bid with everything the comparison table shows.
 *
 * The bidder's rating, availability, experience and verification are joined
 * once here rather than fetched per row in the table — comparing eight bids
 * across thirteen columns would otherwise be over a hundred round trips.
 */
export type BidRow = BriefBid & {
  bidder: {
    id: string;
    username: string | null;
    full_name: string | null;
    company_name: string | null;
    avatar_url: string | null;
    location_city: string | null;
    verification_status: string | null;
    work_status: string | null;
    response_minutes: number | null;
    years_experience: number | null;
    reputation_points: number;
  } | null;
  company: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    verified: boolean;
  } | null;
  service: {
    id: string;
    title: string;
    rating: number;
    review_count: number;
    completed_projects: number;
    work_status: string;
  } | null;
};

const BRIEF_COLUMNS = `
  *,
  client:profiles!client_id(id, username, full_name, company_name, avatar_url, location_city)
`;

const BID_COLUMNS = `
  *,
  bidder:profiles!bidder_id(id, username, full_name, company_name, avatar_url, location_city, verification_status, work_status, response_minutes, years_experience, reputation_points),
  company:companies(id, name, slug, logo_url, verified),
  service:services(id, title, rating, review_count, completed_projects, work_status)
`;

export type BriefResult = {
  briefs: BriefRow[];
  total: number;
  available: boolean;
};

export async function getBriefs(options: {
  q?: string;
  category?: string;
  city?: string;
  maxBudget?: number;
  page?: number;
  pageSize?: number;
} = {}): Promise<BriefResult> {
  const { q, category, city, maxBudget, page = 1, pageSize = PAGE_SIZE } = options;

  const supabase = await createClient();

  let builder = supabase
    .from("project_briefs")
    .select(BRIEF_COLUMNS, { count: "exact" })
    .eq("status", "open");

  const term = q?.replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim();
  if (term) {
    builder = builder.or(
      `title.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`,
    );
  }
  if (category) builder = builder.eq("category", category);
  if (city) builder = builder.eq("location_city", city);
  if (maxBudget !== undefined) builder = builder.lte("budget_min", maxBudget);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await builder
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) return { briefs: [], total: 0, available: false };

  return {
    briefs: (data ?? []) as unknown as BriefRow[],
    total: count ?? 0,
    available: true,
  };
}

export async function getBrief(id: string): Promise<BriefRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_briefs")
    .select(BRIEF_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as BriefRow;
}

/**
 * Bids on a brief.
 *
 * RLS decides what comes back: the client sees every bid, a professional sees
 * only their own. The caller does not have to know which — it renders what it
 * is given.
 */
export async function getBids(briefId: string): Promise<BidRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brief_bids")
    .select(BID_COLUMNS)
    .eq("brief_id", briefId)
    .neq("status", "withdrawn")
    .order("price", { ascending: true })
    .limit(60);

  return (data ?? []) as unknown as BidRow[];
}

export async function getMyBid(
  briefId: string,
  userId: string | null,
): Promise<BriefBid | null> {
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("brief_bids")
    .select("*")
    .eq("brief_id", briefId)
    .eq("bidder_id", userId)
    .maybeSingle();

  return data;
}

export async function getBriefAttachments(
  briefId: string,
): Promise<BriefAttachment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brief_attachments")
    .select("*")
    .eq("brief_id", briefId)
    .order("position", { ascending: true });
  return (data ?? []) as BriefAttachment[];
}

/** Smart matching. Only the client of a brief should be shown these. */
export async function getMatches(
  briefId: string,
  limit = 12,
): Promise<ProfessionalMatch[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("match_professionals", {
    target_brief_id: briefId,
    max_results: limit,
  });
  return (data ?? []) as ProfessionalMatch[];
}

/** Briefs the viewer posted, for their dashboard. */
export async function getMyBriefs(userId: string): Promise<BriefRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_briefs")
    .select(BRIEF_COLUMNS)
    .eq("client_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as BriefRow[];
}

/** Briefs the viewer was invited to by the matcher, newest first. */
export async function getInvitedBriefs(userId: string): Promise<BriefRow[]> {
  const supabase = await createClient();
  const { data: invites } = await supabase
    .from("brief_invites")
    .select("brief_id")
    .eq("professional_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  const ids = (invites ?? []).map((row) => row.brief_id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("project_briefs")
    .select(BRIEF_COLUMNS)
    .in("id", ids)
    .eq("status", "open");

  return (data ?? []) as unknown as BriefRow[];
}
