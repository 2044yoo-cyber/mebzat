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

/** One hotspot row, with its scene and target already resolved to uuids. */
export type ResolvedHotspot = {
  scene_id: string;
  kind: HotspotInput["kind"];
  yaw: number;
  pitch: number;
  title: string;
  description: string | null;
  target_scene_id: string | null;
  target_property_id: string | null;
  target_project_id: string | null;
  target_url: string | null;
};

export type ResolveResult =
  | { ok: true; hotspots: ResolvedHotspot[] }
  | { ok: false; reason: string; detail: string };

/**
 * Turning each hotspot's scene *key* into the uuid that scene was just given.
 *
 * A door names its destination by the builder's local key, because it may
 * point at a room being created in the same save. The keys are resolved here,
 * after the scenes are written and before any hotspot is.
 *
 * The failure this exists to prevent is a door that resolves to nothing. The
 * database refuses it — `hotspot_scene_has_target` — but by then the scenes
 * have been written, and what reaches the person is a 23514 quoting a row.
 * Resolving first turns that into a sentence naming the room, and means the
 * broken row is never sent.
 */
export function resolveSceneTargets(
  scenes: { key: string; title: string; hotspots?: DraftHotspot[] }[],
  idForKey: Map<string, string>,
  idAt: (index: number) => string | undefined,
): ResolveResult {
  const hotspots: ResolvedHotspot[] = [];

  for (const [index, scene] of scenes.entries()) {
    const sceneId = idAt(index);
    if (!sceneId) {
      return {
        ok: false,
        reason: "Could not save the scenes.",
        detail: `no id came back for scene ${index} ("${scene.title}")`,
      };
    }

    for (const hotspot of scene.hotspots ?? []) {
      let target: string | null = null;

      if (hotspot.targetSceneKey) {
        target = idForKey.get(hotspot.targetSceneKey) ?? null;

        if (hotspot.kind === "scene" && !target) {
          return {
            ok: false,
            reason:
              `The door "${hotspot.title}" in "${scene.title}" points at a room ` +
              `that is no longer in this tour. Choose another room for it, or ` +
              `remove it, and save again.`,
            detail: `unresolved target key ${hotspot.targetSceneKey}`,
          };
        }
      }

      if (hotspot.kind === "scene" && !target) {
        return {
          ok: false,
          reason:
            `The door "${hotspot.title}" in "${scene.title}" has no room to ` +
            `open. Choose one for it, or remove it, and save again.`,
          detail: "scene hotspot with no target key",
        };
      }

      hotspots.push({
        scene_id: sceneId,
        kind: hotspot.kind,
        yaw: hotspot.yaw,
        pitch: hotspot.pitch,
        title: hotspot.title.trim(),
        description: hotspot.description?.trim() || null,
        target_scene_id: target,
        target_property_id: hotspot.targetPropertyId ?? null,
        target_project_id: hotspot.targetProjectId ?? null,
        target_url: hotspot.targetUrl ?? null,
      });
    }
  }

  return { ok: true, hotspots };
}
