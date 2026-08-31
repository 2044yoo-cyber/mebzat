import { shortPrice } from "@/lib/constants/properties";
import { BAND_STYLES, PRICE_BANDS, type PriceBand } from "@/lib/map/price-bands";
import type { ListingKind, MapProperty, PropertyType } from "@/types/database.types";

/**
 * Property markers.
 *
 * Built as DOM elements rather than a GeoJSON symbol layer, for two reasons: a
 * price has to be legible at a glance, which a sprite cannot do at arbitrary
 * text lengths; and the colour scheme is part of the product, so it belongs in
 * the app's own CSS rather than in a style spec.
 *
 * Colour carries the category, which is the one thing a buyer scans a map for.
 */

export type MarkerCategory =
  | "sale"
  | "rent"
  | "project"
  | "commercial"
  | "featured";

export const MARKER_COLOURS: Record<
  MarkerCategory,
  { label: string; base: string; dark: string }
> = {
  sale: { label: "For sale", base: "#16a34a", dark: "#15803d" },
  rent: { label: "For rent", base: "#2563eb", dark: "#1d4ed8" },
  project: { label: "New project", base: "#ea580c", dark: "#c2410c" },
  commercial: { label: "Commercial", base: "#9333ea", dark: "#7e22ce" },
  featured: { label: "Featured", base: "#d4a017", dark: "#b8860b" },
};

const COMMERCIAL_TYPES: PropertyType[] = [
  "commercial",
  "office",
  "shop",
  "hotel",
  "restaurant",
  "warehouse",
  "factory",
  "industrial",
  "mixed_use",
];

/**
 * Which colour a property gets.
 *
 * Ordered by what a buyer most needs to know: featured first because it is a
 * paid position, then use, then tenure. A commercial rental reads as
 * commercial, because that is the search someone is running.
 */
export function categoryFor(
  property: Pick<MapProperty, "property_type" | "listing_kind"> & {
    featured?: boolean;
  },
): MarkerCategory {
  if (property.featured) return "featured";
  if (COMMERCIAL_TYPES.includes(property.property_type)) return "commercial";
  if (property.listing_kind === "rent" || property.listing_kind === "lease") {
    return "rent";
  }
  return "sale";
}

/**
 * Builds a marker element.
 *
 * The raised look comes from a gradient plus a stem, so a pin reads as
 * standing on the map rather than floating over it — which is what makes a
 * pitched 3D view legible.
 */
export function createMarkerElement(
  property: MapProperty,
  onSelect: (property: MapProperty) => void,
  /**
   * Where this listing sits in the price range currently on screen.
   *
   * Optional, and null for a listing with no price. When absent the marker
   * keeps the category colour it has always had, so nothing that does not pass
   * a band changes appearance.
   */
  band?: PriceBand | null,
): HTMLElement {
  const category = categoryFor(property);
  const colours = MARKER_COLOURS[category];
  const price = band ? BAND_STYLES[band] : null;

  const wrapper = document.createElement("div");
  wrapper.className = "medosha-marker";
  wrapper.dataset.category = category;
  if (band) wrapper.dataset.band = band;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "medosha-marker__body";
  // Price banding wins over the category colour when it is supplied: on a map
  // of rentals every marker is the same category, so category colour carries
  // no information there and price carries all of it.
  button.style.setProperty("--marker", price?.base ?? colours.base);
  button.style.setProperty("--marker-dark", price?.dark ?? colours.dark);
  if (price) button.style.setProperty("--marker-ring", price.ring);
  // The price itself, never replaced by the colour.
  button.textContent = shortPrice(
    property.price,
    property.currency,
    property.price_period,
  );
  button.setAttribute(
    "aria-label",
    `${property.title} — ${colours.label}${
      property.price ? `, ${shortPrice(property.price, property.currency, property.price_period)}` : ""
    }${price ? `, ${price.label} price in the current results` : ""}`,
  );

  // A level, drawn as bars, for anybody who cannot separate the red from the
  // green — which is the pair at the two ends of this scale. Hidden from
  // screen readers because the aria-label above already says the band in
  // words.
  if (price) {
    const level = document.createElement("span");
    level.className = "medosha-marker__level";
    level.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 5; i += 1) {
      const bar = document.createElement("i");
      if (i < price.bars) bar.dataset.on = "true";
      level.append(bar);
    }
    button.append(level);
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(property);
  });

  const stem = document.createElement("span");
  stem.className = "medosha-marker__stem";
  stem.setAttribute("aria-hidden", "true");

  wrapper.append(button, stem);
  return wrapper;
}

/**
 * Builds a cluster element.
 *
 * Size grows with count but is capped: past a few hundred the difference stops
 * being informative and the bubble just gets in the way.
 */
export function createClusterElement(
  count: number,
  onClick: () => void,
  /**
   * The bands of the listings inside, for the ring around the count.
   *
   * A cluster of forty cannot be one colour without lying about thirty-nine of
   * them, so instead of picking a winner it draws the mix as a conic ring —
   * mostly red means an expensive corner, mostly blue a cheap one, and a split
   * ring means exactly that. The count stays in the middle and stays legible,
   * which is what the ring is drawn *around* rather than behind.
   */
  bands?: (PriceBand | null)[],
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "medosha-cluster";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "medosha-cluster__body";

  const size = Math.min(58, 34 + Math.log10(Math.max(count, 1)) * 16);
  button.style.width = `${size}px`;
  button.style.height = `${size}px`;
  // An element rather than a text node: the price-mix ring draws an inner disc
  // with ::before, and a bare text node cannot be lifted above it.
  const label = document.createElement("span");
  label.className = "medosha-cluster__count";
  label.textContent = count > 999 ? "999+" : String(count);
  button.append(label);

  const priced = (bands ?? []).filter((band): band is PriceBand => band !== null);
  let summary = "";

  if (priced.length > 0) {
    // Ordered cheapest to dearest so the ring reads as a scale rather than as
    // whichever order the listings happened to arrive in.
    const tally = PRICE_BANDS.map((band) => ({
      band,
      share: priced.filter((entry) => entry === band).length / priced.length,
    })).filter((entry) => entry.share > 0);

    let cursor = 0;
    const stops = tally.map((entry) => {
      const from = cursor * 100;
      cursor += entry.share;
      return `${BAND_STYLES[entry.band].base} ${from}% ${cursor * 100}%`;
    });

    button.style.setProperty("--cluster-mix", `conic-gradient(${stops.join(", ")})`);
    wrapper.dataset.mixed = tally.length > 1 ? "true" : "false";

    const dearest = tally.at(-1);
    summary = dearest ? `, mostly ${BAND_STYLES[dearest.band].label.toLowerCase()} priced` : "";
  }

  button.setAttribute("aria-label", `${count} properties here${summary} — zoom in`);

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });

  wrapper.append(button);
  return wrapper;
}

export type Cluster = {
  id: string;
  longitude: number;
  latitude: number;
  properties: MapProperty[];
};

/**
 * Groups nearby properties into clusters.
 *
 * A simple grid rather than a distance-based algorithm: at map zooms the grid
 * cell *is* the visual distance, it runs in one pass over the points, and it
 * is stable — the same viewport always produces the same clusters, so markers
 * do not jitter between renders.
 */
export function clusterProperties(
  properties: MapProperty[],
  zoom: number,
): { clusters: Cluster[]; singles: MapProperty[] } {
  // Past this zoom the pins are far enough apart to stand alone.
  if (zoom >= 14 || properties.length <= 8) {
    return { clusters: [], singles: properties };
  }

  // Cell size shrinks as zoom grows, so clusters break apart naturally.
  const cell = 0.75 / Math.pow(2, zoom - 8);
  const grid = new Map<string, MapProperty[]>();

  for (const property of properties) {
    const key = `${Math.floor(property.latitude / cell)}:${Math.floor(
      property.longitude / cell,
    )}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(property);
    else grid.set(key, [property]);
  }

  const clusters: Cluster[] = [];
  const singles: MapProperty[] = [];

  for (const [key, bucket] of grid) {
    if (bucket.length === 1) {
      if (bucket[0]) singles.push(bucket[0]);
      continue;
    }
    // The centroid, so the bubble sits among its properties rather than on
    // the corner of an invisible grid cell.
    const longitude =
      bucket.reduce((sum, item) => sum + item.longitude, 0) / bucket.length;
    const latitude =
      bucket.reduce((sum, item) => sum + item.latitude, 0) / bucket.length;

    clusters.push({ id: key, longitude, latitude, properties: bucket });
  }

  return { clusters, singles };
}

export type LayerId =
  | "properties"
  | "projects"
  | "companies"
  | "professionals"
  | "suppliers"
  | "schools"
  | "hospitals"
  | "roads";

/**
 * The layer switcher's contents.
 *
 * `ready` marks what has data behind it today. The rest are listed because
 * they are the plan, and shown disabled rather than hidden so the roadmap is
 * visible instead of implied.
 */
export const MAP_LAYERS: {
  id: LayerId;
  label: string;
  colour: string;
  ready: boolean;
}[] = [
  { id: "properties", label: "Properties", colour: "#16a34a", ready: true },
  { id: "schools", label: "Schools", colour: "#3b82f6", ready: true },
  { id: "hospitals", label: "Hospitals", colour: "#ef4444", ready: true },
  { id: "projects", label: "Construction projects", colour: "#ea580c", ready: false },
  { id: "companies", label: "Companies", colour: "#9333ea", ready: false },
  { id: "professionals", label: "Professionals", colour: "#0891b2", ready: false },
  { id: "suppliers", label: "Material suppliers", colour: "#d4a017", ready: false },
  { id: "roads", label: "Roads", colour: "#64748b", ready: false },
];

export function listingKindLabel(kind: ListingKind): string {
  return kind === "rent" || kind === "lease" ? "For rent" : "For sale";
}
