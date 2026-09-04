"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { resolveSceneTargets } from "@/lib/tour/draft";
import { fromOurStorage, ownsQuarantinePath, validateTour } from "@/lib/tour/validate";
import type { HotspotKind, TourVisibility } from "@/types/database.types";

/**
 * Saving a 360° tour.
 *
 * A tour is one row plus its scenes plus their hotspots, and the three are
 * only meaningful together: a tour with no scenes is a title, and a hotspot
 * whose scene was not written points nowhere. So a save replaces the whole
 * set in one call rather than letting a browser write them one at a time and
 * leave a half-tour behind when it closes the tab.
 *
 * Ownership is never taken from the client. Every path here reads the tour's
 * owner_id from the database and compares it to auth.getUser() — the row
 * policies say the same thing, but a check that only lives in the policy is
 * one `service_role` mistake away from not existing.
 */

export type TourResult = { error?: string; id?: string };

export type SceneInput = {
  /** Present when the scene already exists; absent when it is new. */
  id?: string;
  /** Stable across a save so hotspots can name a target scene that is also
   * being created in the same call. */
  key: string;
  title: string;
  panoramaUrl: string;
  /** Waiting on review — the image is still in quarantine. */
  pending?: boolean;
  quarantinePath?: string;
  moderationItemId?: string;
  width?: number | null;
  height?: number | null;
  initialYaw?: number;
  initialPitch?: number;
  initialZoom?: number;
  hotspots?: HotspotInput[];
};

export type HotspotInput = {
  kind: HotspotKind;
  yaw: number;
  pitch: number;
  title: string;
  description?: string | null;
  /** The `key` of another scene in the same save, not its uuid — a link may
   * point at a scene that does not exist yet. */
  targetSceneKey?: string | null;
  targetPropertyId?: string | null;
  targetProjectId?: string | null;
  targetUrl?: string | null;
};

export type TourInput = {
  title: string;
  description?: string | null;
  propertyId?: string | null;
  buildingId?: string | null;
  projectId?: string | null;
  companyId?: string | null;
  scenes: SceneInput[];
};

async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}

/**
 * Every scene's image is one this application is holding.
 *
 * A cleared scene must point into the `panoramas` bucket; a scene still in
 * review must point at a quarantine path inside the caller's own folder.
 * Neither is taken on trust: the browser sends both, and an unchecked URL
 * would let a tour embed an image from anywhere, while an unchecked path
 * would let a caller adopt a stranger's unreviewed file.
 */
function checkSceneImages(scenes: SceneInput[], userId: string): string | null {
  for (const scene of scenes) {
    if (scene.pending) {
      if (!scene.quarantinePath || !ownsQuarantinePath(scene.quarantinePath, userId)) {
        return "A scene's photo could not be verified.";
      }
      continue;
    }
    if (!fromOurStorage(scene.panoramaUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      return "A scene's photo was not uploaded through Medosha.";
    }
  }
  return null;
}

export async function createTour(input: TourInput): Promise<TourResult> {
  const { supabase, user } = await requireUser("/tours/new");

  const invalid = validateTour(input);
  if (invalid) return { error: invalid };

  const misplaced = checkSceneImages(input.scenes, user.id);
  if (misplaced) return { error: misplaced };

  const { data: tour, error } = await supabase
    .from("tours")
    .insert({
      owner_id: user.id,
      company_id: input.companyId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      property_id: input.propertyId ?? null,
      building_id: input.buildingId ?? null,
      project_id: input.projectId ?? null,
      // The first *cleared* scene is the tour's face. A pending one would put
      // an expiring signed URL on every card that shows this tour.
      thumbnail_url: input.scenes.find((scene) => !scene.pending)?.panoramaUrl ?? null,
      visibility: "draft",
    })
    .select("id")
    .single();

  if (error || !tour) {
    return { error: reportFailure("createTour", error, "Could not save that tour.") };
  }

  const wrote = await writeScenes(supabase, tour.id, input.scenes);
  if (wrote) {
    // A tour with no scenes is not a tour. Rather than leave the empty row
    // behind for somebody to find later, it goes with the failure.
    await supabase.from("tours").delete().eq("id", tour.id);
    return { error: wrote };
  }

  revalidatePath("/tours");
  return { id: tour.id };
}

export async function updateTour(id: string, input: TourInput): Promise<TourResult> {
  const { supabase, user } = await requireUser(`/tours/${id}/edit`);

  const invalid = validateTour(input);
  if (invalid) return { error: invalid };

  const misplaced = checkSceneImages(input.scenes, user.id);
  if (misplaced) return { error: misplaced };

  const owned = await ownedByCaller(supabase, id, user.id);
  if (!owned) return { error: "That tour could not be found." };

  const { error } = await supabase
    .from("tours")
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      property_id: input.propertyId ?? null,
      building_id: input.buildingId ?? null,
      project_id: input.projectId ?? null,
      thumbnail_url: input.scenes.find((scene) => !scene.pending)?.panoramaUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: reportFailure("updateTour", error, "Could not save that tour.") };
  }

  // Replaced wholesale rather than diffed: a diff of a set the user has been
  // reordering and renaming is where the subtle bugs live.
  //
  // The order matters, and it used to be wrong. Deleting first meant a failed
  // write left the tour stripped of every room it had — the save reported an
  // error and the work was already gone. The old rows are identified now,
  // the new ones written, and only then are the old ones removed; if anything
  // fails in between, the tour is put back exactly as it was.
  const { data: previous } = await supabase
    .from("tour_scenes")
    .select("id")
    .eq("tour_id", id);

  const previousIds = (previous ?? []).map((scene) => scene.id);

  const wrote = await writeScenes(supabase, id, input.scenes);
  if (wrote) return { error: wrote };

  if (previousIds.length > 0) {
    const { error: cleared } = await supabase
      .from("tour_scenes")
      .delete()
      .in("id", previousIds);

    if (cleared) {
      // The new rooms are in and the old ones are not gone, so the tour would
      // show every room twice. Undo the half that just succeeded.
      await supabase
        .from("tour_scenes")
        .delete()
        .eq("tour_id", id)
        .not("id", "in", `(${previousIds.join(",")})`);

      return { error: reportFailure("updateTour.clear", cleared, "Could not save that tour.") };
    }
  }

  revalidatePath("/tours");
  revalidatePath(`/tour/${id}`);
  return { id };
}

/**
 * Writes the scenes, then the hotspots that point at them.
 *
 * Two passes, because a hotspot can name a scene that is being created in the
 * same call: the scenes are inserted first so every key has a uuid, and the
 * keys are then resolved against that map.
 *
 * The uuids are paired back to the scenes by `position`, which this function
 * assigns, rather than by the order the rows come back in. RETURNING does
 * preserve insertion order — checked on PostgreSQL 16 — but nothing in
 * PostgREST promises to keep it, and the failure if it ever changed would be
 * silent: every hotspot would attach to the wrong room, and the tour would
 * still load.
 */
async function writeScenes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tourId: string,
  scenes: SceneInput[],
): Promise<string | null> {
  const { data: written, error } = await supabase
    .from("tour_scenes")
    .insert(
      scenes.map((scene, position) => ({
        tour_id: tourId,
        title: scene.title.trim(),
        // A pending scene stores no URL at all. The signed link it was
        // previewed through expires within the hour, so writing it would leave
        // a scene pointing at a dead address once it cleared review.
        panorama_url: scene.pending ? null : scene.panoramaUrl,
        quarantine_path: scene.pending ? (scene.quarantinePath ?? null) : null,
        moderation_item_id: scene.pending ? (scene.moderationItemId ?? null) : null,
        width: scene.width ?? null,
        height: scene.height ?? null,
        initial_yaw: scene.initialYaw ?? 0,
        initial_pitch: scene.initialPitch ?? 0,
        initial_zoom: scene.initialZoom ?? 75,
        position,
      })),
    )
    .select("id, position");

  if (error || !written) {
    return reportFailure("writeScenes", error, "Could not save the scenes.");
  }

  const idAt = new Map<number, string>();
  for (const row of written) idAt.set(row.position, row.id);

  if (idAt.size !== scenes.length) {
    console.error("writeScenes: wrote", idAt.size, "scenes of", scenes.length);
    return "Could not save the scenes.";
  }

  const idForKey = new Map<string, string>();
  scenes.forEach((scene, index) => {
    const id = idAt.get(index);
    if (id) idForKey.set(scene.key, id);
  });

  // Resolved before anything is written. A door that resolves to nothing is
  // refused by the database — hotspot_scene_has_target — and what reaches the
  // person is a 23514 quoting a row of uuids. This names the room instead, and
  // the broken row is never sent.
  const resolved = resolveSceneTargets(
    scenes.map((scene) => ({
      key: scene.key,
      title: scene.title,
      hotspots: (scene.hotspots ?? []).map((hotspot) => ({ ...hotspot, key: "" })),
    })),
    idForKey,
    (index) => idAt.get(index),
  );

  if (!resolved.ok) {
    console.error("writeScenes:", resolved.detail);
    return resolved.reason;
  }

  const hotspots = resolved.hotspots;
  if (hotspots.length === 0) return null;

  const { error: hotspotError } = await supabase.from("tour_hotspots").insert(hotspots);
  if (hotspotError) {
    return reportFailure("writeHotspots", hotspotError, "Could not save the hotspots.");
  }

  return null;
}

async function ownedByCaller(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  userId: string,
) {
  const { data } = await supabase.from("tours").select("owner_id").eq("id", id).maybeSingle();
  return data?.owner_id === userId;
}

/**
 * Publishing, and taking it back down.
 *
 * `published_at` is set the first time and kept afterwards, so unpublishing
 * and republishing does not move a tour back to the top of a feed sorted by
 * that column. The database requires a published tour to have one.
 */
export async function setTourVisibility(
  id: string,
  visibility: TourVisibility,
): Promise<TourResult> {
  const { supabase, user } = await requireUser(`/tours/${id}/edit`);

  const { data: tour } = await supabase
    .from("tours")
    .select("owner_id, published_at")
    .eq("id", id)
    .maybeSingle();

  if (!tour || tour.owner_id !== user.id) {
    return { error: "That tour could not be found." };
  }

  if (visibility === "published") {
    const { count } = await supabase
      .from("tour_scenes")
      .select("id", { count: "exact", head: true })
      .eq("tour_id", id);

    if (!count) return { error: "Add a 360° photo before publishing." };
  }

  const { error } = await supabase
    .from("tours")
    .update({
      visibility,
      published_at:
        visibility === "published"
          ? (tour.published_at ?? new Date().toISOString())
          : tour.published_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: reportFailure("setTourVisibility", error, "Could not change that.") };
  }

  revalidatePath("/tours");
  revalidatePath(`/tour/${id}`);
  return { id };
}

export async function deleteTour(id: string): Promise<TourResult> {
  const { supabase, user } = await requireUser("/tours");

  const owned = await ownedByCaller(supabase, id, user.id);
  if (!owned) return { error: "That tour could not be found." };

  const { error } = await supabase.from("tours").delete().eq("id", id);
  if (error) {
    return { error: reportFailure("deleteTour", error, "Could not delete that tour.") };
  }

  revalidatePath("/tours");
  return { id };
}
