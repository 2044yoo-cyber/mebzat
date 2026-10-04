import "server-only";

import {
  CATALOGUE_AREA,
  type CatalogueItem,
  type CatalogueKind,
} from "@/lib/admin/catalogue-shape";
import { canAdmin } from "@/lib/auth/admin-areas";
import { createClient } from "@/lib/supabase/server";

/**
 * Products and design projects, as an operator sees them.
 *
 * Both tables carry the same `status` the public queries already read —
 * `published` is on the site, `draft` is not — so there is no admin-only
 * hidden flag here and no second vocabulary. An operator taking a product down
 * puts it in exactly the state its owner would have left it in before
 * publishing, and the owner can see and fix it.
 *
 * One function for the two of them because the shapes an operator needs are
 * the same shape: a picture, a title, who posted it, whether it is public. The
 * columns that differ — brand, building type — are not what anybody is looking
 * at when they decide to take something down.
 */

export async function listCatalogue(
  kind: CatalogueKind,
  published?: boolean,
): Promise<CatalogueItem[] | null> {
  if (!(await canAdmin(CATALOGUE_AREA[kind]))) return null;

  const supabase = await createClient();

  const columns =
    kind === "products"
      ? "id, slug, title, status, cover_image_url, views, created_at, brand, location_city, owner:profiles!owner_id(full_name, username)"
      : "id, slug, title, status, cover_image_url, views, created_at, style, location_city, owner:profiles!owner_id(full_name, username)";

  let query = supabase
    .from(kind)
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(100);

  if (published !== undefined) {
    query = query.eq("status", published ? "published" : "draft");
  }

  const { data } = await query;

  type Row = {
    id: string;
    slug: string;
    title: string;
    status: string;
    cover_image_url: string | null;
    views: number | null;
    created_at: string | null;
    brand?: string | null;
    style?: string | null;
    location_city: string | null;
    owner: { full_name: string | null; username: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    published: row.status === "published",
    coverImageUrl: row.cover_image_url,
    views: row.views ?? 0,
    createdAt: row.created_at,
    ownerName: row.owner?.full_name ?? row.owner?.username ?? null,
    detail:
      [kind === "products" ? row.brand : row.style, row.location_city]
        .filter(Boolean)
        .join(" · ") || null,
  }));
}
