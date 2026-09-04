/**
 * Turning what the builder holds into what the server is sent.
 *
 * This was six lines inside the builder component, and it silently dropped
 * three fields the moment they were added: a room waiting on review reached
 * the server with no `pending` flag and a signed quarantine link where its
 * public URL should have been, and the save was refused with "A scene's photo
 * was not uploaded through Medosha." Nothing was wrong with the check — the
 * scene arrived looking exactly like an attempt to smuggle in a foreign image.
 *
 * A hand-written field list is the wrong shape for something that must stay in
 * step with two other types. It is out here so that when it falls behind again,
 * a check says so rather than a stranger's toast.
 */

import type { HotspotInput, SceneInput } from "@/app/tours/actions";

/** A hotspot as the builder holds it: an input plus a local key. */
export type DraftHotspot = HotspotInput & { key: string };

/** A scene as the builder holds it. */
export type DraftTourScene = {
  key: string;
  title: string;
  panoramaUrl: string;
  width: number;
  height: number;
  pending?: boolean;
  quarantinePath?: string;
  moderationItemId?: string;
  initialYaw: number;
  initialPitch: number;
  initialZoom: number;
  hotspots: DraftHotspot[];
};

export function toSceneInputs(scenes: DraftTourScene[]): SceneInput[] {
  return scenes.map((scene) => ({
    key: scene.key,
    title: scene.title,
    panoramaUrl: scene.panoramaUrl,
    // The three that were missed. A pending scene is only recognisable as one
    // if all three travel together: the flag says which branch to take, the
    // path says where the file actually is, and the moderation id is what
    // approval later uses to find the scene and fill in its URL.
    pending: scene.pending,
    quarantinePath: scene.quarantinePath,
    moderationItemId: scene.moderationItemId,
    width: scene.width,
    height: scene.height,
    initialYaw: scene.initialYaw,
    initialPitch: scene.initialPitch,
    initialZoom: scene.initialZoom,
    // Listed rather than spread: `key` is local to the builder and must not
    // reach the action, which keys scenes by its own.
    hotspots: scene.hotspots.map((hotspot) => ({
      kind: hotspot.kind,
      yaw: hotspot.yaw,
      pitch: hotspot.pitch,
      title: hotspot.title,
      description: hotspot.description,
      targetSceneKey: hotspot.targetSceneKey,
    })),
  }));
}
