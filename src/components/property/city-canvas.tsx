"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { Box, Layers, Loader2, Locate, Minus, Plus, WifiOff } from "lucide-react";

import { describeError, trackRequest } from "@/lib/map/diagnostics";
import { MapEngine, type EngineState } from "@/lib/map/engine";
import {
  clusterProperties,
  createClusterElement,
  createMarkerElement,
  MARKER_COLOURS,
} from "@/lib/map/markers";
import type { AiHighlight } from "@/lib/map/ai-highlight";
import { loadSession, saveSession } from "@/lib/map/session";
import { BASE_STYLE } from "@/lib/map/style";
import { PriceLegend } from "@/components/property/price-legend";
import {
  bandFor,
  buildPriceScale,
  scaleKindFor,
  type PriceBand,
} from "@/lib/map/price-bands";
import { allProviders, rememberProvider } from "@/lib/map/tiles";
import { cn } from "@/lib/utils";
import type { City, MapProperty } from "@/types/database.types";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The persistent map canvas.
 *
 * The map is created once, in an effect keyed only on the city's id, and lives
 * for as long as this component is mounted. Nothing else recreates it —
 * opening a property, changing a filter, searching, zooming and toggling the
 * side panel all go through refs and imperative calls, never through effect
 * dependencies. That is what keeps the tiles the browser has already fetched
 * on screen instead of re-downloading them on every interaction.
 *
 * Style selection is delegated to MapEngine, which serialises it. Two
 * concurrent `setStyle` calls are what used to make the map paint for a second
 * and then go blank.
 */

const MOVE_DEBOUNCE_MS = 300;
const RETRY_DELAYS = [2000, 5000, 15000];

export type CanvasFilters = {
  types?: string[];
  kinds?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minArea?: number;
};

export function CityCanvas({
  city,
  initial,
  filters,
  selectedId,
  highlight,
  panelOpen,
  onSelect,
  onResults,
}: {
  city: City;
  initial: MapProperty[];
  filters: CanvasFilters;
  selectedId: string | null;
  /** Listings Medosha AI just searched for, or null. */
  highlight?: AiHighlight | null;
  panelOpen: boolean;
  onSelect: (property: MapProperty | null) => void;
  onResults?: (properties: MapProperty[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const requestRef = useRef<AbortController | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const fetchRef = useRef<(() => void) | null>(null);

  const [properties, setProperties] = useState<MapProperty[]>(initial);

  // The ids as one string, then the Set derived from that string alone.
  //
  // Memoising on the array would rebuild every marker on the map on every
  // render, because the route sends a fresh array each turn. Going through a
  // joined key means the memo's only input is a primitive: it recomputes when
  // the ids actually change and not when a new array holding the same ids
  // arrives.
  const highlightKey = (highlight?.ids ?? []).join(",");
  const highlightIds = useMemo(
    () => new Set(highlightKey ? highlightKey.split(",") : []),
    [highlightKey],
  );

  /**
   * The marker's match state, or the empty string for "no search is running".
   *
   * The distinction is the whole feature. The dimming rule keys off
   * `data-ai-match="false"`, so a flat `String(has(id))` would mark every
   * marker on a map nobody has asked a question about as a non-match — and dim
   * the entire map to 45% on first load.
   */
  const matchState = useCallback(
    (id: string): string =>
      highlightIds.size === 0 ? "" : String(highlightIds.has(id)),
    [highlightIds],
  );
  const [zoom, setZoom] = useState(city.default_zoom);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [engine, setEngine] = useState<EngineState>({
    provider: null,
    mode: "2d",
    painted: false,
    vectorAvailable: false,
    blocked: false,
  });

  // Everything the map reads imperatively lives in a ref, so none of it can
  // become an effect dependency and tear the map down.
  const filtersRef = useRef(filters);
  const onSelectRef = useRef(onSelect);
  const onResultsRef = useRef(onResults);
  const selectedRef = useRef(selectedId);
  const panelRef = useRef(panelOpen);
  useEffect(() => {
    filtersRef.current = filters;
    onSelectRef.current = onSelect;
    onResultsRef.current = onResults;
    selectedRef.current = selectedId;
    panelRef.current = panelOpen;
  });

  // ---- Properties: independent of the map's own health --------------------

  const fetchViewport = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    let params: URLSearchParams;
    try {
      const bounds = map.getBounds();
      params = new URLSearchParams({
        south: String(bounds.getSouth()),
        west: String(bounds.getWest()),
        north: String(bounds.getNorth()),
        east: String(bounds.getEast()),
      });
    } catch {
      return;
    }

    const active = filtersRef.current;
    if (active.types?.length) params.set("types", active.types.join(","));
    if (active.kinds?.length) params.set("kinds", active.kinds.join(","));
    if (active.minPrice !== undefined) params.set("minPrice", String(active.minPrice));
    if (active.maxPrice !== undefined) params.set("maxPrice", String(active.maxPrice));
    if (active.minBedrooms !== undefined) {
      params.set("minBedrooms", String(active.minBedrooms));
    }
    if (active.minArea !== undefined) params.set("minArea", String(active.minArea));

    const url = `/api/properties/viewport?${params}`;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (retryRef.current) clearTimeout(retryRef.current);

    setLoading(true);
    const track = trackRequest("properties", url);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { properties?: MapProperty[] };
      const rows = data.properties ?? [];

      setProperties(rows);
      onResultsRef.current?.(rows);
      setOffline(false);
      retryCountRef.current = 0;
      track.ok(`${rows.length} properties`);
    } catch (error) {
      if (controller.signal.aborted) {
        track.skipped("superseded");
        return;
      }

      track.failed(describeError(error));
      setOffline(true);

      const attempt = retryCountRef.current;
      if (attempt < RETRY_DELAYS.length) {
        retryCountRef.current = attempt + 1;
        retryRef.current = setTimeout(() => fetchRef.current?.(), RETRY_DELAYS[attempt]);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRef.current = () => void fetchViewport();
  }, [fetchViewport]);

  // ---- The map: created once, for the life of this city -------------------

  useEffect(() => {
    if (!containerRef.current) return;

    // Restore where the user was, if they were here recently.
    const session = loadSession(city.slug);
    const start = session ?? {
      longitude: city.longitude,
      latitude: city.latitude,
      zoom: city.default_zoom,
      pitch: 0,
      bearing: 0,
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [start.longitude, start.latitude],
      zoom: start.zoom,
      pitch: start.pitch,
      bearing: start.bearing,
      attributionControl: { compact: true },
      // Keeping tiles for out-of-view zoom levels is what makes zooming back
      // out instant instead of a re-download.
      maxTileCacheSize: 300,
      refreshExpiredTiles: false,
    });

    mapRef.current = map;
    const markers = markersRef.current;

    const engineInstance = new MapEngine(map);
    engineRef.current = engineInstance;
    const unsubscribe = engineInstance.subscribe(setEngine);

    map.on("error", (event) => {
      console.warn(
        "[medosha:map] resource error:",
        event?.error?.message ?? "unknown",
      );
    });

    let moveTimer: ReturnType<typeof setTimeout>;

    map.on("load", () => {
      setReady(true);
      setZoom(map.getZoom());
      void fetchViewport();
      // One serialised decision, so nothing races and blanks the map.
      void engineInstance.resolve();
    });

    const onMoveEnd = () => {
      setZoom(map.getZoom());
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        retryCountRef.current = 0;
        void fetchViewport();
      }, MOVE_DEBOUNCE_MS);

      // Persist the camera so returning to the page lands where they left.
      const centre = map.getCenter();
      saveSession({
        citySlug: city.slug,
        longitude: centre.lng,
        latitude: centre.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        mode: engineInstance.getState().mode,
        selectedId: selectedRef.current,
        panelOpen: panelRef.current,
      });
    };

    map.on("moveend", onMoveEnd);
    map.on("click", () => onSelectRef.current?.(null));

    return () => {
      clearTimeout(moveTimer);
      if (retryRef.current) clearTimeout(retryRef.current);
      requestRef.current?.abort();
      unsubscribe();
      engineInstance.dispose();
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      mapRef.current = null;
      engineRef.current = null;
      map.remove();
    };
    // Keyed on the city's identity only. Filters, selection and panel state
    // deliberately do not appear here — they must never rebuild the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city.id, city.slug]);

  // Refetch on filter change, without touching the map instance.
  // Debounced: tapping through several filters should send one request, and
  // deferring it also keeps the fetch out of the effect body.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      retryCountRef.current = 0;
      void fetchViewport();
    }, 120);
    return () => clearTimeout(timer);
  }, [filters, ready, fetchViewport]);

  // Resize when the side panel opens or closes, so the canvas keeps the full
  // area rather than being letterboxed by a stale size.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const timer = setTimeout(() => map.resize(), 250);
    return () => clearTimeout(timer);
  }, [panelOpen, ready]);

  // Any container resize at all, including the window and the CSS grid.
  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map || !ready) return;

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [ready]);

  // ---- Markers and clusters ----------------------------------------------

  // ---- The price scale ----------------------------------------------------
  //
  // Built from the properties currently displayed — which is the filtered set,
  // because that is what this component is given — so filtering by
  // neighbourhood, price or bedrooms re-bands whatever is left. Memoised on
  // that array, so panning and zooming (which do not change it) cost nothing;
  // it is recomputed only when the dataset actually changes, which is the
  // difference between a sort per filter change and a sort per mouse move.
  //
  // Two scales, never one. ETB 45,000 a month and ETB 45,000,000 outright are
  // both ordinary, and mixed into a single distribution every rental is
  // "lowest" and every sale "highest".
  const bands = useMemo(() => {
    const rent = buildPriceScale(
      properties.filter((p) => scaleKindFor(p.listing_kind) === "rent").map((p) => p.price),
      "rent",
    );
    const sale = buildPriceScale(
      properties.filter((p) => scaleKindFor(p.listing_kind) === "sale").map((p) => p.price),
      "sale",
    );

    const byId = new Map<string, PriceBand | null>();
    for (const property of properties) {
      const scale = scaleKindFor(property.listing_kind) === "rent" ? rent : sale;
      byId.set(property.id, bandFor(property.price, scale));
    }

    // Whichever kind dominates what is on screen is the one the legend
    // explains. A map of a hundred rentals and two sales is a rental map, and
    // two keys side by side would cost more attention than the second one is
    // worth.
    const rentals = properties.filter((p) => scaleKindFor(p.listing_kind) === "rent").length;
    const kind: "rent" | "sale" = rentals >= properties.length - rentals ? "rent" : "sale";

    return { byId, scale: kind === "rent" ? rent : sale, kind };
  }, [properties]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const markers = markersRef.current;
    const { clusters, singles } = clusterProperties(properties, zoom);

    const wanted = new Set<string>();
    for (const cluster of clusters) wanted.add(`cluster:${cluster.id}`);
    for (const property of singles) wanted.add(property.id);

    for (const [id, marker] of markers) {
      if (!wanted.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    for (const cluster of clusters) {
      const id = `cluster:${cluster.id}`;
      const mix = cluster.properties.map((p) => bands.byId.get(p.id) ?? "none").join(",");
      const already = markers.get(id);
      // A cluster whose price mix has changed is a different drawing, so it is
      // replaced rather than left showing the ring from before the filter.
      if (already) {
        if (already.getElement().dataset.mix === mix) continue;
        already.remove();
        markers.delete(id);
      }

      const element = createClusterElement(cluster.properties.length, () => {
        map.easeTo({
          center: [cluster.longitude, cluster.latitude],
          zoom: Math.min(map.getZoom() + 2.5, 17),
          duration: 600,
        });
      });

      element.dataset.mix = mix;

      markers.set(
        id,
        new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([cluster.longitude, cluster.latitude])
          .addTo(map),
      );
    }

    for (const property of singles) {
      const band = bands.byId.get(property.id) ?? null;
      const existing = markers.get(property.id);
      if (existing) {
        existing.getElement().dataset.selected = String(
          selectedId === property.id,
        );
        existing.getElement().dataset.aiMatch = matchState(property.id);
        // Selection is a dataset flip; a changed band is a different colour,
        // ring and level, so that one is rebuilt. Without this the markers
        // keep the colours from before the filter and the legend describes a
        // scale the map is not drawing.
        if ((existing.getElement().dataset.band ?? "") === (band ?? "")) continue;
        existing.remove();
        markers.delete(property.id);
      }

      const element = createMarkerElement(
        property,
        (chosen) => onSelectRef.current?.(chosen),
        band,
      );
      element.dataset.selected = String(selectedId === property.id);
      element.dataset.aiMatch = matchState(property.id);

      try {
        markers.set(
          property.id,
          new maplibregl.Marker({ element, anchor: "bottom" })
            .setLngLat([property.longitude, property.latitude])
            .addTo(map),
        );
      } catch {
        // A pin with impossible coordinates must not take the map with it.
      }
    }
  }, [bands, properties, ready, selectedId, matchState, zoom]);

  // Frame what the assistant found.
  //
  // Highlighting a marker outside the viewport highlights nothing, and asking
  // about Bole while looking at Ayat is the ordinary case rather than the edge
  // one. `fitBounds` rather than `easeTo` because the answer is a set: the
  // useful camera is the one that holds all of them.
  useEffect(() => {
    const map = mapRef.current;
    const bounds = highlight?.bounds;
    if (!map || !ready || !bounds) return;

    try {
      map.fitBounds(
        [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
        {
          padding: { top: 64, bottom: 64, left: 64, right: panelOpen ? 420 : 64 },
          // Close in on a tight cluster, but never past street level — a fit
          // to two neighbouring listings would otherwise land on a rooftop.
          maxZoom: 16,
          duration: 700,
        },
      );
    } catch {
      // Camera moves are cosmetic.
    }
  }, [highlight, ready, panelOpen]);

  // Ease to a property chosen from the list, offset for the open panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedId) return;

    const property = properties.find((item) => item.id === selectedId);
    if (!property) return;

    try {
      map.easeTo({
        center: [property.longitude, property.latitude],
        zoom: Math.max(map.getZoom(), 15),
        duration: 600,
        // Shifts the pin clear of the panel instead of hiding under it.
        padding: panelOpen ? { right: 420, top: 0, bottom: 0, left: 0 } : undefined,
      });
    } catch {
      // Camera moves are cosmetic.
    }
  }, [selectedId, properties, ready, panelOpen]);

  return (
    <div className="relative size-full overflow-hidden rounded-2xl border">
      <div ref={containerRef} className="size-full" />

      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <MapButton label="Zoom in" onClick={() => mapRef.current?.zoomIn()} icon={<Plus className="size-4" />} />
        <MapButton label="Zoom out" onClick={() => mapRef.current?.zoomOut()} icon={<Minus className="size-4" />} />

        <div className="relative">
          <MapButton
            label="Basemap"
            onClick={() => setSwitcherOpen((value) => !value)}
            active={switcherOpen}
            icon={<Layers className="size-4" />}
          />
          {switcherOpen && (
            <div className="absolute top-0 right-11 w-60 overflow-hidden rounded-xl border bg-popover p-1 shadow-xl">
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Basemap</p>
              {allProviders().map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setSwitcherOpen(false);
                    rememberProvider(entry.id);
                    void engineRef.current?.setProvider(entry.id);
                  }}
                  className={cn(
                    "block w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                    engine.provider?.id === entry.id ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="block text-sm font-medium">{entry.label}</span>
                  <span className="block text-xs text-muted-foreground">{entry.blurb}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <MapButton
          label={
            engine.vectorAvailable
              ? engine.mode === "3d"
                ? "Switch to 2D"
                : "Switch to 3D"
              : "3D needs vector tiles, which are unavailable here"
          }
          onClick={() =>
            void engineRef.current?.setMode(engine.mode === "3d" ? "2d" : "3d")
          }
          active={engine.mode === "3d"}
          disabled={!engine.vectorAvailable}
          icon={<Box className="size-4" />}
        />

        <MapButton
          label="Recentre"
          onClick={() =>
            mapRef.current?.easeTo({
              center: [city.longitude, city.latitude],
              zoom: city.default_zoom,
              duration: 700,
            })
          }
          icon={<Locate className="size-4" />}
        />
      </div>

      <div className="pointer-events-none absolute top-3 left-3 flex max-w-xs flex-col items-start gap-2">
        <span className="rounded-full bg-background/90 px-3 py-1.5 text-sm font-medium shadow-sm backdrop-blur">
          {loading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              Searching…
            </span>
          ) : (
            `${properties.length} ${properties.length === 1 ? "property" : "properties"}`
          )}
        </span>

        {engine.blocked && (
          <span className="pointer-events-auto flex items-start gap-1.5 rounded-xl bg-amber-500/95 px-3 py-2 text-sm font-medium text-white shadow-sm">
            <WifiOff className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Map tiles are blocked on this network. Listings still work — try
              another basemap from the layers button.
            </span>
          </span>
        )}

        {offline && !engine.blocked && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1.5 text-sm font-medium text-white shadow-sm">
            <WifiOff className="size-3.5" />
            Listings unavailable — retrying
          </span>
        )}
      </div>

      {/* The legend is the key to the whole map, so it is always visible. */}
      <div className="pointer-events-none absolute bottom-8 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
        {Object.entries(MARKER_COLOURS).map(([key, colour]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: colour.base }}
            />
            {colour.label}
          </span>
        ))}
      </div>

      <PriceLegend scale={bands.scale} kind={bands.kind} />

      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-muted/40">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <style>{`
        .medosha-marker { display:flex; flex-direction:column; align-items:center; }
        .medosha-marker__body {
          background: linear-gradient(180deg, var(--marker) 0%, var(--marker-dark) 100%);
          color:#fff; border:2px solid rgba(255,255,255,.95); border-radius:999px;
          padding:4px 11px; font-size:12px; font-weight:700; white-space:nowrap;
          font-variant-numeric:tabular-nums; cursor:pointer;
          box-shadow:0 3px 10px rgb(0 0 0 / .3), inset 0 1px 0 rgb(255 255 255 / .28);
          transition:transform 140ms cubic-bezier(.2,.8,.3,1), box-shadow 140ms ease;
        }
        .medosha-marker__stem {
          width:2px; height:9px; margin-top:-1px;
          background:linear-gradient(180deg, var(--marker-dark), transparent);
        }
        /* The price ring. Drawn with an outset box-shadow so it sits *outside*
           the pill and cannot cover the price, which is the one thing that
           must stay readable. Widest and most opaque at the top of the
           market. */
        .medosha-marker[data-band] .medosha-marker__body {
          box-shadow:0 3px 10px rgb(0 0 0 / .3), inset 0 1px 0 rgb(255 255 255 / .28),
                     0 0 0 3px var(--marker-ring);
        }
        .medosha-marker[data-band="highest"] .medosha-marker__body {
          box-shadow:0 3px 10px rgb(0 0 0 / .3), inset 0 1px 0 rgb(255 255 255 / .28),
                     0 0 0 4px var(--marker-ring);
        }
        /* The level, so the scale survives without colour vision. */
        .medosha-marker__level { display:inline-flex; gap:1.5px; align-items:flex-end; margin-left:6px; }
        .medosha-marker__level i {
          width:2px; height:4px; border-radius:1px;
          background:rgb(255 255 255 / .32);
        }
        .medosha-marker__level i[data-on] { background:#fff; }
        .medosha-marker__level i:nth-child(2) { height:5px; }
        .medosha-marker__level i:nth-child(3) { height:6px; }
        .medosha-marker__level i:nth-child(4) { height:7px; }
        .medosha-marker__level i:nth-child(5) { height:8px; }
        .medosha-marker:hover .medosha-marker__body { transform:translateY(-3px) scale(1.06); box-shadow:0 8px 18px rgb(0 0 0 / .34); }
        /* A listing Medosha AI just found.
           Two changes, not one: the unmatched markers step back to 45% so the
           set the user asked for reads as a group, and the matched ones take a
           white halo. Dimming alone would be invisible on a map showing four
           pins; a halo alone would be lost on a map showing four hundred.
           Never a colour swap — the marker's colour is its price band, and
           overwriting it would make the legend describe a scale the map is no
           longer drawing. */
        .medosha-marker[data-ai-match="false"] { opacity:.45; }
        .medosha-marker[data-ai-match="true"] { z-index:2; }
        .medosha-marker[data-ai-match="true"] .medosha-marker__body {
          box-shadow:0 6px 16px rgb(0 0 0 / .34), 0 0 0 3px #fff, 0 0 0 6px rgb(37 99 235 / .55);
        }
        .medosha-marker[data-selected="true"] { z-index:3; }
        .medosha-marker[data-selected="true"] .medosha-marker__body {
          transform:translateY(-4px) scale(1.14);
          box-shadow:0 10px 22px rgb(0 0 0 / .4), 0 0 0 4px rgb(255 255 255 / .55);
        }
        .medosha-cluster__body {
          display:flex; align-items:center; justify-content:center;
          background:radial-gradient(circle at 35% 30%, #3b82f6, #1e40af);
          color:#fff; border:3px solid rgba(255,255,255,.95); border-radius:999px;
          font-size:13px; font-weight:700; cursor:pointer;
          box-shadow:0 4px 14px rgb(0 0 0 / .32);
          transition:transform 140ms cubic-bezier(.2,.8,.3,1);
        }
        .medosha-cluster__body:hover { transform:scale(1.09); }
        /* The price mix, as a ring around the count. The count keeps a solid
           disc behind it, so a busy ring never makes the number hard to read.
           The custom property is a conic-gradient built from the bands inside. */
        .medosha-cluster__body[style*="--cluster-mix"] {
          background:var(--cluster-mix);
          position:relative;
        }
        .medosha-cluster__body[style*="--cluster-mix"]::before {
          content:""; position:absolute; inset:5px; border-radius:999px;
          background:radial-gradient(circle at 35% 30%, #1f2937, #111827);
        }
        .medosha-cluster__count { position:relative; z-index:1; }
        @media (prefers-reduced-motion: reduce) {
          .medosha-marker__body, .medosha-cluster__body { transition:none; }
        }
      `}</style>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  icon,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg border shadow-sm backdrop-blur transition-colors",
        active ? "border-brand bg-brand text-brand-foreground" : "bg-background/90 hover:bg-background",
        disabled && "cursor-not-allowed opacity-40 hover:bg-background/90",
      )}
    >
      {icon}
    </button>
  );
}
