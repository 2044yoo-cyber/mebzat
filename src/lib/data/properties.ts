import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  City,
  ListingKind,
  MapProperty,
  NearbyPlace,
  Property,
  PropertyLocation,
  PropertyMedia,
  PropertyType,
} from "@/types/database.types";

/** Reads for the property module. */

export const PAGE_SIZE = 24;

export type PropertyRow = Property & {
  owner: {
    id: string;
    username: string | null;
    full_name: string | null;
    company_name: string | null;
    avatar_url: string | null;
    phone: string | null;
    verification_status: string | null;
  } | null;
  company: { id: string; name: string; slug: string; logo_url: string | null } | null;
  city: {
    id: string;
    slug: string;
    name: string;
    latitude: number;
    longitude: number;
  } | null;
};

export type Viewport = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type PropertyFilters = {
  types?: PropertyType[];
  kinds?: ListingKind[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minArea?: number;
  /** Total storeys, exactly. G+N is floors = N + 1. */
  floors?: number;
};

const COLUMNS = `
  *,
  owner:profiles!owner_id(id, username, full_name, company_name, avatar_url, phone, verification_status),
  company:companies(id, name, slug, logo_url),
  city:cities(id, slug, name, latitude, longitude)
`;

/**
 * Addis Ababa, hard-coded.
 *
 * The map's whole purpose is to render, so a missing `cities` row must not be
 * a dead end — a 404 on the homepage's primary call to action is worse than a
 * map with no pins on it. Used only when the table is unavailable.
 */
export const FALLBACK_CITY: City = {
  id: "00000000-0000-0000-0000-000000000000",
  slug: "addis-ababa",
  name: "Addis Ababa",
  country: "Ethiopia",
  latitude: 9.0192,
  longitude: 38.7525,
  default_zoom: 12.5,
  min_latitude: 8.84,
  max_latitude: 9.15,
  min_longitude: 38.61,
  max_longitude: 38.92,
  active: true,
  position: 1,
  created_at: new Date(0).toISOString(),
};

export async function getCities(): Promise<City[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cities")
    .select("*")
    .order("position", { ascending: true });

  const cities = (data ?? []) as City[];
  return cities.length > 0 ? cities : [FALLBACK_CITY];
}

export async function getCity(slug: string): Promise<City | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cities")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (data) return data;
  // Only the default city falls back; an unknown slug is still a 404.
  return slug === FALLBACK_CITY.slug ? FALLBACK_CITY : null;
}

/**
 * Pins inside a viewport.
 *
 * Goes through the RPC rather than a PostgREST query so the bounding box is
 * the first predicate the planner sees — the map refetches on every pan, and
 * that is the difference between an index scan and a table scan.
 */
export async function getPropertiesInViewport(
  viewport: Viewport,
  filters: PropertyFilters = {},
  limit = 300,
): Promise<{ properties: MapProperty[]; available: boolean }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("properties_in_viewport", {
    south: viewport.south,
    west: viewport.west,
    north: viewport.north,
    east: viewport.east,
    types: filters.types ?? null,
    kinds: filters.kinds ?? null,
    min_price: filters.minPrice ?? null,
    max_price: filters.maxPrice ?? null,
    min_bedrooms: filters.minBedrooms ?? null,
    min_area: filters.minArea ?? null,
    max_results: limit,
  });

  if (error) return { properties: [], available: false };

  let rows = (data ?? []) as MapProperty[];

  // properties_in_viewport has no storey argument, but it returns `floors`, so
  // the filter is applied here rather than by changing a database function. It
  // runs after max_results, so a storey filter narrows the page the viewport
  // returned rather than reaching further into the city — acceptable while the
  // cap is 300 and a viewport rarely holds that many.
  if (filters.floors !== undefined) {
    rows = rows.filter((property) => property.floors === filters.floors);
  }

  return { properties: rows, available: true };
}

export type PropertyListResult = {
  properties: PropertyRow[];
  total: number;
  available: boolean;
};

/** The list view behind the map, and the /property browse page. */
export async function getProperties(options: {
  q?: string;
  citySlug?: string;
  filters?: PropertyFilters;
  sort?: "newest" | "cheapest" | "priciest" | "largest";
  page?: number;
  pageSize?: number;
} = {}): Promise<PropertyListResult> {
  const {
    q,
    citySlug,
    filters = {},
    sort = "newest",
    page = 1,
    pageSize = PAGE_SIZE,
  } = options;

  const supabase = await createClient();

  let builder = supabase
    .from("properties")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "available");

  const term = q?.replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim();
  if (term) {
    builder = builder.or(
      `title.ilike.%${term}%,neighbourhood.ilike.%${term}%,address.ilike.%${term}%,description.ilike.%${term}%`,
    );
  }
  if (citySlug) {
    const city = await getCity(citySlug);
    // An unknown city should show nothing, not everything.
    if (!city) return { properties: [], total: 0, available: true };
    builder = builder.eq("city_id", city.id);
  }
  if (filters.types?.length) builder = builder.in("property_type", filters.types);
  if (filters.kinds?.length) builder = builder.in("listing_kind", filters.kinds);
  if (filters.minPrice !== undefined) builder = builder.gte("price", filters.minPrice);
  if (filters.maxPrice !== undefined) builder = builder.lte("price", filters.maxPrice);
  if (filters.minBedrooms !== undefined) {
    builder = builder.gte("bedrooms", filters.minBedrooms);
  }
  if (filters.minArea !== undefined) builder = builder.gte("area_m2", filters.minArea);
  if (filters.floors !== undefined) builder = builder.eq("floors", filters.floors);

  const order = {
    newest: { column: "created_at", ascending: false },
    cheapest: { column: "price", ascending: true },
    priciest: { column: "price", ascending: false },
    largest: { column: "area_m2", ascending: false },
  }[sort];

  const from = (page - 1) * pageSize;
  const { data, count, error } = await builder
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .range(from, from + pageSize - 1);

  if (error) return { properties: [], total: 0, available: false };

  return {
    properties: (data ?? []) as unknown as PropertyRow[],
    total: count ?? 0,
    available: true,
  };
}

/**
 * A listing, with its exact position removed unless the reader may have it.
 *
 * Row-level security cannot hide a *column*, so `select *` on a property
 * returns the real coordinates to anyone entitled to see the listing at all —
 * which is everyone. Redacting here, in the one function every reader goes
 * through, is what makes the privacy setting true rather than decorative: by
 * the time a row reaches a page it no longer carries the address, so no
 * component can leak it by accident and no serialised prop can be read out of
 * the page source.
 */
export async function getProperty(id: string): Promise<PropertyRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as PropertyRow;

  const { data: allowed } = await supabase.rpc("can_see_exact_location", {
    target_property_id: id,
  });

  if (allowed === true) return row;

  return {
    ...row,
    // The published point stands in for the real one. Callers reading
    // `latitude` get something safe to draw and safe to send to a browser.
    latitude: row.display_latitude ?? row.latitude,
    longitude: row.display_longitude ?? row.longitude,
  };
}

/** The location of a property, told to whoever is asking. */
export async function getPropertyLocation(
  id: string,
): Promise<PropertyLocation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_location", {
    target_property_id: id,
  });
  if (error || !data?.[0]) return null;
  return data[0] as PropertyLocation;
}

/** Drive times to the landmarks a buyer actually asks about. */
export async function getTravelTimes(
  id: string,
): Promise<{ name: string; distance_m: number; minutes: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_travel_times", {
    target_property_id: id,
  });
  if (error || !data) return [];
  return data;
}

/** Medosha companies near a property, so the buyer can hire them here. */
export async function getNearbyServices(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("services_near_property", {
    target_property_id: id,
  });
  if (error || !data) return [];
  return data;
}

/** What is near a property, measured from its published point. */
export async function getPublicNearbyPlaces(
  id: string,
  radiusKm = 2,
): Promise<
  { id: string; name: string; kind: string; distance_m: number; rating: number | null }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_places_near_property", {
    target_property_id: id,
    radius_km: radiusKm,
  });
  if (error || !data) return [];
  return data;
}

export async function getPropertyMedia(
  propertyId: string,
): Promise<PropertyMedia[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_media")
    .select("*")
    .eq("property_id", propertyId)
    .order("position", { ascending: true });
  return (data ?? []) as PropertyMedia[];
}

export async function getNearbyPlaces(
  propertyId: string,
  radiusKm = 2,
): Promise<NearbyPlace[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("places_near_property", {
    target_property_id: propertyId,
    radius_km: radiusKm,
    max_results: 40,
  });
  return (data ?? []) as NearbyPlace[];
}

export type PriceStats = {
  average: number | null;
  median: number | null;
  lowest: number | null;
  highest: number | null;
  averagePerM2: number | null;
  sampleSize: number;
};

/** Comparable asking prices, for the "is this fair" panel. */
export async function getPriceStats(
  type: PropertyType,
  kind: ListingKind,
  city: string | null,
): Promise<PriceStats> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("property_price_stats", {
    target_type: type,
    target_kind: kind,
    target_city: city,
  });

  const row = Array.isArray(data) ? data[0] : null;
  return {
    average: row?.average_price ?? null,
    median: row?.median_price ?? null,
    lowest: row?.lowest_price ?? null,
    highest: row?.highest_price ?? null,
    averagePerM2: row?.average_per_m2 ?? null,
    sampleSize: Number(row?.sample_size ?? 0),
  };
}

export async function isPropertySaved(
  propertyId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_saves")
    .select("property_id")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}

/** A handful of listings for the homepage band. */
export async function getFeaturedProperties(limit = 6): Promise<PropertyRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select(COLUMNS)
    .eq("status", "available")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as PropertyRow[];
}
