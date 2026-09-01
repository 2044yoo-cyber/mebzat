import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Equipment } from "@/types/database.types";

/** Reads for Equipment Rental. */

export const PAGE_SIZE = 24;

export type EquipmentOwner = {
  id: string;
  username: string | null;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
};

export type EquipmentRow = Equipment & {
  owner: EquipmentOwner | null;
  company: { id: string; name: string; slug: string } | null;
};

export type EquipmentResult = {
  items: EquipmentRow[];
  total: number;
  available: boolean;
};

export type EquipmentSort = "cheapest" | "priciest" | "rating" | "newest";

const COLUMNS = `
  *,
  owner:profiles!owner_id(id, username, full_name, company_name, avatar_url),
  company:companies(id, name, slug)
`;

const SORTS: Record<EquipmentSort, { column: string; ascending: boolean }> = {
  cheapest: { column: "daily_rate", ascending: true },
  priciest: { column: "daily_rate", ascending: false },
  rating: { column: "rating", ascending: false },
  newest: { column: "created_at", ascending: false },
};

function sanitize(term: string): string {
  return term.replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim();
}

export async function getEquipment(options: {
  q?: string;
  category?: string;
  city?: string;
  availableOnly?: boolean;
  withOperator?: boolean;
  sort?: EquipmentSort;
  page?: number;
  pageSize?: number;
} = {}): Promise<EquipmentResult> {
  const {
    q,
    category,
    city,
    availableOnly = false,
    withOperator = false,
    sort = "cheapest",
    page = 1,
    pageSize = PAGE_SIZE,
  } = options;

  const supabase = await createClient();

  let builder = supabase
    .from("equipment")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "published");

  const term = q ? sanitize(q) : "";
  if (term) {
    builder = builder.or(
      `title.ilike.%${term}%,category.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%`,
    );
  }
  if (category) builder = builder.eq("category", category);
  if (city) builder = builder.eq("location_city", city);
  if (availableOnly) builder = builder.eq("available", true);
  if (withOperator) builder = builder.eq("operator_included", true);

  const order = SORTS[sort];
  const from = (page - 1) * pageSize;

  const { data, count, error } = await builder
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .range(from, from + pageSize - 1);

  if (error) return { items: [], total: 0, available: false };

  return {
    items: (data ?? []) as unknown as EquipmentRow[],
    total: count ?? 0,
    available: true,
  };
}

export async function getEquipmentItem(
  id: string,
): Promise<(EquipmentRow & { images: { id: string; url: string; alt: string | null }[] }) | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment")
    .select(`${COLUMNS}, images:equipment_images(id, url, alt)`)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as EquipmentRow & {
    images: { id: string; url: string; alt: string | null }[];
  };
}

/** Distinct categories and cities present, for the filter menus. */
export async function getEquipmentFacets(): Promise<{
  categories: string[];
  cities: string[];
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment")
    .select("category, location_city")
    .eq("status", "published")
    .limit(1000);

  const categories = new Set<string>();
  const cities = new Set<string>();
  for (const row of data ?? []) {
    if (row.category) categories.add(row.category);
    if (row.location_city) cities.add(row.location_city);
  }

  return {
    categories: [...categories].sort(),
    cities: [...cities].sort(),
  };
}

/** Dates already taken, so the booking form can refuse them up front. */
export async function getBookedRanges(
  equipmentId: string,
): Promise<{ starts_on: string; ends_on: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment_bookings")
    .select("starts_on, ends_on")
    .eq("equipment_id", equipmentId)
    .in("status", ["confirmed", "active"])
    .gte("ends_on", new Date().toISOString().slice(0, 10))
    .order("starts_on", { ascending: true })
    .limit(100);

  return data ?? [];
}
