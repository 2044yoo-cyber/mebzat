/**
 * Location privacy, client side.
 *
 * The rules that decide what a viewer sees. Kept here rather than inline in
 * the map so the picker, the public panel and the badge cannot disagree about
 * what "approximate" means — a seller shown a 100m circle while the buyer is
 * shown a 500m one would be a broken promise, not a styling bug.
 */

export type LocationVisibility = "exact" | "approximate" | "neighbourhood";

export const VISIBILITY_OPTIONS: {
  value: LocationVisibility;
  label: string;
  blurb: string;
  recommended?: boolean;
}[] = [
  {
    value: "exact",
    label: "Exact Location",
    blurb:
      "Your pin is public. Buyers can navigate to the door before contacting you.",
  },
  {
    value: "approximate",
    label: "Approximate Area",
    blurb:
      "Buyers see a circle, not your pin. The property is somewhere inside it.",
    recommended: true,
  },
  {
    value: "neighbourhood",
    label: "Neighbourhood Only",
    blurb: "No map pin at all. Buyers see the area name and nothing more.",
  },
];

/** The radii offered. Anything else is refused by the database. */
export const PRIVACY_RADII = [50, 100, 250, 500, 1000] as const;
export type PrivacyRadius = (typeof PRIVACY_RADII)[number];

export const DEFAULT_RADIUS: PrivacyRadius = 100;

export function isPrivacyRadius(value: unknown): value is PrivacyRadius {
  return PRIVACY_RADII.includes(value as PrivacyRadius);
}

export function radiusLabel(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
}

/** Whether a circle should be drawn instead of a pin. */
export function showsCircle(
  visibility: LocationVisibility,
  isExact: boolean,
): boolean {
  return visibility === "approximate" && !isExact;
}

/** Whether any map should be drawn at all. */
export function showsMap(
  visibility: LocationVisibility,
  isExact: boolean,
): boolean {
  return isExact || visibility !== "neighbourhood";
}

// ---------------------------------------------------------------------------
// The quality badges
// ---------------------------------------------------------------------------

export type LocationBadge = {
  id: string;
  label: string;
  tone: "verified" | "approximate" | "hidden";
  title: string;
};

/**
 * What to tell the buyer about the location they are looking at.
 *
 * All three of the brief's badges, and they are not exclusive: a verified
 * listing shown as an area carries both, because "we checked this" and "we
 * are not showing you exactly where" are separate facts a buyer needs.
 */
export function locationBadges({
  visibility,
  verified,
  isExact,
}: {
  visibility: LocationVisibility;
  verified: boolean;
  isExact: boolean;
}): LocationBadge[] {
  const badges: LocationBadge[] = [];

  if (verified) {
    badges.push({
      id: "verified",
      label: "Verified Location",
      tone: "verified",
      title: "Medosha has checked this pin against the stated address.",
    });
  }

  if (visibility === "approximate" && !isExact) {
    badges.push({
      id: "approximate",
      label: "Approximate Location",
      tone: "approximate",
      title:
        "The circle contains the property. It is not centred on it.",
    });
    badges.push({
      id: "hidden",
      label: "Exact Location Hidden",
      tone: "hidden",
      title: "The seller reveals the address after accepting a viewing.",
    });
  }

  if (visibility === "neighbourhood" && !isExact) {
    badges.push({
      id: "hidden",
      label: "Exact Location Hidden",
      tone: "hidden",
      title: "This seller shares the area only.",
    });
  }

  if (isExact) {
    badges.push({
      id: "exact",
      label: "Exact Location",
      tone: "verified",
      title: "You can see this property's exact position.",
    });
  }

  return badges;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Metres between two points. Matches the SQL `distance_m`. */
export function distanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

export function formatDistance(metres: number): string {
  if (metres < 950) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(metres < 9500 ? 1 : 0)} km`;
}

/**
 * A circle as GeoJSON, for the map's fill layer.
 *
 * Drawn as a polygon rather than a styled circle marker because a circle
 * marker is sized in screen pixels: it would stay the same size as the user
 * zoomed, which would mean the area it claims to cover changes with the zoom
 * level. A polygon in real coordinates is the only honest way to draw "the
 * property is somewhere in here".
 */
export function circlePolygon(
  latitude: number,
  longitude: number,
  radiusMetres: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coordinates: [number, number][] = [];
  const latRadius = radiusMetres / 111_320;
  const lonRadius =
    radiusMetres / (111_320 * Math.cos((latitude * Math.PI) / 180));

  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * 2 * Math.PI;
    coordinates.push([
      longitude + lonRadius * Math.cos(angle),
      latitude + latRadius * Math.sin(angle),
    ]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

// ---------------------------------------------------------------------------
// Coordinates typed by hand
// ---------------------------------------------------------------------------

/**
 * Parses GPS coordinates out of whatever someone pasted.
 *
 * Accepts "9.0102, 38.7612", "9.0102 38.7612", and the `lat,lon` fragment of
 * a Google Maps URL, because that is what people actually have in the
 * clipboard when they know exactly where something is.
 */
export function parseCoordinates(
  input: string,
): { latitude: number; longitude: number } | null {
  const text = input.trim();

  // A Google Maps URL carries the pair after an @ or in a q= parameter.
  const fromUrl = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const pair = fromUrl
    ? [fromUrl[1], fromUrl[2]]
    : text.match(/^(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/)?.slice(1);

  if (!pair) return null;

  const latitude = Number(pair[0]);
  const longitude = Number(pair[1]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}
