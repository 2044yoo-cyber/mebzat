"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapPin } from "lucide-react";

import { BASEMAPS, BASE_STYLE, type BasemapId } from "@/lib/map/style";
import { circlePolygon } from "@/lib/location/privacy";
import { cn } from "@/lib/utils";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The buyer's map.
 *
 * Draws a circle or a pin, and never both. The circle is a real polygon in
 * geographic coordinates rather than a styled point: a circle marker is sized
 * in screen pixels, so zooming in would shrink the area it appears to cover
 * while the promise it represents stayed the same — the buyer would be told a
 * different thing at every zoom level.
 *
 * Loaded through `next/dynamic` from the section above, so a page whose
 * listing hides its location entirely never downloads MapLibre at all.
 */
export function PrivacyMap({
  latitude,
  longitude,
  radiusM,
  showCircle,
  height = "h-72",
}: {
  latitude: number;
  longitude: number;
  radiusM: number;
  showCircle: boolean;
  height?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [basemap, setBasemap] = useState<BasemapId>("street");

  useEffect(() => {
    if (!containerRef.current) return;

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASE_STYLE,
        center: [longitude, latitude],
        // A circle wants the whole circle in frame; a pin can go closer.
        zoom: showCircle ? (radiusM > 500 ? 13 : 15) : 16,
        attributionControl: { compact: true },
      });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }

    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("error", (event) => {
      console.warn(
        "[medosha:map] property tile error:",
        event?.error?.message ?? event,
      );
    });

    let marker: maplibregl.Marker | null = null;

    // Source and each layer are added independently and guarded on their own
    // id, rather than one check gating all four calls. `addLayer` can throw
    // if it lands a tick before the style is fully ready — `styledata` fires
    // several times during a single load, not just once — and a one-guard
    // version that threw partway through would leave the source in place
    // with no layers on it, and never try again: `getSource` would already
    // be truthy, so every later retry bailed out before reaching `addLayer`.
    // Per-id guards mean whatever didn't land gets finished on the next
    // `styledata`, and the try/catch means a too-early attempt is a retry,
    // not a silently abandoned map.
    const draw = () => {
      try {
        if (showCircle) {
          if (!map.getSource("area")) {
            map.addSource("area", {
              type: "geojson",
              data: circlePolygon(latitude, longitude, radiusM),
            });
          }
          if (!map.getLayer("area-fill")) {
            map.addLayer({
              id: "area-fill",
              type: "fill",
              source: "area",
              paint: { "fill-color": "#2563eb", "fill-opacity": 0.2 },
            });
          }
          // A white halo under the line, because a 2px blue line reads fine
          // on a plain basemap and disappears on a busy one — satellite
          // imagery, or an OSM tile with its own red clinic/pharmacy icons
          // right on the boundary. The halo is what keeps the line visible
          // underneath them.
          if (!map.getLayer("area-line-halo")) {
            map.addLayer({
              id: "area-line-halo",
              type: "line",
              source: "area",
              paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.85 },
            });
          }
          if (!map.getLayer("area-line")) {
            map.addLayer({
              id: "area-line",
              type: "line",
              source: "area",
              paint: { "line-color": "#2563eb", "line-width": 3 },
            });
          }
        } else if (!marker) {
          marker = new maplibregl.Marker({ color: "#2563eb" })
            .setLngLat([longitude, latitude])
            .addTo(map);
        }
      } catch (error) {
        console.warn("[medosha:map] privacy circle not ready yet, retrying:", error);
      }
    };

    map.on("load", draw);
    // Changing basemap discards every layer, so they are put back — and the
    // first few `styledata` events of the initial load are exactly the ones
    // the try/catch above exists for.
    map.on("styledata", draw);

    return () => {
      marker?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed", height)}>
        <MapPin className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          The map could not load.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border">
      <div ref={containerRef} className={cn("w-full", height)} />

      <div className="absolute top-2 left-2 flex overflow-hidden rounded-lg border bg-background/95 shadow-sm backdrop-blur">
        {BASEMAPS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setBasemap(entry.id);
              mapRef.current?.setStyle(entry.style);
            }}
            aria-pressed={basemap === entry.id}
            className={cn(
              "px-2.5 py-1.5 text-xs font-medium transition-colors",
              basemap === entry.id
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}
