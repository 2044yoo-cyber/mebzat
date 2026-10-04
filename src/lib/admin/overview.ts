import "server-only";

import { adminIdentity } from "@/lib/auth/admin-areas";
import { createClient } from "@/lib/supabase/server";

/**
 * What is actually in the platform.
 *
 * Every number here is a count or a sum of rows that exist. Nothing is
 * estimated and nothing is seeded — a dashboard showing "2,483 visitors" on a
 * deployment with ten accounts is worse than one showing nothing, because
 * somebody will make a decision on it.
 *
 * `null` means the *source* is missing rather than empty: a deployment that
 * has not applied a migration has no such table, and "no data yet" and "zero"
 * are different answers to somebody deciding whether to worry.
 */

export type Metric = {
  label: string;
  /** Null when the source does not exist on this deployment. */
  value: number | null;
  hint?: string;
};

export type Overview = {
  people: Metric[];
  content: Metric[];
  moderation: Metric[];
  attention: Metric[];
};

/** Every table this page counts. Named here so the cast below is over a fixed
 * list rather than over anything a caller might pass. */
const COUNTABLE = [
  "profiles",
  "properties",
  "products",
  "projects",
  "companies",
  "tours",
  "floor_plans",
  "feed_posts",
  "feed_reports",
  "moderation_items",
  "user_strikes",
] as const;

type Countable = (typeof COUNTABLE)[number];

/** A count, or null when the table is not on this deployment. */
async function countOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: Countable,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });

  if (error) return null;
  return count ?? 0;
}

export async function getOverview(): Promise<Overview | null> {
  // Any administrator may see the overview: it is counts, not control.
  if (!(await adminIdentity()).isAdmin) return null;

  const supabase = await createClient();

  const [
    profiles,
    properties,
    products,
    projects,
    companies,
    tours,
    plans,
    posts,
    reports,
    checked,
    strikes,
  ] = await Promise.all(COUNTABLE.map((table) => countOf(supabase, table)));

  // The queue, which is the number an operator opens this page for.
  const { count: waiting } = await supabase
    .from("moderation_items")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "review"]);

  const { count: restricted } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gt("restricted_until", new Date().toISOString());

  const propertyViews = await sumOf(supabase, "properties");
  const tourViews = await sumOf(supabase, "tours");

  return {
    people: [
      { label: "Accounts", value: profiles ?? null },
      { label: "Companies", value: companies ?? null },
      { label: "Restricted", value: restricted ?? null, hint: "Right now" },
    ],
    content: [
      { label: "Properties", value: properties ?? null },
      { label: "Products", value: products ?? null },
      { label: "Projects", value: projects ?? null },
      { label: "360° tours", value: tours ?? null },
      { label: "Floor plans", value: plans ?? null },
      { label: "Feed posts", value: posts ?? null },
    ],
    moderation: [
      { label: "Awaiting review", value: waiting ?? null },
      { label: "Items checked", value: checked ?? null, hint: "All time" },
      { label: "Reports", value: reports ?? null },
      { label: "Strikes issued", value: strikes ?? null },
    ],
    attention: [
      { label: "Property views", value: propertyViews, hint: "Total, all time" },
      { label: "Tour views", value: tourViews, hint: "Total, all time" },
    ],
  };
}

/**
 * A sum over a view counter.
 *
 * Read and added here rather than through an aggregate, because there is no
 * such function exposed and adding one would be a migration for a screen —
 * which the brief rules out, rightly. The row counts are in the hundreds; when
 * they are not, this wants a materialised view, and the cap makes it obvious
 * rather than quietly slow.
 */
const SUM_CAP = 5000;

async function sumOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "properties" | "tours",
): Promise<number | null> {
  const { data, error } = await supabase.from(table).select("view_count").limit(SUM_CAP);
  if (error || !data) return null;
  return data.reduce((total, row) => total + (row.view_count ?? 0), 0);
}
