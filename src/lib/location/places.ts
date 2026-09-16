/**
 * Every place somebody can say they are in, or will work in.
 *
 * ## Why this is not `addis-neighbourhoods.ts`
 *
 * That module is a *pin source*: its job is to turn a listing's free-text
 * location into a coordinate for the map, and it carries invariants that come
 * from that job — the longest-match rule, and a minimum spacing between
 * unrelated entries that `scatterWithin`'s radius is derived from. It is also
 * mirrored by a Python seed generator, name for name.
 *
 * A directory somebody types into wants the opposite properties. It wants to be
 * long, to include places no listing will ever be pinned to, to include whole
 * cities and regions, and to grow whenever a name is missing — none of which a
 * pin source can absorb without either loosening the spacing rule or dragging
 * the seed generator along behind it.
 *
 * So there are two lists, and this one is a superset: every neighbourhood the
 * gazetteer knows is here, by import rather than by copy, and the additions
 * below are the ones that only ever needed a name. `scripts/places_check.ts`
 * asserts the inclusion, so a neighbourhood added for the map appears here for
 * free and a name cannot exist in one list with different spelling in the
 * other.
 *
 * ## Coordinates
 *
 * Approximate centroids, good to about a kilometre, on the same terms as the
 * gazetteer: nothing here locates a building. They are here because the
 * travel-radius match in `search_professionals` is a distance comparison.
 */

import { knownNeighbourhoods } from "@/lib/location/addis-neighbourhoods";

export const PLACE_KINDS = ["area", "city", "region"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export type Place = {
  /** Stable, lowercase, hyphenated. This is what `location_areas.slug` holds. */
  slug: string;
  name: string;
  kind: PlaceKind;
  /** Sub-city for an Addis area, region for a city, null for a region itself. */
  parent: string | null;
  city: string;
  region: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  /** Spellings seen in the wild. Searched, never displayed. */
  aliases?: string[];
};

const COUNTRY = "Ethiopia";
const ADDIS = "Addis Ababa";

/**
 * Addis areas the map never needed a pin for.
 *
 * Ayertena is the one that started this: it is a real, busy part of Kolfe
 * Keranyo, it was in neither list, and somebody who lives there had no way to
 * say so. The rest are the names that came up alongside it — the sub-cities
 * themselves, the western and southern expansion the condominium programme
 * created, and the central landmarks people give as their address.
 */
const EXTRA_AREAS: {
  name: string;
  subCity: string;
  latitude: number;
  longitude: number;
  aliases?: string[];
}[] = [
  // --- West: Kolfe Keranyo and the Ayertena side ---------------------------
  { name: "Ayertena", subCity: "Kolfe Keranyo", latitude: 8.9895, longitude: 38.6935, aliases: ["ayer tena", "ayat tena", "ayertana"] },
  { name: "Winget", subCity: "Kolfe Keranyo", latitude: 9.0195, longitude: 38.7055, aliases: ["wingate"] },
  { name: "Betel", subCity: "Kolfe Keranyo", latitude: 9.0005, longitude: 38.6805, aliases: ["bethel"] },
  { name: "Asko", subCity: "Gulele", latitude: 9.0655, longitude: 38.7055 },
  { name: "Mebrat Hail", subCity: "Kolfe Keranyo", latitude: 9.0105, longitude: 38.6985 },

  // --- North: Gulele and Entoto -------------------------------------------
  { name: "Shiro Meda", subCity: "Gulele", latitude: 9.0555, longitude: 38.7625, aliases: ["shiromeda"] },
  { name: "Entoto", subCity: "Gulele", latitude: 9.0905, longitude: 38.7705 },
  { name: "Gulele", subCity: "Gulele", latitude: 9.0555, longitude: 38.7455 },

  // --- Centre: Arada and Addis Ketema -------------------------------------
  { name: "Piassa", subCity: "Arada", latitude: 9.0355, longitude: 38.7515, aliases: ["piazza", "piasa"] },
  { name: "Arat Kilo", subCity: "Arada", latitude: 9.0365, longitude: 38.7635, aliases: ["4 kilo", "aratkilo"] },
  { name: "Sidist Kilo", subCity: "Arada", latitude: 9.0435, longitude: 38.7635, aliases: ["6 kilo", "sidistkilo"] },
  { name: "Arada", subCity: "Arada", latitude: 9.0335, longitude: 38.7555 },
  { name: "Merkato", subCity: "Addis Ketema", latitude: 9.0335, longitude: 38.7355, aliases: ["mercato"] },
  { name: "Addis Ketema", subCity: "Addis Ketema", latitude: 9.0365, longitude: 38.7305 },
  { name: "Autobis Tera", subCity: "Addis Ketema", latitude: 9.0285, longitude: 38.7355, aliases: ["autobus tera"] },
  { name: "Tekle Haimanot", subCity: "Addis Ketema", latitude: 9.0255, longitude: 38.7425, aliases: ["teklehaimanot"] },

  // --- Centre: Kirkos and Lideta ------------------------------------------
  { name: "Kera", subCity: "Kirkos", latitude: 8.9985, longitude: 38.7525 },
  { name: "Legehar", subCity: "Kirkos", latitude: 9.0125, longitude: 38.7485, aliases: ["la gare", "legahar"] },
  { name: "Stadium", subCity: "Kirkos", latitude: 9.0085, longitude: 38.7575 },
  { name: "Senga Tera", subCity: "Lideta", latitude: 9.0135, longitude: 38.7355, aliases: ["sengatera"] },

  // --- East: Yeka, Bole and Lemi Kura -------------------------------------
  { name: "Gurd Shola", subCity: "Bole", latitude: 9.0185, longitude: 38.8055, aliases: ["gurdshola", "gerd shola"] },
  { name: "Gerji Mebrat Hail", subCity: "Bole", latitude: 9.0155, longitude: 38.8155 },
  { name: "Signal", subCity: "Bole", latitude: 9.0045, longitude: 38.8005 },
  { name: "Goro", subCity: "Bole", latitude: 8.9905, longitude: 38.8205 },
  { name: "Semit", subCity: "Bole", latitude: 9.0305, longitude: 38.8355, aliases: ["summit semit"] },
  { name: "Lamberet", subCity: "Yeka", latitude: 9.0355, longitude: 38.8105 },
  { name: "Hayat", subCity: "Yeka", latitude: 9.0255, longitude: 38.8305 },
  { name: "Kara", subCity: "Yeka", latitude: 9.0455, longitude: 38.8305, aliases: ["kara kore"] },
  { name: "Ayat Adebabay", subCity: "Yeka", latitude: 9.0325, longitude: 38.8765 },
  { name: "Lemi Kura", subCity: "Lemi Kura", latitude: 9.0205, longitude: 38.8405, aliases: ["lemikura"] },
  { name: "Bole Arabsa", subCity: "Lemi Kura", latitude: 9.0105, longitude: 38.8805, aliases: ["arabsa"] },

  // --- South: Nifas Silk-Lafto and Akaki Kality ---------------------------
  { name: "Tor Hailoch", subCity: "Nifas Silk-Lafto", latitude: 9.0005, longitude: 38.7155, aliases: ["torhailoch"] },
  { name: "Jemo", subCity: "Nifas Silk-Lafto", latitude: 8.9555, longitude: 38.6905 },
  { name: "Saris", subCity: "Nifas Silk-Lafto", latitude: 8.9605, longitude: 38.7505, aliases: ["saris abo"] },
  { name: "Bisrate Gabriel", subCity: "Nifas Silk-Lafto", latitude: 8.9905, longitude: 38.7405, aliases: ["bisrate gebriel"] },
  { name: "Hana Mariam", subCity: "Nifas Silk-Lafto", latitude: 8.9405, longitude: 38.7205 },
  { name: "Repi", subCity: "Nifas Silk-Lafto", latitude: 8.9705, longitude: 38.7005, aliases: ["reppi"] },
  { name: "Total", subCity: "Nifas Silk-Lafto", latitude: 8.9705, longitude: 38.7205 },
  { name: "Furi", subCity: "Nifas Silk-Lafto", latitude: 8.9305, longitude: 38.6905 },
  { name: "Kality", subCity: "Akaki Kality", latitude: 8.9005, longitude: 38.7705, aliases: ["kaliti"] },
  { name: "Akaki Kality", subCity: "Akaki Kality", latitude: 8.8905, longitude: 38.7805, aliases: ["akaky kaliti", "akaki"] },
  { name: "Tulu Dimtu", subCity: "Akaki Kality", latitude: 8.9005, longitude: 38.8105 },
  { name: "Koye Feche", subCity: "Akaki Kality", latitude: 8.8905, longitude: 38.8305, aliases: ["koyefeche"] },
  { name: "Gelan", subCity: "Akaki Kality", latitude: 8.8705, longitude: 38.8005, aliases: ["gelan condominium"] },
];

/**
 * Ethiopian cities and towns.
 *
 * Every one of these is somewhere a carpenter or a contractor works, and until
 * now none of them could be typed into a profile. Region names use the current
 * federal set — Sidama, Central Ethiopia and South Ethiopia are their own
 * regions, not SNNPR.
 */
const CITIES: {
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  aliases?: string[];
}[] = [
  { name: "Addis Ababa", region: "Addis Ababa", latitude: 9.0192, longitude: 38.7525, aliases: ["addis abeba", "finfinne", "adis ababa"] },
  { name: "Adama", region: "Oromia", latitude: 8.54, longitude: 39.2675, aliases: ["nazret", "nazareth"] },
  { name: "Adigrat", region: "Tigray", latitude: 14.2769, longitude: 39.4625 },
  { name: "Aksum", region: "Tigray", latitude: 14.1211, longitude: 38.7248, aliases: ["axum"] },
  { name: "Ambo", region: "Oromia", latitude: 8.9833, longitude: 37.85 },
  { name: "Arba Minch", region: "South Ethiopia", latitude: 6.0333, longitude: 37.55, aliases: ["arbaminch"] },
  { name: "Asella", region: "Oromia", latitude: 7.95, longitude: 39.1333, aliases: ["assela"] },
  { name: "Assosa", region: "Benishangul-Gumuz", latitude: 10.0683, longitude: 34.5306, aliases: ["asosa"] },
  { name: "Bahir Dar", region: "Amhara", latitude: 11.5936, longitude: 37.3908, aliases: ["bahirdar", "bahar dar"] },
  { name: "Batu", region: "Oromia", latitude: 7.9333, longitude: 38.7167, aliases: ["ziway", "zeway"] },
  { name: "Bishoftu", region: "Oromia", latitude: 8.7517, longitude: 38.9789, aliases: ["debre zeit", "debrezeit"] },
  { name: "Bonga", region: "South West Ethiopia", latitude: 7.2833, longitude: 36.2333 },
  { name: "Bule Hora", region: "Oromia", latitude: 5.5833, longitude: 38.25 },
  { name: "Burayu", region: "Oromia", latitude: 9.0667, longitude: 38.65, aliases: ["burayyu"] },
  { name: "Butajira", region: "Central Ethiopia", latitude: 8.1167, longitude: 38.3667 },
  { name: "Debre Birhan", region: "Amhara", latitude: 9.6797, longitude: 39.5322, aliases: ["debre berhan"] },
  { name: "Debre Markos", region: "Amhara", latitude: 10.3333, longitude: 37.7167 },
  { name: "Dessie", region: "Amhara", latitude: 11.1333, longitude: 39.6333, aliases: ["dese"] },
  { name: "Dilla", region: "South Ethiopia", latitude: 6.4167, longitude: 38.3167 },
  { name: "Dire Dawa", region: "Dire Dawa", latitude: 9.5931, longitude: 41.8661, aliases: ["diredawa"] },
  { name: "Durame", region: "Central Ethiopia", latitude: 7.2333, longitude: 37.8833 },
  { name: "Gambela", region: "Gambela", latitude: 8.25, longitude: 34.5833, aliases: ["gambella"] },
  { name: "Goba", region: "Oromia", latitude: 7.0167, longitude: 39.9833 },
  { name: "Gondar", region: "Amhara", latitude: 12.6, longitude: 37.4667, aliases: ["gonder"] },
  { name: "Harar", region: "Harari", latitude: 9.3111, longitude: 42.1181 },
  { name: "Hawassa", region: "Sidama", latitude: 7.0622, longitude: 38.4764, aliases: ["awassa", "awasa"] },
  { name: "Holeta", region: "Oromia", latitude: 9.0583, longitude: 38.5028, aliases: ["holota"] },
  { name: "Hosaena", region: "Central Ethiopia", latitude: 7.55, longitude: 37.85, aliases: ["hosanna", "hossana"] },
  { name: "Jijiga", region: "Somali", latitude: 9.35, longitude: 42.8, aliases: ["jigjiga"] },
  { name: "Jimma", region: "Oromia", latitude: 7.6667, longitude: 36.8333, aliases: ["jima"] },
  { name: "Kombolcha", region: "Amhara", latitude: 11.0833, longitude: 39.7333 },
  { name: "Mekelle", region: "Tigray", latitude: 13.4967, longitude: 39.4753, aliases: ["mekele", "makale"] },
  { name: "Metu", region: "Oromia", latitude: 8.3, longitude: 35.5833, aliases: ["mettu"] },
  { name: "Mizan Teferi", region: "South West Ethiopia", latitude: 6.9833, longitude: 35.5833 },
  { name: "Moyale", region: "Oromia", latitude: 3.5333, longitude: 39.05 },
  { name: "Negele Borena", region: "Oromia", latitude: 5.3333, longitude: 39.5833, aliases: ["negelle"] },
  { name: "Nekemte", region: "Oromia", latitude: 9.0833, longitude: 36.55, aliases: ["neqemte"] },
  { name: "Robe", region: "Oromia", latitude: 7.1167, longitude: 40.0, aliases: ["bale robe"] },
  { name: "Sebeta", region: "Oromia", latitude: 8.9167, longitude: 38.6167, aliases: ["sebata"] },
  { name: "Semera", region: "Afar", latitude: 11.7947, longitude: 41.0092 },
  { name: "Shashamane", region: "Oromia", latitude: 7.2, longitude: 38.6, aliases: ["shashemene"] },
  { name: "Shire", region: "Tigray", latitude: 14.1, longitude: 38.2833, aliases: ["shire endaselassie"] },
  { name: "Sodo", region: "South Ethiopia", latitude: 6.8558, longitude: 37.7625, aliases: ["wolaita sodo", "welayta sodo"] },
  { name: "Weldiya", region: "Amhara", latitude: 11.8333, longitude: 39.6, aliases: ["woldia", "woldiya"] },
  { name: "Welkite", region: "Central Ethiopia", latitude: 8.2833, longitude: 37.7833, aliases: ["wolkite"] },
  { name: "Werabe", region: "Central Ethiopia", latitude: 7.8667, longitude: 38.1, aliases: ["worabe"] },
  { name: "Woliso", region: "Oromia", latitude: 8.5333, longitude: 37.9667, aliases: ["waliso", "wolisso"] },
  { name: "Yirgalem", region: "Sidama", latitude: 6.75, longitude: 38.4167 },
];

/**
 * The regions, as of the 2023 federal arrangement.
 *
 * Searchable and selectable as a base location — somebody genuinely based in a
 * town this list has not reached should be able to say "Amhara" rather than
 * nothing. Deliberately *not* offered as a service area: an area is somewhere
 * you would travel to for one job, and a region is not that.
 */
const REGIONS: { name: string; aliases?: string[] }[] = [
  { name: "Addis Ababa" },
  { name: "Afar" },
  { name: "Amhara" },
  { name: "Benishangul-Gumuz", aliases: ["benishangul gumuz", "beneshangul"] },
  { name: "Central Ethiopia" },
  { name: "Dire Dawa" },
  { name: "Gambela", aliases: ["gambella"] },
  { name: "Harari" },
  { name: "Oromia", aliases: ["oromiya"] },
  { name: "Sidama" },
  { name: "Somali" },
  { name: "South Ethiopia" },
  { name: "South West Ethiopia", aliases: ["south west ethiopia peoples"] },
  { name: "Tigray" },
];

/**
 * Spellings for the places that come in from the pin gazetteer.
 *
 * They live here rather than there because the gazetteer's own alias table is
 * a matcher input — it exists to resolve a listing's free text to a pin — and
 * these are search hints for a person typing. Same words, different job, and
 * merging them would mean one of the two lists had to grow entries the other
 * has no use for.
 */
const AREA_ALIASES: Record<string, string[]> = {
  "Laga Tafo": ["legetafo", "lege tafo", "laga tafo abakiros"],
  Kazanchis: ["kasanchis", "kazanchise"],
  "22 Area": ["haya hulet", "hayahulet", "22 mazoria"],
  "Bole Bulbula": ["bulbula"],
  "Bole Medhanialem": ["medhanialem"],
  "Bole Wollo Sefer": ["wollo sefer"],
  "Lebu Haile Garment": ["haile garment"],
};

export function placeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildPlaces(): Place[] {
  const places: Place[] = [];

  for (const area of knownNeighbourhoods()) {
    places.push({
      slug: placeSlug(area.name),
      name: area.name,
      kind: "area",
      parent: area.subCity ?? null,
      city: ADDIS,
      region: ADDIS,
      country: COUNTRY,
      latitude: area.latitude,
      longitude: area.longitude,
      aliases: AREA_ALIASES[area.name],
    });
  }

  for (const area of EXTRA_AREAS) {
    places.push({
      slug: placeSlug(area.name),
      name: area.name,
      kind: "area",
      parent: area.subCity,
      city: ADDIS,
      region: ADDIS,
      country: COUNTRY,
      latitude: area.latitude,
      longitude: area.longitude,
      aliases: area.aliases,
    });
  }

  for (const city of CITIES) {
    places.push({
      slug: placeSlug(city.name),
      name: city.name,
      kind: "city",
      parent: city.region,
      city: city.name,
      region: city.region,
      country: COUNTRY,
      latitude: city.latitude,
      longitude: city.longitude,
      aliases: city.aliases,
    });
  }

  // Addis Ababa, Dire Dawa and Gambela are each a city and a region with the
  // same name. Both rows would be true and the picker would show the name
  // twice, which reads as a bug whatever the constitution says — so the city
  // row wins, and it already carries the region in `region`.
  const cityNames = new Set(CITIES.map((city) => city.name));

  for (const region of REGIONS) {
    if (cityNames.has(region.name)) continue;
    places.push({
      slug: `region-${placeSlug(region.name)}`,
      name: region.name,
      kind: "region",
      parent: null,
      city: region.name,
      region: region.name,
      country: COUNTRY,
      latitude: null,
      longitude: null,
      aliases: region.aliases,
    });
  }

  // Alphabetical, once, here — so no caller has to remember to sort and no two
  // callers can disagree about the order. `localeCompare` rather than `<`,
  // because "Ayat Adebabay" and "Ayertena" sort differently under the two and
  // the locale-aware answer is the one a reader expects.
  return places.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every place, alphabetical by name. */
export const PLACES: readonly Place[] = buildPlaces();

/** The places that can be a service area: everywhere but a whole region. */
export const SERVICE_AREA_PLACES: readonly Place[] = PLACES.filter(
  (place) => place.kind !== "region",
);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * How well a place answers what was typed. Lower is better; -1 is no answer.
 *
 * The tiers exist because a plain `includes` and an alphabetical sort put
 * "Akaki Kality" above "Arat Kilo" for the query "ki", and above "Kality" for
 * the query "kality" — neither of which is what somebody typing those letters
 * means. Three tiers, and the query has to reach one of them:
 *
 *   0  the whole name
 *   1  the start of the name, or the start of a word inside it
 *   2  anywhere in the name
 *   3  the sub-city or region it belongs to
 *
 * An alias is scored on the same three tiers as a name, because an alias *is*
 * the name — "Nazret" and "Debre Zeit" are not weaker evidence about Adama and
 * Bishoftu than the spellings this list happens to file them under. Giving
 * them a tier of their own meant one that nothing could reach, which is the
 * same as not having it.
 *
 * "Start of the name" and "start of a word in it" are one tier for the same
 * reason: for a single-word query the first implies the second, so splitting
 * them left the finer of the two unreachable.
 *
 * Every candidate tier is computed and the best kept, rather than returning at
 * the first hit. Returning early means the order the checks are *written* in
 * decides the answer, and it already did once: a name that merely contained
 * the query beat an exact alias.
 */
function rank(place: Place, query: string): number {
  let best = -1;
  const keep = (tier: number) => {
    if (best === -1 || tier < best) best = tier;
  };

  for (const spelling of [place.name, ...(place.aliases ?? [])]) {
    const text = normalise(spelling);
    if (text === query) keep(0);
    else if (
      text.startsWith(query) ||
      text.split(" ").some((word) => word.startsWith(query))
    ) {
      keep(1);
    } else if (text.includes(query)) keep(2);
  }

  // The sub-city or region, so typing "Yeka" finds Lamberet — below everything
  // actually called Yeka, and below anything with those letters in its name.
  if (normalise(place.parent ?? "").includes(query)) keep(3);

  return best;
}

/**
 * The places that match what somebody has typed so far.
 *
 * An empty query is not an error and does not mean "nothing": it means the
 * list has not been narrowed yet, so it returns the head of the alphabetical
 * list. A picker that goes blank until the first keystroke gives no clue that
 * there is anything to pick.
 */
export function searchPlaces(
  query: string,
  { limit = 20, kinds }: { limit?: number; kinds?: readonly PlaceKind[] } = {},
): Place[] {
  const pool = kinds
    ? PLACES.filter((place) => kinds.includes(place.kind))
    : PLACES;

  const text = normalise(query);
  if (!text) return pool.slice(0, limit);

  const scored: { place: Place; rank: number }[] = [];
  for (const place of pool) {
    const score = rank(place, text);
    if (score >= 0) scored.push({ place, rank: score });
  }

  // `PLACES` is already alphabetical and `sort` is stable, so ties come back in
  // alphabetical order without a second comparison.
  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, limit).map((entry) => entry.place);
}

/** The place with this exact name, or null. Case- and spelling-tolerant. */
export function findPlace(name: string): Place | null {
  const text = normalise(name);
  if (!text) return null;
  return (
    PLACES.find((place) => normalise(place.name) === text) ??
    PLACES.find((place) =>
      (place.aliases ?? []).some((alias) => normalise(alias) === text),
    ) ??
    null
  );
}

/**
 * Whether a typed location is one somebody could plausibly mean.
 *
 * The brief asks for a place that is not in the list to be addable, which is
 * right — the list will always be missing somewhere. What it must not become
 * is a free-text field under a different name, so a name has to look like a
 * name: letters, some length, not a sentence.
 */
export function isPlausiblePlace(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (!/[a-zA-Zሀ-፿]/.test(trimmed)) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N}\s'’\-.,/()]*$/u.test(trimmed);
}
