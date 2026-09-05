import "server-only";

import { canAdmin } from "@/lib/auth/admin-areas";
import { createClient } from "@/lib/supabase/server";
import type { TourVisibility } from "@/types/database.types";

/**
 * 360° tours, as an operator sees them.
 *
 * The count that matters here is not how many scenes a tour has but how many
 * are still waiting on review: a scene with a quarantine path and no public
 * URL is one nobody but the owner can see, and a tour that is all quarantine
 * is a tour a visitor opens to find empty. That is the number an operator
 * needs, so it is the number shown.
 *
 * `tours.visibility` is the same column the public queries read. Archiving one
 * here is the state the owner reaches by archiving it themselves.
 *
 * `tours.owner_id` references auth.users rather than profiles, so there is no
 * foreign key for PostgREST to embed across and asking for one would refuse
 * the whole query. The names come from a second lookup keyed by the ids.
 */

export type AdminTour = {
  id: string;
  title: string;
  visibility: TourVisibility;
  thumbnailUrl: string | null;
  viewCount: number;
  sceneCount: number;
  awaitingReview: number;
  createdAt: string | null;
  ownerName: string | null;
};

export async function listToursForAdmin(
  visibility?: TourVisibility,
): Promise<AdminTour[] | null> {
  if (!(await canAdmin("tours"))) return null;

  const supabase = await createClient();

  let query = supabase
    .from("tours")
    .select(
      "id, title, owner_id, visibility, thumbnail_url, view_count, created_at, scenes:tour_scenes(id, panorama_url)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (visibility) query = query.eq("visibility", visibility);

  const { data } = await query;

  type Row = {
    id: string;
    title: string;
    owner_id: string;
    visibility: TourVisibility;
    thumbnail_url: string | null;
    view_count: number | null;
    created_at: string | null;
    scenes: { id: string; panorama_url: string | null }[] | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  const { data: owners } = rows.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", [...new Set(rows.map((row) => row.owner_id))])
    : { data: [] };

  const byId = new Map((owners ?? []).map((one) => [one.id, one]));

  return rows.map((row) => {
    const scenes = row.scenes ?? [];
    const owner = byId.get(row.owner_id);
    return {
      id: row.id,
      title: row.title,
      visibility: row.visibility,
      thumbnailUrl: row.thumbnail_url,
      viewCount: row.view_count ?? 0,
      sceneCount: scenes.length,
      awaitingReview: scenes.filter((scene) => scene.panorama_url === null).length,
      createdAt: row.created_at,
      ownerName: owner?.full_name ?? owner?.username ?? null,
    };
  });
}
