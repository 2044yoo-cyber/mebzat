import "server-only";

import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Floor plans, read.
 *
 * A plan is a document about a place, so it hangs off the place — a flat, the
 * building around it, one floor of that building, a project — and optionally
 * off the tour it sits beside. All of those are independent, which is why this
 * takes a target rather than one id.
 *
 * Visibility follows the same rule as a tour scene: a cleared plan is public,
 * like a listing's photographs, and one still in review is the owner's alone,
 * reached through a signed URL that expires. Nothing unreviewed is served to a
 * visitor.
 */

export type FloorPlan = {
  id: string;
  title: string;
  /** A published URL, or a signed link into quarantine for its owner. */
  url: string;
  mediaType: "image" | "pdf";
  width: number | null;
  height: number | null;
  floorNumber: number | null;
  tourId: string | null;
  /** True while it is waiting to be reviewed. Only ever true for the owner. */
  pending: boolean;
  quarantinePath: string | null;
  moderationItemId: string | null;
  position: number;
};

type PlanRow = {
  id: string;
  title: string;
  file_url: string | null;
  quarantine_path: string | null;
  moderation_item_id: string | null;
  media_type: string;
  width: number | null;
  height: number | null;
  floor_number: number | null;
  tour_id: string | null;
  position: number;
};

const COLUMNS =
  "id, title, file_url, quarantine_path, moderation_item_id, media_type, " +
  "width, height, floor_number, tour_id, position";

export type PlanTarget = {
  tourId?: string;
  propertyId?: string;
  buildingId?: string;
  projectId?: string;
};

export async function listFloorPlans(target: PlanTarget): Promise<FloorPlan[]> {
  const supabase = await createClient();

  let query = supabase.from("floor_plans").select(COLUMNS);

  if (target.tourId) query = query.eq("tour_id", target.tourId);
  else if (target.propertyId) query = query.eq("property_id", target.propertyId);
  else if (target.buildingId) query = query.eq("building_id", target.buildingId);
  else if (target.projectId) query = query.eq("project_id", target.projectId);
  else return [];

  const { data, error } = await query.order("position", { ascending: true });

  if (error) reportFailure("listFloorPlans", error, "");
  if (!data) return [];

  const rows = data as unknown as PlanRow[];

  // One signed link per pending plan, and there are rarely any. A plan the
  // owner cannot preview is dropped rather than shown as a broken frame.
  const signed = await Promise.all(
    rows.map(async (row) => ({
      row,
      preview:
        row.file_url === null && row.quarantine_path
          ? await signedPreview(supabase, row.quarantine_path)
          : null,
    })),
  );

  return signed
    .filter(({ row, preview }) => row.file_url !== null || preview !== null)
    .map(({ row, preview }) => ({
      id: row.id,
      title: row.title,
      url: row.file_url ?? preview!,
      mediaType: row.media_type === "pdf" ? "pdf" : "image",
      width: row.width,
      height: row.height,
      floorNumber: row.floor_number,
      tourId: row.tour_id,
      pending: row.file_url === null,
      quarantinePath: row.quarantine_path,
      moderationItemId: row.moderation_item_id,
      position: row.position,
    }));
}

async function signedPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("moderation-quarantine")
    .createSignedUrl(path, 60 * 60);

  if (error) console.error("[floor plan] could not sign a pending plan:", error.message);

  return data?.signedUrl ?? null;
}
