import "server-only";

import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import type { HotspotKind, TourVisibility } from "@/types/database.types";

/**
 * Reading a tour.
 *
 * Visibility is left to the row policies rather than re-implemented here. A
 * `select` that comes back empty is the correct answer for a draft somebody
 * else owns, for an archived tour, and for an id that never existed — and
 * telling those three apart is exactly what a scraper wants. They all become
 * `null`, and the caller renders a 404.
 */

export type TourHotspot = {
  id: string;
  kind: HotspotKind;
  yaw: number;
  pitch: number;
  title: string;
  description: string | null;
  targetSceneId: string | null;
  targetPropertyId: string | null;
  targetProjectId: string | null;
  targetUrl: string | null;
};

export type TourScene = {
  id: string;
  title: string;
  /** A published URL, or — for the owner, while a scene waits on review — a
   * signed link into quarantine that expires within the hour. */
  panoramaUrl: string;
  /** True while the panorama is waiting to be reviewed. Only ever true for
   * the owner: the row policy hides such a scene from everyone else. */
  pending: boolean;
  /** Set while pending, so an edit can save the scene back without having to
   * re-upload the file. */
  quarantinePath: string | null;
  moderationItemId: string | null;
  width: number | null;
  height: number | null;
  initialYaw: number;
  initialPitch: number;
  initialZoom: number;
  position: number;
  hotspots: TourHotspot[];
};

export type Tour = {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  visibility: TourVisibility;
  thumbnailUrl: string | null;
  propertyId: string | null;
  buildingId: string | null;
  projectId: string | null;
  viewCount: number;
  publishedAt: string | null;
  updatedAt: string;
  scenes: TourScene[];
};

/**
 * The foreign key is named because there are two.
 *
 * tour_hotspots points at tour_scenes twice — once for the scene it sits in
 * (scene_id) and once for the scene a door opens (target_scene_id) — and asked
 * to embed one table in the other, PostgREST cannot guess which. It does not
 * guess: it refuses the whole query. Unnamed, this select returned an error
 * for every tour that has ever existed, and the pages built on it answered 404
 * with nothing to say why.
 */
const SHAPE = `
  id, owner_id, title, description, visibility, thumbnail_url,
  property_id, building_id, project_id, view_count, published_at, updated_at,
  tour_scenes (
    id, title, panorama_url, quarantine_path, moderation_item_id, width, height,
    initial_yaw, initial_pitch, initial_zoom, position,
    tour_hotspots!tour_hotspots_scene_id_fkey (
      id, kind, yaw, pitch, title, description,
      target_scene_id, target_property_id, target_project_id, target_url
    )
  )
`;

/**
 * The rows as they come back, before they are renamed.
 *
 * Declared by hand because the generated types carry `Relationships: []` for
 * every table, so no nested select in this codebase can be inferred — see the
 * same `as unknown as` in src/lib/data/agenda.ts. Naming the shape here rather
 * than casting the whole result keeps the flat columns type-checked, so a
 * renamed column is still caught.
 */
type SceneRow = {
  id: string;
  title: string;
  panorama_url: string | null;
  quarantine_path: string | null;
  moderation_item_id: string | null;
  width: number | null;
  height: number | null;
  initial_yaw: number;
  initial_pitch: number;
  initial_zoom: number;
  position: number;
  tour_hotspots: {
    id: string;
    kind: HotspotKind;
    yaw: number;
    pitch: number;
    title: string;
    description: string | null;
    target_scene_id: string | null;
    target_property_id: string | null;
    target_project_id: string | null;
    target_url: string | null;
  }[] | null;
};

export async function getTour(id: string): Promise<Tour | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tours")
    .select(SHAPE)
    .eq("id", id)
    // Ordered here rather than after the fact: the scene order is the tour,
    // and a nested select has no order of its own.
    .order("position", { referencedTable: "tour_scenes", ascending: true })
    .maybeSingle();

  // A tour that is not readable and a query that is broken both arrive here as
  // an empty result, and the caller renders the same 404 for either. Only one
  // of them is anybody's fault, and the difference is in the error object —
  // which this used to discard one line after receiving it.
  if (error) reportFailure("getTour", error, "");
  if (!data) return null;

  const rows = (data.tour_scenes ?? []) as unknown as SceneRow[];

  // A scene still in quarantine has no address anyone can fetch. The policy
  // has already established that only the owner can see the row at all, so a
  // signed link is created for whoever got one back — one round trip per
  // pending scene, and there are rarely any.
  const scenes = await Promise.all(
    rows.map(async (scene) => ({
      scene,
      preview:
        scene.panorama_url === null && scene.quarantine_path
          ? await signedPreview(supabase, scene.quarantine_path)
          : null,
    })),
  );

  return {
    id: data.id,
    ownerId: data.owner_id,
    title: data.title,
    description: data.description,
    visibility: data.visibility,
    thumbnailUrl: data.thumbnail_url,
    propertyId: data.property_id,
    buildingId: data.building_id,
    projectId: data.project_id,
    viewCount: data.view_count,
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
    scenes: scenes
      // A pending scene the owner cannot preview has nothing to render. Better
      // absent than a broken image in the middle of a tour.
      .filter(({ scene, preview }) => scene.panorama_url !== null || preview !== null)
      .map(({ scene, preview }) => ({
      id: scene.id,
      title: scene.title,
      panoramaUrl: scene.panorama_url ?? preview!,
      pending: scene.panorama_url === null,
      quarantinePath: scene.quarantine_path,
      moderationItemId: scene.moderation_item_id,
      width: scene.width,
      height: scene.height,
      initialYaw: scene.initial_yaw,
      initialPitch: scene.initial_pitch,
      initialZoom: scene.initial_zoom,
      position: scene.position,
      hotspots: (scene.tour_hotspots ?? []).map((hotspot) => ({
        id: hotspot.id,
        kind: hotspot.kind,
        yaw: hotspot.yaw,
        pitch: hotspot.pitch,
        title: hotspot.title,
        description: hotspot.description,
        targetSceneId: hotspot.target_scene_id,
        targetPropertyId: hotspot.target_property_id,
        targetProjectId: hotspot.target_project_id,
        targetUrl: hotspot.target_url,
      })),
    })),
  };
}

/** A one-hour link into the private quarantine bucket. Returns null rather
 * than throwing: a scene that cannot be previewed is dropped, not fatal. */
async function signedPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("moderation-quarantine")
    .createSignedUrl(path, 60 * 60);

  // A storage error is not a PostgrestError, so it does not go through
  // reportFailure. It still has to be said out loud: a room the owner cannot
  // preview is dropped from the tour, and silently is the wrong way to do that.
  if (error) console.error("[tour] could not sign a pending panorama:", error.message);

  return data?.signedUrl ?? null;
}

export type TourSummary = {
  id: string;
  title: string;
  visibility: TourVisibility;
  thumbnailUrl: string | null;
  sceneCount: number;
  viewCount: number;
  updatedAt: string;
};

/** The signed-in person's own tours, drafts included. */
export async function listMyTours(): Promise<TourSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("tours")
    .select("id, title, visibility, thumbnail_url, view_count, updated_at, tour_scenes(id)")
    .eq("owner_id", user.id)
    .neq("visibility", "archived")
    .order("updated_at", { ascending: false });

  if (error) reportFailure("listMyTours", error, "");

  return (data ?? []).map((tour) => ({
    id: tour.id,
    title: tour.title,
    visibility: tour.visibility,
    thumbnailUrl: tour.thumbnail_url,
    sceneCount: tour.tour_scenes?.length ?? 0,
    viewCount: tour.view_count,
    updatedAt: tour.updated_at,
  }));
}

/**
 * Published tours attached to one property, building or project.
 *
 * `ownerId` is not optional decoration on the property case. tours.property_id
 * carries no ownership check — anyone may build a tour and point it at any
 * listing — so without it a stranger's tour would be offered on somebody
 * else's property page as though the seller had made it. The database applies
 * the same rule to the has_360 flag; see migration 0059.
 */
export async function listToursFor(
  target: {
    propertyId?: string;
    buildingId?: string;
    projectId?: string;
    ownerId?: string;
  },
): Promise<TourSummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from("tours")
    .select("id, title, visibility, thumbnail_url, view_count, updated_at, tour_scenes(id)")
    .eq("visibility", "published");

  if (target.propertyId) query = query.eq("property_id", target.propertyId);
  else if (target.buildingId) query = query.eq("building_id", target.buildingId);
  else if (target.projectId) query = query.eq("project_id", target.projectId);
  else return [];

  if (target.ownerId) query = query.eq("owner_id", target.ownerId);

  const { data, error } = await query.order("published_at", { ascending: false });

  if (error) reportFailure("listToursFor", error, "");

  return (data ?? []).map((tour) => ({
    id: tour.id,
    title: tour.title,
    visibility: tour.visibility,
    thumbnailUrl: tour.thumbnail_url,
    sceneCount: tour.tour_scenes?.length ?? 0,
    viewCount: tour.view_count,
    updatedAt: tour.updated_at,
  }));
}
