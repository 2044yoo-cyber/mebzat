/**
 * What a tour must satisfy before it touches the database.
 *
 * These two rules live outside the server action because both fail quietly if
 * they are wrong. A validation gap does not throw — it writes a broken tour
 * that looks fine until a visitor clicks a door that opens nothing. And the
 * storage check is a security boundary: the browser sends a URL rather than a
 * file, because a server action cannot receive a Blob, so an unchecked URL
 * would let a tour embed an image from anywhere and bypass the moderation the
 * upload path exists to enforce.
 *
 * Inside a "use server" file neither could be asserted without pulling in
 * next/cache. Out here they can.
 */

export const MAX_SCENES = 40;
export const MAX_HOTSPOTS_PER_SCENE = 30;

/** The subset of a hotspot the rules care about. */
export type ValidatableHotspot = {
  kind: string;
  yaw: number;
  pitch: number;
  title: string;
  targetSceneKey?: string | null;
};

export type ValidatableScene = {
  key: string;
  title: string;
  panoramaUrl: string;
  hotspots?: ValidatableHotspot[];
};

export type ValidatableTour = {
  title: string;
  scenes: ValidatableScene[];
};

/** The first thing wrong with this tour, phrased for the person saving it. */
export function validateTour(input: ValidatableTour): string | null {
  const title = input.title.trim();
  if (title.length < 3) return "Give the tour a name.";
  if (title.length > 200) return "That name is too long.";

  if (input.scenes.length === 0) return "Add at least one 360° photo.";
  if (input.scenes.length > MAX_SCENES) {
    return `A tour can hold up to ${MAX_SCENES} scenes.`;
  }

  const keys = new Set(input.scenes.map((scene) => scene.key));
  if (keys.size !== input.scenes.length) return "Two scenes have the same id.";

  for (const scene of input.scenes) {
    if (!scene.panoramaUrl) return "A scene is missing its photo.";
    if (!scene.title.trim()) return "Every scene needs a name.";

    const hotspots = scene.hotspots ?? [];
    if (hotspots.length > MAX_HOTSPOTS_PER_SCENE) {
      return `A scene can hold up to ${MAX_HOTSPOTS_PER_SCENE} hotspots.`;
    }

    for (const hotspot of hotspots) {
      if (!hotspot.title.trim()) return "Every hotspot needs a label.";
      if (!Number.isFinite(hotspot.yaw) || !Number.isFinite(hotspot.pitch)) {
        return "A hotspot has no position.";
      }
      // The database has the same constraint. Here it becomes a sentence
      // instead of a 23514, and it is caught before anything is written.
      if (hotspot.kind === "scene") {
        if (!hotspot.targetSceneKey) return "A door hotspot has no scene to open.";
        if (!keys.has(hotspot.targetSceneKey)) {
          return "A door hotspot points at a scene that is not in this tour.";
        }
      }
    }
  }

  return null;
}

/**
 * Whether a panorama URL is one this application published.
 *
 * Both halves matter. The origin alone would accept any object in any bucket,
 * including a file still sitting in someone's quarantine folder — the whole
 * point of which is that it has not been checked yet. The path alone would
 * accept `https://anywhere.example/storage/v1/object/public/panoramas/x.jpg`.
 */
export function fromOurStorage(url: string, supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false;
  try {
    const parsed = new URL(url);
    const origin = new URL(supabaseUrl);
    return (
      parsed.origin === origin.origin &&
      parsed.pathname.startsWith("/storage/v1/object/public/panoramas/")
    );
  } catch {
    return false;
  }
}
