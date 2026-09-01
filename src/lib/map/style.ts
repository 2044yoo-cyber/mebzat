import type { StyleSpecification } from "maplibre-gl";

import {
  allProviders,
  providerById,
  styleFor,
  type TileProvider,
} from "@/lib/map/tiles";

/**
 * Map styles.
 *
 * The base style is an **inline object**, not a URL. That is the whole point:
 * `new maplibregl.Map({ style: "https://…" })` has to fetch and parse that JSON
 * before it can draw anything, so a single failed request means no map at all —
 * and the failure surfaces as a bare `TypeError: Failed to fetch`.
 *
 * With an inline style the map is constructed from memory and is interactive
 * immediately. Tiles then stream in independently; a tile that fails to load is
 * a blank square, which MapLibre handles internally and never throws for.
 *
 * The vector style is an optional upgrade fetched afterwards, because it is
 * what carries building footprints for the 3D layer. If that fetch fails the
 * map simply stays raster — flat, complete, and working.
 */

/**
 * The style the map is constructed with.
 *
 * Built from the first tile provider in the list. The map then probes which
 * providers actually reach this browser and switches if that one does not —
 * see `tiles.ts`. Constructing it fetches nothing.
 */
/**
 * The first provider that exists.
 *
 * `allProviders()` is built from a non-empty constant, but indexing it is
 * still an unchecked read — and a deployment that sets NEXT_PUBLIC_MAP_TILE_URL
 * to an empty string could genuinely empty it. Falling back to OpenStreetMap
 * means a misconfigured tile URL degrades to a working map rather than a crash
 * at module load, which is where this would otherwise fail.
 */
function firstProvider(): TileProvider {
  return (
    allProviders()[0] ?? {
      id: "osm",
      label: "OpenStreetMap",
      blurb: "Fallback.",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
      probe: "https://tile.openstreetmap.org/2/2/1.png",
    }
  );
}

export const BASE_STYLE: StyleSpecification = styleFor(firstProvider());

/**
 * The vector upgrade: OpenFreeMap Liberty.
 *
 * Open data, no key, and it ships building footprints with height — which is
 * what makes the 3D extrusion possible. Strictly optional.
 */
export const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export type StyleProbe =
  | { ok: true; style: StyleSpecification }
  | { ok: false; reason: string };

/**
 * Fetches the vector style, without ever throwing.
 *
 * Deliberately fetched by hand rather than handed to MapLibre as a URL: doing
 * it here means a failure is an ordinary rejected promise this function
 * catches, instead of an internal MapLibre error that escapes as an unhandled
 * `TypeError: Failed to fetch`.
 */
export async function probeVectorStyle(
  signal?: AbortSignal,
  timeoutMs = 6000,
): Promise<StyleProbe> {
  // A hung request is worse than a failed one — it would leave the map raster
  // forever with no explanation, so it gets its own deadline.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);

  // Either the caller unmounting or the deadline should cancel it.
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(VECTOR_STYLE_URL, {
      signal: timeout.signal,
      cache: "force-cache",
    });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    const style = (await response.json()) as StyleSpecification;
    if (!style?.sources || !style?.layers) {
      return { ok: false, reason: "style JSON was not a valid style" };
    }
    return { ok: true, style };
  } catch (error) {
    const reason =
      error instanceof DOMException && error.name === "AbortError"
        ? "timed out or was cancelled"
        : error instanceof Error
          ? error.message
          : "unknown network error";
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ---------------------------------------------------------------------------
// Basemaps a viewer can switch between
// ---------------------------------------------------------------------------

/**
 * The three views a property map offers.
 *
 * Satellite answers "what does the plot actually look like", terrain answers
 * "is it on a slope" — both real questions when buying land in Ethiopia, and
 * neither answerable from a street map. Built from the same provider list as
 * everything else so a network that blocks one provider does not silently
 * lose the switcher.
 */
export type BasemapId = "street" | "satellite" | "terrain";

export const BASEMAPS: {
  id: BasemapId;
  label: string;
  style: StyleSpecification;
}[] = [
  { id: "street", label: "Map", style: BASE_STYLE },
  {
    id: "satellite",
    label: "Satellite",
    style: styleFor(
      providerById("esri-satellite") ?? firstProvider(),
    ),
  },
  {
    id: "terrain",
    label: "Terrain",
    style: styleFor(providerById("opentopo") ?? firstProvider()),
  },
];
