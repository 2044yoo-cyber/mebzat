/**
 * Where Addis Ababa's neighbourhoods are, approximately.
 *
 * A gazetteer, not a geocoder. Each entry is a hand-placed centroid for a named
 * area — good to roughly a kilometre, which is what "somewhere in Bole" is worth
 * and no more. Nothing here locates a building.
 *
 * ## Why a table rather than a geocoding call
 *
 * A geocoding API would return a confident point for anything, including a
 * misspelling and a name that is not a place. That confidence is the problem:
 * the failure mode of this module has to be *no answer*, because a property
 * pinned somewhere wrong is worse than a property with no pin. A fixed table
 * can only answer for names somebody checked.
 *
 * It is also free, offline, and identical on every run — which matters for a
 * seed that has to be reproducible.
 *
 * ## Accuracy is a property of the coordinate, not of the privacy setting
 *
 * `properties.location_visibility` already says what a *viewer* is shown, and
 * `approximate` there means "we know where it is and are choosing to blur it".
 * That is a different fact from this one, which is "nobody ever knew the
 * building". A seller can have an exact pin and choose to publish a circle; a
 * demo listing has no exact pin to publish. Both facts are needed, so they are
 * stored separately as `location_accuracy` and `location_visibility`.
 */

export type Neighbourhood = {
  /** The canonical name, as it should be displayed. */
  name: string;
  latitude: number;
  longitude: number;
  /** The sub-city it sits in, where that is unambiguous. */
  subCity?: string;
};

/**
 * Keyed by the lowercased name. Coordinates are decimal degrees, WGS 84.
 *
 * Ordered roughly by how often the name appears in listings rather than
 * alphabetically, because the matcher below prefers the longest match and it is
 * easier to see that "bole medhanialem" precedes "bole" when they sit together.
 */
const GAZETTEER: Neighbourhood[] = [
  // --- Bole and its named pockets -----------------------------------------
  // Listed before the bare "Bole" so a longer name wins; see `bestMatch`.
  { name: "Bole Medhanialem", latitude: 9.0107, longitude: 38.7817, subCity: "Bole" },
  { name: "Bole Atlas", latitude: 9.008, longitude: 38.776, subCity: "Bole" },
  { name: "Bole Wollo Sefer", latitude: 8.9968, longitude: 38.769, subCity: "Bole" },
  { name: "Bole Bulbula", latitude: 8.956, longitude: 38.786, subCity: "Bole" },
  { name: "Bole Japan", latitude: 8.993, longitude: 38.794, subCity: "Bole" },
  { name: "Bole Edna Mall", latitude: 9.006, longitude: 38.787, subCity: "Bole" },
  { name: "Bole Imperial", latitude: 9.018, longitude: 38.796, subCity: "Bole" },
  { name: "Bole Denbel", latitude: 9.003, longitude: 38.776, subCity: "Bole" },
  { name: "Bole", latitude: 9.01, longitude: 38.78, subCity: "Bole" },

  // --- East ----------------------------------------------------------------
  { name: "Gerji Imperial", latitude: 9.018, longitude: 38.808, subCity: "Bole" },
  { name: "Gerji", latitude: 9.013, longitude: 38.808, subCity: "Bole" },
  { name: "CMC", latitude: 9.029, longitude: 38.821, subCity: "Bole" },
  { name: "Summit by Cambridge", latitude: 9.012, longitude: 38.852, subCity: "Bole" },
  { name: "Summit", latitude: 9.009, longitude: 38.848, subCity: "Bole" },
  { name: "Ayat", latitude: 9.03, longitude: 38.87, subCity: "Yeka" },
  { name: "Kotebe", latitude: 9.032, longitude: 38.858, subCity: "Yeka" },
  { name: "Wossen", latitude: 9.023, longitude: 38.833, subCity: "Bole" },
  { name: "Shola", latitude: 9.028, longitude: 38.805, subCity: "Yeka" },
  { name: "Megenagna", latitude: 9.02, longitude: 38.799, subCity: "Yeka" },
  { name: "Laga Tafo", latitude: 9.053, longitude: 38.92, subCity: "Oromia (Legetafo)" },
  { name: "22 Area", latitude: 9.018, longitude: 38.788, subCity: "Yeka" },

  // --- Centre --------------------------------------------------------------
  { name: "Kazanchis", latitude: 9.014, longitude: 38.766, subCity: "Kirkos" },
  { name: "Meskel Flower", latitude: 8.993, longitude: 38.762, subCity: "Kirkos" },
  { name: "Kebena", latitude: 9.027, longitude: 38.786, subCity: "Yeka" },
  { name: "Ferensay", latitude: 9.047, longitude: 38.776, subCity: "Gulele" },
  { name: "Addisu Gebeya", latitude: 9.045, longitude: 38.742, subCity: "Gulele" },

  // --- South and west ------------------------------------------------------
  { name: "Sarbet", latitude: 8.993, longitude: 38.748, subCity: "Nifas Silk-Lafto" },
  { name: "Gofa", latitude: 8.984, longitude: 38.742, subCity: "Nifas Silk-Lafto" },
  { name: "Lebu Haile Garment", latitude: 8.963, longitude: 38.718, subCity: "Nifas Silk-Lafto" },
  { name: "Lebu", latitude: 8.955, longitude: 38.71, subCity: "Nifas Silk-Lafto" },
  { name: "Alem Bank", latitude: 8.988, longitude: 38.69, subCity: "Kolfe Keranyo" },
  { name: "Kolfe Keranyo", latitude: 9.025, longitude: 38.69, subCity: "Kolfe Keranyo" },
  { name: "Abinet", latitude: 9.006, longitude: 38.728, subCity: "Addis Ketema" },

  // --- Added for the rental dataset ---------------------------------------
  // Sub-city names (Kirkos, Lideta, Yeka, Nifas Silk-Lafto) sit here beside
  // neighbourhood names because listings use both, and a renter typing
  // "Yeka" means the district. Their centroids are correspondingly rougher
  // than a landmark's — which is what `approximate` already says.
  { name: "Old Airport", latitude: 8.995, longitude: 38.73, subCity: "Nifas Silk-Lafto" },
  { name: "Nifas Silk-Lafto", latitude: 8.97, longitude: 38.73, subCity: "Nifas Silk-Lafto" },
  { name: "Gotera", latitude: 8.993, longitude: 38.757, subCity: "Kirkos" },
  { name: "Kirkos", latitude: 9.006, longitude: 38.7565, subCity: "Kirkos" },
  { name: "Lideta", latitude: 9.01, longitude: 38.737, subCity: "Lideta" },
  { name: "Mexico", latitude: 9.006, longitude: 38.744, subCity: "Kirkos" },
  { name: "Urael", latitude: 9.0085, longitude: 38.7705, subCity: "Bole" },
  { name: "Yeka", latitude: 9.04, longitude: 38.8, subCity: "Yeka" },
];

/**
 * Alternative spellings seen in real listings.
 *
 * Ethiopian place names are transliterated inconsistently — the same district
 * is written Kazanchis and Kasanchis by two agents on the same street. Mapping
 * them here rather than adding near-duplicate gazetteer rows keeps one
 * canonical coordinate per place, so two spellings cannot drift apart.
 */
const ALIASES: Record<string, string> = {
  kasanchis: "Kazanchis",
  kazanchise: "Kazanchis",
  "haya hulet": "22 Area",
  hayahulet: "22 Area",
  "22 mazoria": "22 Area",
  legetafo: "Laga Tafo",
  "lege tafo": "Laga Tafo",
  "laga tafo abakiros": "Laga Tafo",
  bulbula: "Bole Bulbula",
  medhanialem: "Bole Medhanialem",
  "wollo sefer": "Bole Wollo Sefer",
  cmc: "CMC",
  "haile garment": "Lebu Haile Garment",
};

/** Lowercased, punctuation flattened, so "Summit Condo, Bole" can be searched. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The neighbourhood a location string names, or null.
 *
 * Null is a real answer and callers must handle it. A property whose area
 * cannot be identified belongs in the list without a pin — inventing a
 * coordinate to avoid an empty map is how a buyer drives to the wrong side of
 * the city.
 *
 * ## Longest match wins
 *
 * "Summit Condo, Bole" contains both "Summit" and "Bole". Both are real places
 * several kilometres apart, and the more specific one is the one the writer
 * meant — a name is qualified by its neighbours, not by the district it sits
 * in. So candidates are ranked by the length of the matched name, and "Bole
 * Medhanialem" beats "Bole" on the same string for the same reason.
 */
export function findNeighbourhood(location: string): Neighbourhood | null {
  const text = normalise(location);
  if (!text) return null;

  // An alias is an exact statement about the whole string or a phrase inside
  // it, so it is checked before the gazetteer and by length for the same
  // reason.
  let best: Neighbourhood | null = null;
  let bestLength = 0;

  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (alias.length > bestLength && text.includes(alias)) {
      const target = GAZETTEER.find((entry) => entry.name === canonical);
      if (target) {
        best = target;
        bestLength = alias.length;
      }
    }
  }

  for (const entry of GAZETTEER) {
    const name = normalise(entry.name);
    if (name.length > bestLength && text.includes(name)) {
      best = entry;
      bestLength = name.length;
    }
  }

  return best;
}

/** Every name the gazetteer knows, for a check script or an admin screen. */
export function knownNeighbourhoods(): readonly Neighbourhood[] {
  return GAZETTEER;
}

/**
 * Spreads several properties across the area they share.
 *
 * Three listings in Bole all resolve to one centroid, and three markers on one
 * pixel is one marker: the cluster never splits however far you zoom, and two
 * of the three are unreachable. So each is offset within the neighbourhood by a
 * small amount derived from its own key.
 *
 * This is not inventing a location. The coordinate was already the centre of an
 * area a kilometre across and labelled `approximate`; moving it 300 m inside
 * that same area does not make it less true, and it makes every property
 * clickable. What it must never do is drift far enough to suggest a different
 * neighbourhood, which is why the radius is well under the spacing between
 * gazetteer entries.
 *
 * Deterministic, from a hash of the key: the same property lands in the same
 * place on every run, so a re-seed does not shuffle the map and a screenshot
 * taken today still matches tomorrow.
 */
export function scatterWithin(
  place: Neighbourhood,
  key: string,
  // 150 m, not 350. The closest pair of *unrelated* entries in the gazetteer is
  // Bole Imperial and Megenagna, 398 m apart, so anything above ~199 m could
  // carry a property nearer the wrong area's centre than its own. Sub-areas
  // sitting inside their parent — Bole Medhanialem inside Bole — are closer
  // still and do not constrain this: overlapping with the district you are in
  // is not an error.
  radiusMetres = 150,
): { latitude: number; longitude: number } {
  // FNV-1a. Small, fast, and stable across platforms — `Math.random` would
  // move every pin on every run, and a string's `hashCode` is not a thing here.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  // Two independent values from the one hash: the angle, and the square root of
  // the radius fraction. The square root matters — using the fraction directly
  // piles points towards the centre, because area grows with r².
  const angle = ((hash & 0xffff) / 0x10000) * Math.PI * 2;
  const distance = Math.sqrt(((hash >>> 16) & 0xffff) / 0x10000) * radiusMetres;

  // Metres to degrees. Latitude is very nearly constant; longitude shrinks with
  // the cosine of the latitude, which at 9°N is a 1.2% correction — small, but
  // free to get right.
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLon =
    111_320 * Math.cos((place.latitude * Math.PI) / 180);

  return {
    latitude:
      Math.round(
        (place.latitude + (distance * Math.sin(angle)) / metresPerDegreeLat) *
          1e6,
      ) / 1e6,
    longitude:
      Math.round(
        (place.longitude + (distance * Math.cos(angle)) / metresPerDegreeLon) *
          1e6,
      ) / 1e6,
  };
}

/**
 * How precise a stored coordinate is.
 *
 * `exact` — somebody placed the pin on the building.
 * `approximate` — the pin is a named area's centroid. Off by up to a kilometre.
 * `unknown` — no coordinate at all.
 */
export const LOCATION_ACCURACIES = ["exact", "approximate", "unknown"] as const;
export type LocationAccuracy = (typeof LOCATION_ACCURACIES)[number];

export function isLocationAccuracy(value: unknown): value is LocationAccuracy {
  return (
    typeof value === "string" &&
    (LOCATION_ACCURACIES as readonly string[]).includes(value)
  );
}

/** What to tell somebody looking at a pin that is not a building. */
export const APPROXIMATE_NOTE =
  "Approximate location — this marker shows the general area, not the exact property.";
