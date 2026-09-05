import "server-only";

import { isAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import type { PropertyStatus } from "@/types/database.types";

/**
 * Listings, as an operator sees them.
 *
 * The same `properties` rows the map and the listing pages read. Withdrawing
 * one here is the same record the seller sees withdrawn on their own page.
 */

export type AdminProperty = {
  id: string;
  title: string;
  status: PropertyStatus;
  price: number | null;
  currency: string;
  neighbourhood: string | null;
  coverImageUrl: string | null;
  viewCount: number;
  createdAt: string | null;
  ownerName: string | null;
};

export async function listPropertiesForAdmin(
  status?: PropertyStatus,
): Promise<AdminProperty[] | null> {
  if (!(await isAdmin())) return null;

  const supabase = await createClient();

  let query = supabase
    .from("properties")
    .select("id, title, status, price, currency, neighbourhood, cover_image_url, view_count, created_at, owner:profiles!owner_id(full_name, username)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data } = await query;

  type Row = {
    id: string;
    title: string;
    status: PropertyStatus;
    price: number | null;
    currency: string;
    neighbourhood: string | null;
    cover_image_url: string | null;
    view_count: number;
    created_at: string | null;
    owner: { full_name: string | null; username: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    price: row.price,
    currency: row.currency,
    neighbourhood: row.neighbourhood,
    coverImageUrl: row.cover_image_url,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    ownerName: row.owner?.full_name ?? row.owner?.username ?? null,
  }));
}
