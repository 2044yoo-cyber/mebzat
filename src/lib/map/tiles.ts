import type { StyleSpecification } from "maplibre-gl";

/**
 * Basemap tile providers, with failover.
 *
 * A single provider is a single point of failure: OpenStreetMap's own servers
 * refuse traffic they cannot identify and rate-limit anything they consider
 * heavy, and any one host can be blocked by a network or a country. So the map
 * carries several keyless providers and picks the first that actually answers.
 *
 * All of these are free and need no API key. None is Mapbox or Google, so
 * there is no key to expire, no quota to exhaust and no domain allowlist to
 * keep in step with the deployment.
 */

export type TileProvider = {
  id: string;
  label: string;
  /** Shown in the switcher so the choice is meaningful, not just a name. */
  blurb: string;
  tiles: string[];
  attribution: string;
  maxzoom: number;
  /** A tile that certainly exists, used to test the provider. */
  probe: string;
};

export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: "carto-voyager",
    label: "Carto Voyager",
    blurb: "Colourful streets. Usually the most reliable.",
    // CDN-backed with permissive CORS, which is why it leads.
    tiles: [
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{ratio}.png",
      "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{ratio}.png",
      "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{ratio}.png",
    ],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxzoom: 20,
    probe: "https://a.basemaps.cartocdn.com/rastertiles/voyager/2/2/1.png",
  },
  {
    id: "osm",
    label: "OpenStreetMap",
    blurb: "The standard OSM map.",
    // The canonical host. The a./b./c. subdomains are deprecated and some
    // networks no longer resolve them.
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxzoom: 19,
    probe: "https://tile.openstreetmap.org/2/2/1.png",
  },
  {
    id: "carto-light",
    label: "Carto Light",
    blurb: "Muted, so property pins stand out.",
    tiles: [
      "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{ratio}.png",
      "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{ratio}.png",
    ],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxzoom: 20,
    probe: "https://a.basemaps.cartocdn.com/light_all/2/2/1.png",
  },
  {
    id: "esri",
    label: "Esri Streets",
    blurb: "Different network entirely — try if the others are blocked.",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxzoom: 19,
    probe:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/2/1/2",
  },
  {
    id: "opentopo",
    label: "Terrain",
    blurb: "Contours and relief.",
    tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
    attribution: "Map data &copy; OpenStreetMap contributors, SRTM · Style &copy; OpenTopoMap (CC-BY-SA)",
    maxzoom: 17,
    probe: "https://a.tile.opentopomap.org/2/2/1.png",
  },
  {
    id: "esri-satellite",
    label: "Esri Satellite",
    blurb: "Aerial imagery.",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics",
    maxzoom: 19,
    probe:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/2",
  },
];

/**
 * An override for networks where none of the built-ins are reachable.
 *
 * Set NEXT_PUBLIC_MAP_TILE_URL to any {z}/{x}/{y} template and it goes to the
 * front of the list. Public rather than server-only because the browser is
 * what fetches the tiles.
 */
export function customProvider(): TileProvider | null {
  const url = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  if (!url) return null;

  return {
    id: "custom",
    label: "Custom tiles",
    blurb: "From NEXT_PUBLIC_MAP_TILE_URL",
    tiles: [url],
    attribution: process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ?? "",
    maxzoom: 19,
    // Substituting a real tile makes the probe test the actual endpoint.
    probe: url
      .replace("{z}", "2")
      .replace("{x}", "2")
      .replace("{y}", "1")
      .replace("{ratio}", ""),
  };
}

export function allProviders(): TileProvider[] {
  const custom = customProvider();
  return custom ? [custom, ...TILE_PROVIDERS] : TILE_PROVIDERS;
}

export function providerById(id: string): TileProvider | undefined {
  return allProviders().find((provider) => provider.id === id);
}

/** Builds a MapLibre style around one provider. Never fetches anything. */
export function styleFor(provider: TileProvider): StyleSpecification {
  return {
    version: 8,
    // No glyph endpoint is declared, so the style has no label layers — the
    // raster tiles already have names drawn into them. Declaring one and
    // failing to reach it is a common cause of a blank map.
    sources: {
      basemap: {
        type: "raster",
        // MapLibre substitutes {ratio} with "@2x" on high-density screens; the
        // providers that do not offer it get an empty string via the template.
        tiles: provider.tiles.map((url) => url.replace("{ratio}", "")),
        tileSize: 256,
        maxzoom: provider.maxzoom,
        attribution: provider.attribution,
      },
    },
    layers: [
      // A background under the tiles, so an unloaded area reads as map rather
      // than as a hole in the page.
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#e8e6e1" },
      },
      { id: "basemap", type: "raster", source: "basemap" },
    ],
  };
}

/**
 * Tests whether a provider's tiles actually load in this browser.
 *
 * Uses an Image rather than fetch on purpose: a tile is an image, images are
 * not subject to CORS for mere display, and this is exactly the request
 * MapLibre will make. A fetch could fail on CORS while the map would have
 * worked, or succeed where the map fails.
 */
export function probeProvider(
  provider: TileProvider,
  timeoutMs = 5000,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    const image = new Image();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    // A tile that loads has real dimensions; a captive-portal or error page
    // served as an image would not be 256 wide.
    image.onload = () => finish(image.naturalWidth > 0);
    image.onerror = () => finish(false);

    // Cache-bust so a previously failed load is not reused.
    image.src = `${provider.probe}${provider.probe.includes("?") ? "&" : "?"}_probe=${Date.now()}`;
  });
}

/**
 * Finds the first provider that works, preferring one the user already chose.
 *
 * Probed in order rather than in parallel: the first is nearly always fine,
 * and firing five requests to prove it would be five times the traffic for no
 * benefit.
 */
export async function pickWorkingProvider(
  preferredId?: string | null,
): Promise<{ provider: TileProvider; tried: string[] } | null> {
  const providers = allProviders();
  const ordered = preferredId
    ? [
        ...providers.filter((entry) => entry.id === preferredId),
        ...providers.filter((entry) => entry.id !== preferredId),
      ]
    : providers;

  const tried: string[] = [];
  for (const provider of ordered) {
    tried.push(provider.id);
    if (await probeProvider(provider)) {
      return { provider, tried };
    }
  }
  return null;
}

/** Remembers the working provider, so the next visit starts there. */
const STORAGE_KEY = "medosha:map:tiles";

export function rememberProvider(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private browsing and blocked storage are fine; the probe just re-runs.
  }
}

export function recallProvider(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
