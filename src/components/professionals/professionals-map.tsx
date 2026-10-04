"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  ClipboardList,
  DraftingCompass,
  Droplets,
  Frame,
  Hammer,
  HardHat,
  MapPin,
  PaintRoller,
  Plug,
  Ruler,
  Sofa,
  Trees,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { BASE_STYLE } from "@/lib/map/style";
import {
  boundsOf,
  type ProfessionalPoint,
} from "@/lib/professionals/map-points";
import {
  TRADE_ICON_CATEGORIES,
  availabilityLabel,
  isTakingWork,
  markerDescription,
  pinLabel,
  placeLabel,
  tradeColour,
  tradeIconCategory,
  type TradeIconCategory,
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
 * An icon, and nothing else. The first version printed the trade on a pill the
 * way the property map prints a price, and on a real search that was fifty
 * pills reading "Construction Labourer" and "Interior Designer" stacked over
 * central Addis Ababa — a map whose markers covered the map. A price is four
 * characters; a trade is twenty, and twenty characters do not fit on a city at
 * city zoom however well they are set.
 *
 * So the marker is a circle about a tenth the area of that pill, carrying the
 * icon its trade's category already uses elsewhere in the app, and the words
 * move to a card that opens when a pointer rests on it. Nothing is lost: the
 * trade, the name, the area and the availability are all in the card, all in
 * the panel under the map, and all in the accessible label.
 *
 * The hit area is deliberately larger than the circle — a transparent ring
 * around it — because eighteen pixels is a good marker and a bad target, and
 * a marker that cannot be tapped on a phone is not a marker.
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
  const iconsRef = useRef<HTMLDivElement>(null);
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
        new maplibregl.Marker({
          element: buildMarker(point, setSelected, iconsRef.current),
          anchor: "bottom",
        })
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
      {/*
        The icons, drawn once and then cloned.

        MapLibre wants a DOM element per marker, and a Lucide icon is a React
        component — so one of the two has to give. Mounting a React root per
        marker would be sixty roots for markup that never changes after it is
        built; hand-copying twelve sets of SVG path data into this file would
        be twelve things to keep in step with the icon library.

        Rendering them once, hidden, and cloning the nodes is neither. React
        renders children before effects run, so these are in the document by
        the time the markers are built.
      */}
      <div ref={iconsRef} hidden aria-hidden="true">
        {TRADE_ICON_CATEGORIES.map((category) => {
          const Icon = TRADE_ICONS[category];
          return (
            <Icon
              key={category}
              data-trade-icon={category}
              width={11}
              height={11}
              strokeWidth={2.5}
            />
          );
        })}
      </div>

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
        /* The marker is the circle. The wrapper is bigger than the circle on
           purpose: the transparent ring around it is the tap target, because
           eighteen pixels is a good marker and a bad target. */
        .medosha-pro {
          display:flex; flex-direction:column; align-items:center;
          padding:11px; margin:-11px;
        }
        .medosha-pro__body {
          position:relative;
          display:flex; align-items:center; justify-content:center;
          width:18px; height:18px; padding:0;
          border-radius:999px; cursor:pointer;
          box-shadow:0 2px 5px rgb(0 0 0 / .35);
          transition:transform .12s ease, box-shadow .12s ease;
        }
        /* Their workplace: solid, standing on the map. */
        .medosha-pro[data-kind="base"] .medosha-pro__body {
          background:linear-gradient(180deg, var(--pro) 0%, var(--pro-dark) 100%);
          color:#fff; border:1.5px solid rgba(255,255,255,.95);
        }
        /* Somewhere they travel to: outlined, and dashed so the difference is
           visible in one colour as well as two. */
        .medosha-pro[data-kind="service"] .medosha-pro__body {
          background:#fff; color:var(--pro-dark);
          border:1.5px dashed var(--pro);
        }
        .medosha-pro__body svg { display:block; }
        .medosha-pro__stem {
          width:1.5px; height:6px; margin-top:-1px;
          background:linear-gradient(180deg, var(--pro-dark), transparent);
        }
        /* Taking work now. Overlapping the circle rather than beside it,
           because there is no beside at this size. */
        .medosha-pro__free {
          position:absolute; top:-2px; right:-2px;
          width:6px; height:6px; border-radius:999px;
          background:#10b981; box-shadow:0 0 0 1.5px rgb(255 255 255 / .95);
        }

        /* ---- the card that opens on hover ---------------------------------
           Everything the pill used to print, and more than it had room for.
           The hover query is there so a phone -- where there is no hover, and
           a tap would open this and leave it open -- gets the panel under the
           map instead. (No backticks in here: this block is a template
           literal, and one inside a CSS comment ends it.) */
        .medosha-pro__card {
          position:absolute; bottom:calc(100% + 8px); left:50%;
          transform:translateX(-50%) translateY(4px);
          min-width:150px; max-width:220px; padding:7px 9px;
          border-radius:10px; border:1px solid rgb(0 0 0 / .08);
          background:#fff; color:#0f172a;
          box-shadow:0 10px 24px rgb(0 0 0 / .22);
          text-align:left; pointer-events:none;
          opacity:0; visibility:hidden;
          transition:opacity .12s ease, transform .12s ease;
        }
        .medosha-pro__card b { display:block; font-size:12px; font-weight:700; }
        .medosha-pro__card span {
          display:block; font-size:11px; line-height:1.45; color:#475569;
        }
        .medosha-pro__card em {
          font-style:normal; font-weight:600; color:var(--pro-dark);
        }
        @media (hover: hover) {
          .medosha-pro:hover { z-index:5; }
          .medosha-pro:hover .medosha-pro__body {
            transform:scale(1.35);
            box-shadow:0 6px 14px rgb(0 0 0 / .38);
          }
          .medosha-pro:hover .medosha-pro__card,
          .medosha-pro:focus-within .medosha-pro__card {
            opacity:1; visibility:visible;
            transform:translateX(-50%) translateY(0);
          }
        }
        /* Keyboard users get the card too, on every device: focus is the one
           way to reach a marker without a pointer. */
        .medosha-pro:focus-within { z-index:5; }
        .medosha-pro:focus-within .medosha-pro__card {
          opacity:1; visibility:visible;
          transform:translateX(-50%) translateY(0);
        }

        @media (prefers-reduced-motion: reduce) {
          .medosha-pro__body, .medosha-pro__card { transition:none; }
        }
      `}</style>
    </div>
  );
}

/**
 * The icon for each category, as the categories themselves declare it.
 *
 * The names are the ones in `service_categories` since 0011 — changing one
 * here without changing it there would give a trade one icon on the map and a
 * different one on its own category chip.
 */
const TRADE_ICONS: Record<TradeIconCategory, LucideIcon> = {
  architecture: DraftingCompass,
  structural: Frame,
  mep: Zap,
  surveying: Ruler,
  "general-contracting": HardHat,
  interior: Sofa,
  landscaping: Trees,
  electrical: Plug,
  plumbing: Droplets,
  finishing: PaintRoller,
  joinery: Hammer,
  "project-management": ClipboardList,
  unknown: MapPin,
};

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
  icons: HTMLElement | null,
): HTMLElement {
  const colours = tradeColour(point.trade);

  const wrapper = document.createElement("div");
  wrapper.className = "medosha-pro";
  wrapper.dataset.kind = point.kind;
  wrapper.style.setProperty("--pro", colours.base);
  wrapper.style.setProperty("--pro-dark", colours.dark);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "medosha-pro__body";
  button.setAttribute("aria-label", markerDescription(point));

  // Cloned from the hidden sheet the component rendered. A marker with no icon
  // would be a plain coloured dot, which still reads as a marker — so a
  // missing clone degrades rather than throwing.
  const source = icons?.querySelector(
    `[data-trade-icon="${tradeIconCategory(point.trade)}"]`,
  );
  if (source) {
    const icon = source.cloneNode(true) as SVGElement;
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);
  }

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

  // The card that opens on hover. Built here rather than shown from React
  // state so that resting a pointer on a marker does not re-render the map.
  const card = document.createElement("div");
  card.className = "medosha-pro__card";
  card.setAttribute("aria-hidden", "true");

  const name = document.createElement("b");
  name.textContent = point.name;

  const trade = document.createElement("span");
  const tradeWord = document.createElement("em");
  tradeWord.textContent = pinLabel(point.trade);
  trade.append(tradeWord);

  const where = document.createElement("span");
  where.textContent = placeLabel(point);

  const free = document.createElement("span");
  free.textContent = availabilityLabel(point.availability);

  card.append(name, trade, where, free);
  wrapper.append(card);

  const stem = document.createElement("span");
  stem.className = "medosha-pro__stem";
  stem.setAttribute("aria-hidden", "true");

  wrapper.append(button, stem);
  return wrapper;
}
