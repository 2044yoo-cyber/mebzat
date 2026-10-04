import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { InvestSort } from "@/lib/constants/invest";
import type {
  InvestInvestor,
  InvestStage,
  InvestOverview,
  InvestPosition,
  InvestProject,
  InvestProjectDocument,
  InvestProjectMedia,
  InvestProjectUpdate,
} from "@/types/database.types";

/**
 * Data access for Medosha Invest.
 *
 * Every function reports `available` rather than throwing when the tables are
 * missing, the same contract the rest of the platform's data layer uses. That
 * is what lets /invest render an explanatory empty state before migration 0019
 * has been applied instead of a 500.
 */

const PROJECT_COLUMNS = "*";

export type InvestProjectsResult = {
  projects: InvestProject[];
  available: boolean;
};

export async function getInvestProjects(
  options: { stage?: InvestStage; sort?: InvestSort; limit?: number } = {},
): Promise<InvestProjectsResult> {
  const supabase = await createClient();

  let query = supabase
    .from("invest_projects")
    .select(PROJECT_COLUMNS)
    .eq("published", true);

  if (options.stage) query = query.eq("stage", options.stage);

  switch (options.sort) {
    case "roi":
      query = query.order("expected_roi_pct", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    case "progress":
      // Ordering by the ratio needs a computed column, so this orders by what
      // is stored and the page sorts the page-sized result precisely.
      query = query.order("funding_raised", { ascending: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query.order("funding_goal", { ascending: false });
  }

  const { data, error } = await query.limit(options.limit ?? 24);
  if (error) return { projects: [], available: false };

  const projects = (data ?? []) as InvestProject[];

  if (options.sort === "progress") {
    projects.sort(
      (a, b) =>
        b.funding_raised / Math.max(1, b.funding_goal) -
        a.funding_raised / Math.max(1, a.funding_goal),
    );
  }

  return { projects, available: true };
}

export async function getInvestProject(
  slug: string,
): Promise<InvestProject | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invest_projects")
    .select(PROJECT_COLUMNS)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return (data as InvestProject | null) ?? null;
}

export async function getInvestOverview(): Promise<InvestOverview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invest_overview");
  if (error || !data) return null;
  // The function returns a single row; PostgREST hands back an array.
  const row = Array.isArray(data) ? data[0] : data;
  return (row as InvestOverview | undefined) ?? null;
}

export async function getProjectUpdates(
  projectId: string,
  limit = 12,
): Promise<InvestProjectUpdate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invest_project_updates")
    .select("*")
    .eq("project_id", projectId)
    .order("published_on", { ascending: false })
    .limit(limit);
  return (data ?? []) as InvestProjectUpdate[];
}

export async function getProjectDocuments(
  projectId: string,
): Promise<InvestProjectDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invest_project_documents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at");
  return (data ?? []) as InvestProjectDocument[];
}

export async function getProjectMedia(
  projectId: string,
): Promise<InvestProjectMedia[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invest_project_media")
    .select("*")
    .eq("project_id", projectId)
    .order("position");
  return (data ?? []) as InvestProjectMedia[];
}

export type InvestorsResult = {
  investors: InvestInvestor[];
  available: boolean;
};

export async function getInvestors(limit = 24): Promise<InvestorsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invest_investors")
    .select("*")
    .order("portfolio_value", { ascending: false })
    .limit(limit);
  if (error) return { investors: [], available: false };
  return { investors: (data ?? []) as InvestInvestor[], available: true };
}

export async function getInvestor(id: string): Promise<InvestInvestor | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invest_investors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as InvestInvestor | null) ?? null;
}

/** The investor row for the signed-in member, if they have one. */
export async function getMyInvestorProfile(): Promise<InvestInvestor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("invest_investors")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();
  return (data as InvestInvestor | null) ?? null;
}

export type PositionWithProject = InvestPosition & {
  project: Pick<
    InvestProject,
    | "id"
    | "slug"
    | "title"
    | "location"
    | "stage"
    | "expected_roi_pct"
    | "construction_pct"
    | "hero_image_url"
    | "currency"
    | "is_demo"
  > | null;
};

export async function getPositions(
  investorId: string,
): Promise<PositionWithProject[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invest_positions")
    .select(
      "*, project:invest_projects(id, slug, title, location, stage, expected_roi_pct, construction_pct, hero_image_url, currency, is_demo)",
    )
    .eq("investor_id", investorId)
    .order("committed_on", { ascending: false });
  // Relationships are declared empty for these tables, so the generated types
  // cannot see the join. The select above names the columns explicitly, so the
  // runtime shape is known — the cast says so rather than pretending.
  return (data ?? []) as unknown as PositionWithProject[];
}

/** Investors holding a position in one project, for the project page. */
export async function getProjectInvestors(
  projectId: string,
  limit = 8,
): Promise<InvestInvestor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invest_positions")
    .select("investor:invest_investors(*)")
    .eq("project_id", projectId)
    .order("amount", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as { investor: InvestInvestor | null }[])
    .map((row) => row.investor)
    .filter((investor): investor is InvestInvestor => investor !== null);
}

export async function isFollowingProject(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("invest_follows")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  return data !== null;
}

/**
 * Projects near a point, for cross-linking from a property or the city map.
 * A crude bounding box rather than PostGIS: at city scale the error is metres
 * and the query stays an index scan.
 */
export async function getNearbyInvestProjects(
  latitude: number,
  longitude: number,
  limit = 3,
): Promise<InvestProject[]> {
  const supabase = await createClient();
  const delta = 0.09; // roughly 10km
  const { data } = await supabase
    .from("invest_projects")
    .select(PROJECT_COLUMNS)
    .eq("published", true)
    .gte("latitude", latitude - delta)
    .lte("latitude", latitude + delta)
    .gte("longitude", longitude - delta)
    .lte("longitude", longitude + delta)
    .limit(limit);
  return (data ?? []) as InvestProject[];
}
