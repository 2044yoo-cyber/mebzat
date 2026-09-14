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
import {
  availabilityLabel,
  isTakingWork,
  markerDescription,
  pinLabel,
  placeLabel,
  tradeColour,
} from "@/lib/professionals/trade-markers";

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
 * ## The markers
 *
 * Built the same way the property map builds its price pins — a labelled pill
 * on a stem, as a DOM element rather than a symbol layer — because the label
 * is the whole point of the marker and a sprite cannot set text at an
 * arbitrary length.
 *
 * Two things are drawn that a single colour could not carry:
 *
 * - **Filled against outlined** says workplace against travels-here. It is
 *   fill, not hue, so it survives being printed, being looked at in sunlight
 *   and being looked at by somebody who cannot separate two colours.
 * - **A dot** says this person is taking work now. Nothing is drawn when they
 *   are not, so the dots are the answer to "who can start", and an empty map
 *   is a real answer rather than a broken one.
 *
 * Loaded through `next/dynamic` from the page, so a visitor who stays on the
 * list never downloads MapLibre at all.
 */
export function ProfessionalsMap({
  points,
  /**
   * How many people the map was given a chance to place.
   *
   * Not the number of search results — the page reports that separately, and
   * conflating the two would make this sentence lie the moment a search
   * returns more people than one map asks for.
   *
   * The map can only draw somebody who named an area. Reporting the gap is not
   * decoration: a search that found fifty-six people and drew nine pins looks
   * broken, and the reason it is not broken — forty-seven of them have not
   * said where they work — is a thing only this line can say.
   */
  considered,
  height = "h-[28rem]",
}: {
  points: ProfessionalPoint[];
  considered?: number;
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
      markers.push(
        new maplibregl.Marker({ element: buildMarker(point, setSelected), anchor: "bottom" })
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

  const seen = considered ?? points.length;
  const unplaced = Math.max(0, seen - points.length);

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={containerRef}
          className={`w-full overflow-hidden rounded-2xl border ${height}`}
        />

        {points.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <p className="pointer-events-auto max-w-xs rounded-xl bg-background/95 p-4 text-center text-sm text-muted-foreground shadow-lg">
              Nobody in these results has said which area they work in, so there
              is nothing to draw. The list has all {seen} of them.
            </p>
          </div>
        )}
      </div>

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
          <span className="min-w-0">
            <span className="font-medium">{selected.name}</span>
            <span className="text-muted-foreground">
              {selected.trade ? ` — ${selected.trade}` : ""}
              {` · ${placeLabel(selected)}`}
              {` · ${availabilityLabel(selected.availability)}`}
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-full bg-foreground/70" />
          Their workplace
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-full border-2 border-dashed border-foreground/60" />
          An area they travel to
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" />
          Taking work now
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Markers show the area somebody works in, not an address. Nobody&apos;s
        home or exact location is shown.
        {unplaced > 0
          ? ` ${unplaced} of these ${seen} have not said which area they work in, so they are on the list and not the map.`
          : ""}
      </p>

      <style>{`
        .medosha-pro { display:flex; flex-direction:column; align-items:center; }
        .medosha-pro__body {
          display:inline-flex; align-items:center; gap:5px;
          border-radius:999px; padding:4px 10px;
          font-size:12px; font-weight:700; white-space:nowrap; cursor:pointer;
          box-shadow:0 3px 10px rgb(0 0 0 / .3), inset 0 1px 0 rgb(255 255 255 / .28);
          transition:transform .12s ease, box-shadow .12s ease;
        }
        /* Their workplace: solid, standing on the map. */
        .medosha-pro[data-kind="base"] .medosha-pro__body {
          background:linear-gradient(180deg, var(--pro) 0%, var(--pro-dark) 100%);
          color:#fff; border:2px solid rgba(255,255,255,.95);
        }
        /* Somewhere they travel to: outlined, and dashed so the difference is
           visible in one colour as well as two. */
        .medosha-pro[data-kind="service"] .medosha-pro__body {
          background:#fff; color:var(--pro-dark);
          border:2px dashed var(--pro);
          box-shadow:0 2px 6px rgb(0 0 0 / .22);
        }
        .medosha-pro__stem {
          width:2px; height:9px; margin-top:-1px;
          background:linear-gradient(180deg, var(--pro-dark), transparent);
        }
        .medosha-pro__free {
          width:7px; height:7px; border-radius:999px;
          background:#10b981; box-shadow:0 0 0 1.5px rgb(255 255 255 / .9);
        }
        .medosha-pro:hover .medosha-pro__body {
          transform:translateY(-3px) scale(1.06);
          box-shadow:0 8px 18px rgb(0 0 0 / .34);
        }
        @media (prefers-reduced-motion: reduce) {
          .medosha-pro__body { transition:none; }
        }
      `}</style>
    </div>
  );
}

/**
 * One marker.
 *
 * A plain function rather than a component: MapLibre takes a DOM element, not
 * a React tree, and rendering into a portal per marker costs a React root per
 * pin for markup that never changes after it is built.
 */
function buildMarker(
  point: ProfessionalPoint,
  onSelect: (point: ProfessionalPoint) => void,
): HTMLElement {
  const colours = tradeColour(point.trade);

  const wrapper = document.createElement("div");
  wrapper.className = "medosha-pro";
  wrapper.dataset.kind = point.kind;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "medosha-pro__body";
  button.style.setProperty("--pro", colours.base);
  button.style.setProperty("--pro-dark", colours.dark);
  button.textContent = pinLabel(point.trade);
  button.setAttribute("aria-label", markerDescription(point));

  if (isTakingWork(point.availability)) {
    const free = document.createElement("span");
    free.className = "medosha-pro__free";
    // The accessible label already says "Available now" in words.
    free.setAttribute("aria-hidden", "true");
    button.append(free);
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(point);
  });

  const stem = document.createElement("span");
  stem.className = "medosha-pro__stem";
  stem.setAttribute("aria-hidden", "true");

  wrapper.append(button, stem);
  return wrapper;
}
