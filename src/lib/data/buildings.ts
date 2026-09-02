import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Building, PropertyType } from "@/types/database.types";

/**
 * Buildings, and the units inside them.
 *
 * Kept beside `properties` rather than inside it: a building is not a listing,
 * and the functions that read one have nothing in common with the functions
 * that search the other.
 *
 * Every read here is resilient to the table not existing. 0053 is additive and
 * a deployment that has not applied it yet should render standalone listings
 * exactly as before rather than showing an error — the same convention
 * getCompanies uses for its own migration.
 */

export type BuildingSummary = {
  totalUnits: number;
  availableUnits: number;
  minPrice: number | null;
  maxPrice: number | null;
  floorsWithUnits: number;
};

export type BuildingWithSummary = Building & { summary: BuildingSummary };

/** One unit, as a building page needs it — not the full property row. */
export type BuildingUnit = {
  id: string;
  unit_code: string | null;
  unit_number: string | null;
  floor_number: number | null;
  property_type: PropertyType;
  listing_kind: string;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  price: number | null;
  currency: string;
  price_period: string | null;
  status: string;
  cover_image_url: string | null;
  title: string;
};

const EMPTY_SUMMARY: BuildingSummary = {
  totalUnits: 0,
  availableUnits: 0,
  minPrice: null,
  maxPrice: null,
  floorsWithUnits: 0,
};

export async function getBuilding(id: string): Promise<Building | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("buildings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** By its public code — MED-ADD-BLD-0001 — which is what people quote. */
export async function getBuildingByCode(code: string): Promise<Building | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("buildings")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return data ?? null;
}

export async function getBuildingSummary(id: string): Promise<BuildingSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("building_summary", { target: id });

  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return EMPTY_SUMMARY;

  return {
    totalUnits: row.total_units ?? 0,
    availableUnits: row.available_units ?? 0,
    minPrice: row.min_price,
    maxPrice: row.max_price,
    floorsWithUnits: row.floors_with_units ?? 0,
  };
}

/**
 * Units grouped by floor, highest first.
 *
 * Highest first because that is how people talk about a building they are
 * choosing in — the top floor is the one worth naming — and because a
 * ten-storey list that starts at the ground reads as a list of ground-floor
 * flats until you scroll.
 */
export async function getBuildingUnits(
  buildingId: string,
): Promise<{ floor: number | null; units: BuildingUnit[] }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select(
      "id, unit_code, unit_number, floor_number, property_type, listing_kind, bedrooms, bathrooms, area_m2, price, currency, price_period, status, cover_image_url, title",
    )
    .eq("building_id", buildingId)
    .neq("status", "draft")
    .order("floor_number", { ascending: false })
    .order("unit_number", { ascending: true });

  if (error || !data) return [];

  const byFloor = new Map<number | null, BuildingUnit[]>();
  for (const unit of data as BuildingUnit[]) {
    const key = unit.floor_number;
    const bucket = byFloor.get(key);
    if (bucket) bucket.push(unit);
    else byFloor.set(key, [unit]);
  }

  return [...byFloor.entries()].map(([floor, units]) => ({ floor, units }));
}

/** The directory. Resilient to 0053 not being applied. */
export async function getBuildings(options: {
  q?: string;
  cityId?: string;
  limit?: number;
} = {}): Promise<{ buildings: Building[]; available: boolean }> {
  const supabase = await createClient();

  let query = supabase
    .from("buildings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 60);

  const term = options.q?.replace(/[,()%*]/g, " ").trim();
  if (term) {
    // Name or code: somebody either remembers what it is called or has the
    // reference in front of them, and they should not have to say which.
    query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
  }
  if (options.cityId) query = query.eq("city_id", options.cityId);

  const { data, error } = await query;
  if (error) return { buildings: [], available: false };
  return { buildings: data ?? [], available: true };
}
