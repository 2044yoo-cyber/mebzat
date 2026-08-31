"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Eye, EyeOff, MapPin, Redo2, Ruler, ShieldCheck, Undo2 } from "lucide-react";

import { LocationSearch } from "@/components/property/location-search";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BASEMAPS, BASE_STYLE, type BasemapId } from "@/lib/map/style";
import {
  DEFAULT_RADIUS,
  PRIVACY_RADII,
  VISIBILITY_OPTIONS,
  circlePolygon,
  distanceMetres,
  formatDistance,
  radiusLabel,
  type LocationVisibility,
  type PrivacyRadius,
} from "@/lib/location/privacy";
import { cn } from "@/lib/utils";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Placing a listing, and deciding how much of it is public.
 *
 * The seller sees their exact pin — it is theirs, and they cannot place it
 * accurately if it is hidden from them. Around it sits the circle the *buyer*
 * will see, drawn at the chosen radius, so the privacy setting is something
 * you look at rather than a checkbox you hope about.
 *
 * The circle drawn here is centred on the pin. The published one deliberately
 * is not, and that offset is never shown: displaying it would tell the seller
 * — and anyone reading over their shoulder, or scraping the page — whereabouts
 * inside the circle the property really sits.
 *
 * The coordinates stay editable as numbers. The map needs tiles from the
 * network and a seller on a bad connection still has to be able to publish.
 */

type Point = { latitude: number; longitude: number };

export function LocationPicker({
  latitude,
  longitude,
  visibility = "approximate",
  radius = DEFAULT_RADIUS,
  onChange,
  onVisibilityChange,
  onRadiusChange,
  onPlaceSelected,
}: {
  latitude: number;
  longitude: number;
  visibility?: LocationVisibility;
  radius?: PrivacyRadius;
  onChange: (lat: number, lon: number) => void;
  onVisibilityChange?: (visibility: LocationVisibility) => void;
  onRadiusChange?: (radius: PrivacyRadius) => void;
  /** Fired when a search result should also fill the city and neighbourhood. */
  onPlaceSelected?: (place: {
    city: string | null;
    neighbourhood: string | null;
  }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);
  const [basemap, setBasemap] = useState<BasemapId>("street");

  // Undo/redo over pin positions. A dragged pin is easy to lose and hard to
  // find again, and the seller is the only person who knows where it was.
  const [history, setHistory] = useState<Point[]>([{ latitude, longitude }]);
  const [cursor, setCursor] = useState(0);

  // Measuring: click two points, get the distance. "How far is the main road"
  // is a question sellers are actually asked.
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<Point[]>([]);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  /** Moves the pin and, unless typing, records the move for undo. */
  const commit = useCallback((lat: number, lon: number, record = true) => {
    onChangeRef.current(lat, lon);
    if (!record) return;
    setHistory((entries) => {
      // Anything redone-past is discarded, as in every other undo stack.
      const kept = entries.slice(0, 40);
      return [...kept, { latitude: lat, longitude: lon }].slice(-40);
    });
    setCursor((index) => index + 1);
  }, []);

  // ---- The map ----------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        // Inline style, so the picker needs no request to appear. A seller on
        // a bad connection can still place their pin.
        style: BASE_STYLE,
        center: [longitude, latitude],
        zoom: 15,
      });
    } catch {
      // Constructing the map is an external-system failure, so it is reported
      // out of the effect body rather than synchronously inside it.
      queueMicrotask(() => setFailed(true));
      return;
    }

    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("error", (event) => {
      // Tiles failing leaves a blank grid, which is still draggable, so this
      // is logged rather than swapped for the coordinates-only fallback.
      console.warn(
        "[medosha:map] picker tile error:",
        event?.error?.message ?? event,
      );
    });

    const marker = new maplibregl.Marker({ draggable: true, color: "#2563eb" })
      .setLngLat([longitude, latitude])
      .addTo(map);
    markerRef.current = marker;

    marker.on("dragend", () => {
      const position = marker.getLngLat();
      commit(position.lat, position.lng);
    });

    const draw = () => {
      if (map.getSource("privacy-circle")) return;
      map.addSource("privacy-circle", {
        type: "geojson",
        data: circlePolygon(
          marker.getLngLat().lat,
          marker.getLngLat().lng,
          radius,
        ),
      });
      map.addLayer({
        id: "privacy-fill",
        type: "fill",
        source: "privacy-circle",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.14 },
      });
      map.addLayer({
        id: "privacy-line",
        type: "line",
        source: "privacy-circle",
        paint: {
          "line-color": "#2563eb",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
        },
      });
    };

    map.on("load", draw);
    // Switching basemap replaces the style and with it every layer, so the
    // circle has to be put back.
    map.on("styledata", draw);

    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Created once; later changes are pushed by the effects below rather than
    // by rebuilding the map, which would throw away the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clicking the map moves the pin, or takes a measurement.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function onClick(event: maplibregl.MapMouseEvent) {
      const point = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
      if (measuring) {
        setMeasurePoints((points) =>
          points.length >= 2 ? [point] : [...points, point],
        );
        return;
      }
      commit(point.latitude, point.longitude);
    }

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [measuring, commit]);

  // Keep the marker and the circle following the current value.
  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude]);
    const source = mapRef.current?.getSource("privacy-circle");
    if (source && "setData" in source) {
      (source as maplibregl.GeoJSONSource).setData(
        circlePolygon(latitude, longitude, radius),
      );
    }
  }, [latitude, longitude, radius]);

  // The circle is only meaningful when a circle is what buyers will see.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("privacy-fill")) return;
    const shown = visibility === "approximate" ? "visible" : "none";
    map.setLayoutProperty("privacy-fill", "visibility", shown);
    map.setLayoutProperty("privacy-line", "visibility", shown);
  }, [visibility, basemap]);

  const step = (delta: number) => {
    const next = cursor + delta;
    const point = history[next];
    if (!point) return;
    setCursor(next);
    onChangeRef.current(point.latitude, point.longitude);
    mapRef.current?.easeTo({
      center: [point.longitude, point.latitude],
      duration: 300,
    });
  };

  const measured =
    measurePoints.length === 2
      ? distanceMetres(
          measurePoints[0]?.latitude ?? 0,
          measurePoints[0]?.longitude ?? 0,
          measurePoints[1]?.latitude ?? 0,
          measurePoints[1]?.longitude ?? 0,
        )
      : null;

  return (
    <div className="space-y-3">
      <LocationSearch
        onSelect={(hit) => {
          commit(hit.latitude, hit.longitude);
          mapRef.current?.flyTo({
            center: [hit.longitude, hit.latitude],
            zoom: hit.kind === "city" ? 12 : 16,
          });
          onPlaceSelected?.({
            city: hit.city,
            neighbourhood: hit.kind === "neighbourhood" ? hit.label : null,
          });
        }}
      />

      {failed ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
          <MapPin className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            The map could not load. Enter the coordinates below instead — the
            listing works either way.
          </p>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border">
          <div ref={containerRef} className="h-80 w-full" />

          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <div className="flex overflow-hidden rounded-lg border bg-background/95 shadow-sm backdrop-blur">
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

            <div className="flex gap-1">
              <Tool label="Undo" onClick={() => step(-1)} disabled={cursor === 0}>
                <Undo2 className="size-3.5" />
              </Tool>
              <Tool
                label="Redo"
                onClick={() => step(1)}
                disabled={cursor >= history.length - 1}
              >
                <Redo2 className="size-3.5" />
              </Tool>
              <Tool
                label="Measure distance"
                onClick={() => {
                  setMeasuring((on) => !on);
                  setMeasurePoints([]);
                }}
                active={measuring}
              >
                <Ruler className="size-3.5" />
              </Tool>
            </div>
          </div>

          <p className="absolute right-2 bottom-2 left-2 rounded-lg bg-background/95 px-2.5 py-1.5 text-xs text-muted-foreground backdrop-blur">
            {measuring ? (
              measured !== null ? (
                <span className="font-medium text-foreground">
                  {formatDistance(measured)} between the two points
                </span>
              ) : (
                `Click two points to measure. ${measurePoints.length} of 2 placed.`
              )
            ) : visibility === "approximate" ? (
              <>
                <MapPin className="mr-1 inline size-3 text-brand" />
                Drag the pin to the exact spot. Buyers see the{" "}
                {radiusLabel(radius)} circle, not the pin.
              </>
            ) : visibility === "exact" ? (
              <>
                <Eye className="mr-1 inline size-3" />
                This pin will be public.
              </>
            ) : (
              <>
                <EyeOff className="mr-1 inline size-3" />
                Buyers see no map. Place the pin anyway — it is used to match
                searches.
              </>
            )}
          </p>
        </div>
      )}

      {/* ---- Visibility ------------------------------------------------ */}
      <fieldset className="space-y-2 rounded-2xl border p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
          <ShieldCheck className="size-4 text-brand" />
          Location Visibility
        </legend>

        <div className="space-y-1.5">
          {VISIBILITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors",
                visibility === option.value
                  ? "border-brand bg-brand/5"
                  : "hover:border-brand/40",
              )}
            >
              <input
                type="radio"
                name="location_visibility_choice"
                value={option.value}
                checked={visibility === option.value}
                onChange={() => onVisibilityChange?.(option.value)}
                className="mt-0.5 size-4"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {option.label}
                  {option.recommended && (
                    <span className="rounded-full border border-brand/40 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {option.blurb}
                </span>
              </span>
            </label>
          ))}
        </div>

        {visibility === "approximate" && (
          <div className="pt-1">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">
              Circle size
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRIVACY_RADII.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onRadiusChange?.(option)}
                  aria-pressed={radius === option}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    radius === option
                      ? "border-brand bg-brand/10 font-medium text-brand"
                      : "text-muted-foreground hover:border-brand",
                  )}
                >
                  {radiusLabel(option)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Buyers see a circle this size. The property can be anywhere
              inside it — the published circle is not centred on your pin.
            </p>
          </div>
        )}
      </fieldset>

      {/* ---- Coordinates ----------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="lat">Latitude</Label>
          <Input
            id="lat"
            type="number"
            step="any"
            value={latitude}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) commit(value, longitude, false);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lon">Longitude</Label>
          <Input
            id="lon"
            type="number"
            step="any"
            value={longitude}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) commit(latitude, value, false);
            }}
          />
        </div>
      </div>

      <input type="hidden" name="location_visibility" value={visibility} />
      <input type="hidden" name="privacy_radius_m" value={radius} />
    </div>
  );
}

function Tool({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg border bg-background/95 shadow-sm backdrop-blur transition-colors disabled:opacity-40",
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
