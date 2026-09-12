import {
  findNeighbourhood,
  scatterWithin,
} from "@/lib/location/addis-neighbourhoods";

/**
 * Where to draw a professional on a map, without knowing where they live.
 *
 * ## The privacy property is structural, not a rule
 *
 * `search_professionals` does not return `profiles.latitude` or
 * `profiles.longitude`. It cannot: they are not in its `returns table`. So
 * this module has no exact coordinate to leak even if it wanted one — every
 * point it produces comes from the *name* of an area somebody volunteered,
 * resolved through the gazetteer to a centroid good to about a kilometre.
 *
 * That is deliberate and worth keeping. A rule saying "do not plot the exact
 * pin" is a rule somebody breaks in six months by adding a column to a
 * `select`; a function that is never handed the pin cannot.
 *
 * ## Why the points are scattered
 *
 * Nine welders in Bole resolve to one centroid, and nine markers on one pixel
 * is one marker: the cluster never splits however far you zoom and eight of
 * them are unreachable. `scatterWithin` moves each a short, *deterministic*
 * distance inside the same area — deterministic so the map does not
 * rearrange itself on every render, and short enough that nobody drifts into
 * a neighbouring area and appears to work somewhere they did not say.
 *
 * This is not inventing a location. The coordinate was already the middle of
 * an area a kilometre across; moving it 150 m inside that area does not make
 * it less true, and it makes every marker clickable.
 */

export type MappableProfessional = {
  id: string;
  username: string | null;
  full_name: string | null;
  company_name: string | null;
  base_area: string | null;
  location_city: string | null;
  service_areas: string[];
  serves_entire_city: boolean;
};

export type ProfessionalPoint = {
  id: string;
  username: string | null;
  name: string;
  latitude: number;
  longitude: number;
  /** The area the point stands for, so the popup can name it honestly. */
  areaName: string;
  /** Whether this is where they are based or one of the places they work. */
  kind: "base" | "service";
};

/**
 * One point per professional, or none.
 *
 * None is a real answer and callers must handle it: somebody who has named no
 * area cannot be placed, and inventing a point for them would put a welder in
 * the middle of Addis Ababa who never said he worked there.
 */
export function mapPoints(
  people: MappableProfessional[],
): ProfessionalPoint[] {
  const points: ProfessionalPoint[] = [];

  for (const person of people) {
    // Their base first, because that is the single point that best stands for
    // one person. Failing that, the first area they said they work in.
    const candidates: { text: string; kind: "base" | "service" }[] = [];
    if (person.base_area) candidates.push({ text: person.base_area, kind: "base" });
    for (const area of person.service_areas) {
      candidates.push({ text: area, kind: "service" });
    }

    let placed: ProfessionalPoint | null = null;
    for (const candidate of candidates) {
      const place = findNeighbourhood(candidate.text);
      if (!place) continue;

      const scattered = scatterWithin(place, person.id);
      placed = {
        id: person.id,
        username: person.username,
        name:
          person.full_name ||
          person.company_name ||
          `@${person.username ?? ""}`,
        latitude: scattered.latitude,
        longitude: scattered.longitude,
        areaName: place.name,
        kind: candidate.kind,
      };
      break;
    }

    if (placed) points.push(placed);
  }

  return points;
}

/** A bounding box around the points, for fitting the map. Null when empty. */
export function boundsOf(
  points: ProfessionalPoint[],
): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;

  let west = points[0].longitude;
  let east = points[0].longitude;
  let south = points[0].latitude;
  let north = points[0].latitude;

  for (const point of points) {
    if (point.longitude < west) west = point.longitude;
    if (point.longitude > east) east = point.longitude;
    if (point.latitude < south) south = point.latitude;
    if (point.latitude > north) north = point.latitude;
  }

  return [
    [west, south],
    [east, north],
  ];
}
