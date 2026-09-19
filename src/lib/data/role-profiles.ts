import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AgentProfile, SellerProfile } from "@/types/database.types";

/**
 * The agent's and the seller's own records.
 *
 * Kept apart from `profiles` on purpose. An account is one thing — who is
 * logged in, what they are called, how to reach them — and what they do here
 * is another. An estate agent's agency and licence number mean nothing to a
 * hardware shop, and neither belongs in a table every screen in the platform
 * selects from.
 *
 * Both reads return null rather than an empty object when there is no row.
 * A profile that has never been opened and one that was opened and left blank
 * are different states, and the screens say different things about them.
 */

export type ServiceArea = { slug: string; name: string };

export async function agentProfileFor(
  profileId: string,
): Promise<AgentProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_profiles")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data ?? null;
}

export async function sellerProfileFor(
  profileId: string,
): Promise<SellerProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("seller_profiles")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data ?? null;
}

async function areasFrom(
  table: "agent_service_areas" | "seller_service_areas",
  profileId: string,
): Promise<ServiceArea[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from(table)
    .select("area_slug, area_name")
    .eq("profile_id", profileId)
    .order("area_name");

  return (data ?? []).map((row) => ({
    slug: row.area_slug as string,
    name: row.area_name as string,
  }));
}

export function agentAreasFor(profileId: string): Promise<ServiceArea[]> {
  return areasFrom("agent_service_areas", profileId);
}

export function sellerAreasFor(profileId: string): Promise<ServiceArea[]> {
  return areasFrom("seller_service_areas", profileId);
}

/**
 * Replace the areas somebody covers.
 *
 * Rows, not a column, so the form posts the whole set every time and a
 * deselected area has to actually go — the same rule the professional's areas
 * follow. One function rather than a copy in each action: two copies is how a
 * guard ends up on one and not the other.
 *
 * Names come from the gazetteer rather than from the browser. A posted slug
 * that matches no real area writes nothing, so nobody can invent an area that
 * exists only on their own profile and appears in no search.
 */
export async function replaceServiceAreas(
  table: "agent_service_areas" | "seller_service_areas",
  profileId: string,
  slugs: string[],
): Promise<void> {
  const supabase = await createClient();

  await supabase.from(table).delete().eq("profile_id", profileId);

  if (slugs.length === 0) return;

  const { data: known } = await supabase
    .from("location_areas")
    .select("slug, name, city, country")
    .in("slug", slugs);

  const rows = (known ?? []).map((area) => ({
    profile_id: profileId,
    area_slug: area.slug,
    area_name: area.name,
    city: area.city,
    country: area.country,
  }));

  if (rows.length > 0) await supabase.from(table).insert(rows);
}

/** The slugs a form posted, trimmed, de-duplicated and capped. */
export function postedAreaSlugs(value: FormDataEntryValue | null): string[] {
  return [
    ...new Set(
      String(value ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 40);
}
