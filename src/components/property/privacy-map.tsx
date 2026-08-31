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

    const draw = () => {
      if (showCircle) {
        if (map.getSource("area")) return;
        map.addSource("area", {
          type: "geojson",
          data: circlePolygon(latitude, longitude, radiusM),
        });
        map.addLayer({
          id: "area-fill",
          type: "fill",
          source: "area",
          paint: { "fill-color": "#2563eb", "fill-opacity": 0.16 },
        });
        map.addLayer({
          id: "area-line",
          type: "line",
          source: "area",
          paint: { "line-color": "#2563eb", "line-width": 2 },
        });
      } else if (!marker) {
        marker = new maplibregl.Marker({ color: "#2563eb" })
          .setLngLat([longitude, latitude])
          .addTo(map);
      }
    };

    map.on("load", draw);
    // Changing basemap discards every layer, so they are put back.
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
