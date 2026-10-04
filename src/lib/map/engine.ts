import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

import { probeVectorStyle, VECTOR_STYLE_URL } from "@/lib/map/style";
import {
  pickWorkingProvider,
  probeProvider,
  providerById,
  recallProvider,
  styleFor,
  type TileProvider,
} from "@/lib/map/tiles";
import { describeError, trackRequest } from "@/lib/map/diagnostics";

/**
 * The map engine: one place that decides what the map should be showing.
 *
 * This exists because of a specific bug. Two independent async routines used
 * to call `setStyle()` on the same map — one picking a raster provider, one
 * upgrading to vector for the 3D buildings. Whichever finished last won, and
 * when the vector style's JSON loaded but its *tiles* were blocked, the map
 * painted for about a second and then went blank. A style that parses is not
 * a style that renders, and nothing in MapLibre reports the difference.
 *
 * So style selection is serialised here, runs once, and only commits to a
 * style after confirming that style's tiles actually draw.
 *
 * Provider-agnostic on purpose: `MapEngine` is the seam. Swapping MapLibre for
 * Cesium or Mapbox means writing another engine, not touching the components.
 */

export type MapMode = "2d" | "3d";

export type EngineState = {
  provider: TileProvider | null;
  mode: MapMode;
  /** True once a style whose tiles actually render is on the map. */
  painted: boolean;
  /** True when 3D buildings are available to switch to. */
  vectorAvailable: boolean;
  /** Set when nothing at all could be reached. */
  blocked: boolean;
};

export type EngineListener = (state: EngineState) => void;

/**
 * Decides and applies the map's style, exactly once per map.
 *
 * Sequenced deliberately:
 *   1. Find a raster provider whose tiles render. This is the floor — the map
 *      is guaranteed usable from here on.
 *   2. Only then try the vector style, and only commit to it after its own
 *      tiles are confirmed. If they are not, stay on raster.
 *
 * Nothing here throws. A total failure leaves `blocked: true` and the caller
 * shows a message rather than a blank rectangle.
 */
export class MapEngine {
  private map: MapLibreMap;
  private listeners = new Set<EngineListener>();
  private disposed = false;
  /** Guards against a second run overlapping the first. */
  private resolving = false;
  private vectorStyle: StyleSpecification | null = null;

  private state: EngineState = {
    provider: null,
    mode: "2d",
    painted: false,
    vectorAvailable: false,
    blocked: false,
  };

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  getState(): EngineState {
    return { ...this.state };
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }

  private emit(patch: Partial<EngineState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }

  /** Applies a style and resolves when it has finished loading, or times out. */
  private setStyle(style: StyleSpecification): Promise<void> {
    return new Promise((resolve) => {
      if (this.disposed) {
        resolve();
        return;
      }

      const camera = {
        center: this.map.getCenter(),
        zoom: this.map.getZoom(),
        pitch: this.map.getPitch(),
        bearing: this.map.getBearing(),
      };

      // A style that never fires `idle` must not hang the sequence forever.
      const timer = setTimeout(finish, 8000);
      const onIdle = () => finish();

      function finish() {
        clearTimeout(timer);
        resolve();
      }

      try {
        this.map.once("idle", onIdle);
        this.map.setStyle(style);
        // setStyle drops the camera on some transitions; restore it once the
        // new style has its sources.
        this.map.once("styledata", () => {
          if (!this.disposed) this.map.jumpTo(camera);
        });
      } catch (error) {
        console.warn("[medosha:map] setStyle failed:", describeError(error));
        finish();
      }
    });
  }

  /**
   * Runs the whole decision once.
   *
   * Idempotent: calling it again while it is working is a no-op, which is what
   * stops the race that used to blank the map.
   */
  async resolve(): Promise<void> {
    if (this.resolving || this.disposed) return;
    this.resolving = true;

    try {
      await this.resolveRaster();
      // Vector is attempted only after a working floor exists, so a vector
      // failure can never leave the map with nothing.
      if (this.state.painted) await this.resolveVector();
    } finally {
      this.resolving = false;
    }
  }

  /** Step 1: a raster basemap that demonstrably renders. */
  private async resolveRaster() {
    const track = trackRequest("basemap tiles", "provider probe");
    const remembered = recallProvider();
    const result = await pickWorkingProvider(remembered);

    if (this.disposed) {
      track.skipped("map disposed");
      return;
    }

    if (!result) {
      track.failed("every basemap provider is unreachable");
      this.emit({ blocked: true, painted: false });
      return;
    }

    track.ok(`using ${result.provider.label}`);
    await this.setStyle(styleFor(result.provider));
    this.emit({ provider: result.provider, painted: true, blocked: false });
  }

  /**
   * Step 2: the vector style, for 3D buildings.
   *
   * The style JSON and the vector tiles are separate requests. Fetching the
   * JSON proves nothing about the tiles, and switching on the strength of the
   * JSON alone is exactly what produced the one-second-then-blank map. So the
   * style is fetched, its tile endpoint is extracted, and a real tile is
   * probed before anything is applied.
   */
  private async resolveVector() {
    const track = trackRequest("vector style (3D)", VECTOR_STYLE_URL);
    const probe = await probeVectorStyle();

    if (this.disposed) {
      track.skipped("map disposed");
      return;
    }
    if (!probe.ok) {
      track.failed(probe.reason);
      return;
    }

    const tileUrl = firstVectorTile(probe.style);
    if (!tileUrl) {
      track.failed("style declares no reachable tile endpoint");
      return;
    }

    const tilesRender = await probeProvider(
      {
        id: "vector-probe",
        label: "vector",
        blurb: "",
        tiles: [],
        attribution: "",
        maxzoom: 14,
        probe: tileUrl,
      },
      6000,
    );

    if (this.disposed) return;

    if (!tilesRender) {
      // The exact failure that used to blank the map. Now it is a logged
      // no-op and the raster basemap simply stays.
      track.failed("style loaded but its tiles are blocked — staying on 2D");
      return;
    }

    this.vectorStyle = probe.style;
    track.ok("3D buildings available");
    this.emit({ vectorAvailable: true });
  }

  /** Switches between the flat basemap and 3D buildings. */
  async setMode(mode: MapMode): Promise<void> {
    if (this.disposed || mode === this.state.mode) return;

    if (mode === "3d") {
      if (!this.vectorStyle) return;
      await this.setStyle(this.vectorStyle);
      addBuildingLayer(this.map);
      this.map.easeTo({ pitch: 50, bearing: -17, duration: 600 });
      this.emit({ mode: "3d" });
      return;
    }

    const provider = this.state.provider;
    if (provider) await this.setStyle(styleFor(provider));
    this.map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    this.emit({ mode: "2d" });
  }

  /** Changes basemap without disturbing the camera or the markers. */
  async setProvider(id: string): Promise<void> {
    const provider = providerById(id);
    if (!provider || this.disposed) return;

    await this.setStyle(styleFor(provider));
    this.emit({ provider, mode: "2d", painted: true });
  }
}

/** Pulls a concrete tile URL out of a vector style, for probing. */
function firstVectorTile(style: StyleSpecification): string | null {
  for (const source of Object.values(style.sources ?? {})) {
    if (typeof source !== "object" || source === null) continue;
    const tiles = (source as { tiles?: string[] }).tiles;
    if (tiles?.length) {
      return (tiles[0] ?? "")
        .replace("{z}", "2")
        .replace("{x}", "2")
        .replace("{y}", "1");
    }
  }
  return null;
}

/** Extrudes the vector style's building footprints. Never throws. */
export function addBuildingLayer(map: MapLibreMap) {
  try {
    if (map.getLayer("medosha-buildings")) return;

    const style = map.getStyle();
    const source = style.layers?.find(
      (layer): layer is typeof layer & { source: string; "source-layer": string } =>
        "source-layer" in layer && layer["source-layer"] === "building",
    );
    if (!source) return;

    const firstLabel = style.layers?.find(
      (layer) => layer.type === "symbol" && layer.layout?.["text-field"],
    );

    map.addLayer(
      {
        id: "medosha-buildings",
        type: "fill-extrusion",
        source: source.source,
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": "#9ca3af",
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            0,
            16,
            ["coalesce", ["get", "render_height"], ["get", "height"], 10],
          ],
          "fill-extrusion-base": [
            "coalesce",
            ["get", "render_min_height"],
            ["get", "min_height"],
            0,
          ],
          "fill-extrusion-opacity": 0.7,
        },
      },
      firstLabel?.id,
    );
  } catch (error) {
    console.warn("[medosha:map] building layer skipped:", error);
  }
}
