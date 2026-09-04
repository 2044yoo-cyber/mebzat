import "server-only";

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
  panoramaUrl: string;
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

const SHAPE = `
  id, owner_id, title, description, visibility, thumbnail_url,
  property_id, building_id, project_id, view_count, published_at, updated_at,
  tour_scenes (
    id, title, panorama_url, width, height,
    initial_yaw, initial_pitch, initial_zoom, position,
    tour_hotspots (
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
  panorama_url: string;
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

  const { data } = await supabase
    .from("tours")
    .select(SHAPE)
    .eq("id", id)
    // Ordered here rather than after the fact: the scene order is the tour,
    // and a nested select has no order of its own.
    .order("position", { referencedTable: "tour_scenes", ascending: true })
    .maybeSingle();

  if (!data) return null;

  const scenes = (data.tour_scenes ?? []) as unknown as SceneRow[];

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
    scenes: scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      panoramaUrl: scene.panorama_url,
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

  const { data } = await supabase
    .from("tours")
    .select("id, title, visibility, thumbnail_url, view_count, updated_at, tour_scenes(id)")
    .eq("owner_id", user.id)
    .neq("visibility", "archived")
    .order("updated_at", { ascending: false });

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

  const { data } = await query.order("published_at", { ascending: false });

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
