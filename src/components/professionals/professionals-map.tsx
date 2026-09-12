"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapPin } from "lucide-react";

import { BASE_STYLE } from "@/lib/map/style";
import {
  boundsOf,
  type ProfessionalPoint,
} from "@/lib/professionals/map-points";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Where the people in these results work, roughly.
 *
 * Every marker is an *area*, not an address. The points arrive already
 * resolved from area names by `mapPoints`, which never sees a coordinate
 * anybody set on their own profile — so there is nothing here to be careful
 * with, which is the only kind of careful that survives a year of edits.
 *
 * The note under the map says so in as many words, because a map of pins is
 * read as a map of addresses unless it is told otherwise.
 *
 * Loaded through `next/dynamic` from the page, so a visitor who stays on the
 * list never downloads MapLibre at all.
 */
export function ProfessionalsMap({
  points,
  height = "h-[28rem]",
}: {
  points: ProfessionalPoint[];
  height?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ProfessionalPoint | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASE_STYLE,
        center: [38.78, 9.01],
        zoom: 11,
        attributionControl: { compact: true },
      });
    } catch {
      // A browser without WebGL, or a blocked tile host. The list is still
      // there; a broken grey box is not worth a crash.
      //
      // `queueMicrotask` so the state change lands outside the effect body,
      // which is how privacy-map.tsx handles the same case and what stops it
      // being a cascading render.
      queueMicrotask(() => setFailed(true));
      return;
    }

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const markers: maplibregl.Marker[] = [];
    for (const point of points) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${point.name}, ${point.areaName}`);
      el.className =
        "flex size-7 items-center justify-center rounded-full border-2 border-white bg-[var(--brand)] text-white shadow-md";
      el.textContent = point.name.slice(0, 1).toUpperCase();
      el.addEventListener("click", () => setSelected(point));

      markers.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map),
      );
    }

    const bounds = boundsOf(points);
    if (bounds) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    }

    return () => {
      for (const marker of markers) marker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [points]);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        <MapPin className="size-6" />
        The map could not load. Switch back to the list.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`w-full overflow-hidden rounded-2xl border ${height}`}
      />

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
          <span className="min-w-0">
            <span className="font-medium">{selected.name}</span>
            <span className="text-muted-foreground">
              {selected.kind === "base"
                ? ` — based in ${selected.areaName}`
                : ` — works in ${selected.areaName}`}
            </span>
          </span>
          <Link
            href={`/u/${selected.username}`}
            className="shrink-0 text-brand hover:underline"
          >
            View profile
          </Link>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Markers show the area somebody works in, not an address. Nobody&apos;s
        home or exact location is shown.
      </p>
    </div>
  );
}
