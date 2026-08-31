import "server-only";

import { findNeighbourhood, knownNeighbourhoods } from "@/lib/location/addis-neighbourhoods";
import { getProperty, getProperties } from "@/lib/data/properties";
import { createClient } from "@/lib/supabase/server";
import { parsePropertyQuery, type PropertyQuery } from "./property-query";
import type { ListingKind } from "@/types/database.types";

/**
 * The property side of Medosha AI's grounding.
 *
 * Same contract as the price book: the model is never asked what is for sale
 * in Bole, it is handed the rows and told they are the only listings that
 * exist. A model that invents a property invents an address, a price and a
 * phone number, and somebody drives across Addis to a house that is not there.
 *
 * ## Not the whole database
 *
 * Every function here is bounded — a row cap, a column list, and a filter
 * derived from the question. The largest thing this module will ever put in a
 * prompt is twelve listings. Sending the properties table to Grok would cost
 * more per question than the answer is worth and would still be worse, because
 * the model would have to do the filtering that Postgres has an index for.
 *
 * ## The rows are the map's rows
 *
 * `matches` carries coordinates so the chat can hand the map the same listings
 * it just described. They are the existing `properties` rows read through the
 * existing data layer — no second table, no copy, no separate rental store.
 */

/** Listings per answer. Enough to compare, few enough to stay cheap. */
const ROW_LIMIT = 12;

/** What the map needs to highlight a listing the chat mentioned. */
export type ListingPin = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  price: number | null;
  currency: string;
  pricePeriod: string | null;
  listingKind: ListingKind;
  bedrooms: number | null;
  neighbourhood: string | null;
  href: string;
  /** Demo seed data. The map already badges these; the answer should too. */
  isSample: boolean;
};

export type PropertyContext = {
  /** The block appended to the prompt. Empty when nothing matched. */
  text: string;
  /** The same listings, for the map. Never longer than `text` describes. */
  pins: ListingPin[];
  /** How the question was read, for the "I searched for X" line. */
  query: PropertyQuery;
};

const EMPTY: PropertyContext = {
  text: "",
  pins: [],
  query: {
    kind: null,
    bedrooms: null,
    minPrice: null,
    maxPrice: null,
    place: null,
    terms: [],
    matched: false,
  },
};

/** Gazetteer names, so the parser matches the same places the map pins. */
function placeNames(): string[] {
  return knownNeighbourhoods().map((entry) => entry.name);
}

function money(price: number | null, currency: string, period: string | null) {
  if (price === null) return "price on request";
  return `${currency} ${price.toLocaleString("en-US")}${period ? ` per ${period}` : ""}`;
}

/**
 * Searches listings for a question.
 *
 * `kinds` is decided by the parser rather than by the caller, so one function
 * serves "show me apartments" and "find rentals" — a rental is a property with
 * `listing_kind = 'rent'`, which is what the schema has always said, and
 * splitting them into two code paths is how a second rental marketplace gets
 * built by accident.
 */
export async function searchListings(
  question: string,
  options: { limit?: number; kind?: "rent" | "sale" } = {},
): Promise<PropertyContext> {
  const query = parsePropertyQuery(question, placeNames());

  const kind = options.kind ?? query.kind;
  const kinds: ListingKind[] | undefined =
    kind === "rent"
      ? (["rent", "lease"] as ListingKind[])
      : kind === "sale"
        ? (["sale", "auction"] as ListingKind[])
        : undefined;

  // The place goes in as a text term rather than as a coordinate box: the
  // gazetteer's position is where the neighbourhood *is*, and a listing is
  // tagged with the neighbourhood's name. Matching the name finds the listings
  // somebody meant; matching a radius finds whatever happens to be within it.
  const searchText = [query.place, ...query.terms].filter(Boolean).join(" ");

  const { properties, available } = await getProperties({
    q: searchText || undefined,
    filters: {
      kinds,
      minPrice: query.minPrice ?? undefined,
      maxPrice: query.maxPrice ?? undefined,
      minBedrooms: query.bedrooms ?? undefined,
    },
    // Cheapest first when somebody asked for the cheapest, newest otherwise.
    sort: /cheap|lowest|affordable|ርካሽ/i.test(question) ? "cheapest" : "newest",
    pageSize: options.limit ?? ROW_LIMIT,
  });

  if (!available) {
    // An unreachable table is not an empty table. Saying "no listings match"
    // here would be a confident statement about rows nobody read.
    return {
      ...EMPTY,
      query,
      text: [
        "PROPERTY LISTINGS",
        "The property database could not be reached for this question.",
        "Say that Medosha's listings are temporarily unavailable and that you cannot search them right now. Do not describe any property from general knowledge.",
      ].join("\n"),
    };
  }

  if (properties.length === 0) {
    return {
      ...EMPTY,
      query,
      text: [
        "PROPERTY LISTINGS",
        `No listing in Medosha's database matches this search (${describe(query)}).`,
        "Say plainly that nothing currently matches, and say what was searched for so the user can widen it. Never invent a property, an address, a price or a contact.",
      ].join("\n"),
    };
  }

  const pins: ListingPin[] = [];
  const lines: string[] = [];

  for (const property of properties) {
    // `getProperty`/`getProperties` already redact a hidden exact position, so
    // whatever arrives here is what a visitor is allowed to see.
    const latitude = property.display_latitude ?? property.latitude;
    const longitude = property.display_longitude ?? property.longitude;

    pins.push({
      id: property.id,
      title: property.title,
      latitude,
      longitude,
      price: property.price,
      currency: property.currency,
      pricePeriod: property.price_period,
      listingKind: property.listing_kind,
      bedrooms: property.bedrooms,
      neighbourhood: property.neighbourhood,
      href: `/property/${property.id}`,
      isSample: property.is_sample,
    });

    lines.push(
      `- ${property.title}` +
        ` | ${property.listing_kind}` +
        ` | ${money(property.price, property.currency, property.price_period)}` +
        ` | ${property.bedrooms ?? "?"} bed, ${property.bathrooms ?? "?"} bath` +
        ` | ${property.area_m2 ? `${property.area_m2} m²` : "area n/a"}` +
        ` | ${property.property_type}` +
        ` | area: ${property.neighbourhood ?? property.sub_city ?? property.location_city ?? "n/a"}` +
        (property.parking_spaces !== null
          ? ` | parking: ${property.parking_spaces}`
          : "") +
        (property.furnishing ? ` | ${property.furnishing}` : "") +
        (property.is_sample ? " | DEMO LISTING" : "") +
        ` | path: /property/${property.id}`,
    );
  }

  return {
    query,
    pins,
    text: [
      "PROPERTY LISTINGS",
      `Retrieved from Medosha's live database for this question (${describe(query)}).`,
      "These are the only listings that exist for this search. Never add one, and never change a price or a location.",
      "",
      ...lines,
      "",
      pins.some((pin) => pin.isSample)
        ? "Some rows are marked DEMO LISTING. Say so when you cite one — they are sample data, not a real property for sale."
        : "",
      "Link each listing you mention using its path.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** The search, in words, so the answer can say what was actually looked for. */
function describe(query: PropertyQuery): string {
  const parts = [
    query.kind ? `for ${query.kind}` : null,
    query.bedrooms !== null ? `${query.bedrooms}+ bedrooms` : null,
    query.place,
    query.maxPrice !== null ? `up to ETB ${query.maxPrice.toLocaleString("en-US")}` : null,
    query.minPrice !== null ? `from ETB ${query.minPrice.toLocaleString("en-US")}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "no filters recognised";
}

/**
 * One listing, in full, for the page the user is looking at.
 *
 * This is what makes "does this house have parking?" answerable. Without it
 * the model has the conversation and no idea which property it is about, and
 * the honest answer to every question on a property page would be "which one?"
 *
 * The id comes from the server component that rendered the page, never from
 * the message — a member could otherwise type an id and read a listing the
 * page would not have shown them. It still goes through `getProperty`, so RLS
 * and the location redaction both apply.
 */
export async function propertyPageContext(
  propertyId: string,
): Promise<PropertyContext> {
  const property = await getProperty(propertyId);
  if (!property) return EMPTY;

  const latitude = property.display_latitude ?? property.latitude;
  const longitude = property.display_longitude ?? property.longitude;

  const amenities =
    property.amenities.length > 0 ? property.amenities.join(", ") : "none listed";

  // Absent is said out loud rather than omitted. "Parking: not stated" is a
  // true answer to "does it have parking"; silence invites the model to guess.
  const lines = [
    `- Title: ${property.title}`,
    `- Listing: ${property.listing_kind} | ${property.property_type} | status ${property.status}`,
    `- Price: ${money(property.price, property.currency, property.price_period)}` +
      (property.price_negotiable ? " (negotiable)" : ""),
    `- Bedrooms: ${property.bedrooms ?? "not stated"}`,
    `- Bathrooms: ${property.bathrooms ?? "not stated"}`,
    `- Floor area: ${property.area_m2 ? `${property.area_m2} m²` : "not stated"}`,
    `- Plot area: ${property.plot_area_m2 ? `${property.plot_area_m2} m²` : "not stated"}`,
    `- Parking spaces: ${property.parking_spaces ?? "not stated"}`,
    `- Furnishing: ${property.furnishing ?? "not stated"}`,
    `- Year built: ${property.year_built ?? "not stated"}`,
    `- Floors: ${property.floors ?? "not stated"}` +
      (property.floor_number !== null ? ` | on floor ${property.floor_number}` : ""),
    `- Amenities: ${amenities}`,
    `- Area: ${property.neighbourhood ?? "not stated"}` +
      (property.sub_city ? ` (${property.sub_city} sub-city)` : "") +
      ` | ${property.location_city ?? "not stated"}`,
    `- Available from: ${property.available_from ?? "not stated"}`,
    `- Seller: ${property.seller_kind ?? "not stated"}` +
      (property.owner?.full_name ? ` | ${property.owner.full_name}` : "") +
      (property.company?.name ? ` | ${property.company.name}` : ""),
    `- Verified listing: ${property.listing_verified ? "yes" : "no"}`,
    property.is_sample ? "- THIS IS A DEMO LISTING, not a real property." : "",
    `- Path: /property/${property.id}`,
    property.description
      ? `- Description: ${property.description.slice(0, 600)}`
      : "- Description: not provided",
  ].filter(Boolean);

  return {
    query: { ...EMPTY.query, place: property.neighbourhood },
    pins: [
      {
        id: property.id,
        title: property.title,
        latitude,
        longitude,
        price: property.price,
        currency: property.currency,
        pricePeriod: property.price_period,
        listingKind: property.listing_kind,
        bedrooms: property.bedrooms,
        neighbourhood: property.neighbourhood,
        href: `/property/${property.id}`,
        isSample: property.is_sample,
      },
    ],
    text: [
      "THE PROPERTY THE USER IS LOOKING AT",
      "This is the listing currently open on the user's screen. When they say \"this property\", \"this house\" or \"it\", they mean this one.",
      "",
      ...lines,
      "",
      "Answer from these fields only. Where a field says \"not stated\", say that the listing does not state it — do not infer it from the photographs, the price or the neighbourhood, and do not guess.",
    ].join("\n"),
  };
}

/**
 * Listings near a place, for "which properties are near CMC?".
 *
 * The gazetteer resolves the name to a position and the viewport function does
 * the rest, so this uses the same index the map pans against. A place the
 * gazetteer does not know returns nothing rather than a guess — inventing a
 * position for an unknown neighbourhood puts pins in the wrong part of Addis,
 * which is the failure `0043` was written to prevent.
 */
export async function nearbyListings(
  place: string,
  options: { radiusKm?: number; limit?: number } = {},
): Promise<PropertyContext> {
  const found = findNeighbourhood(place);
  if (!found) {
    return {
      ...EMPTY,
      text: [
        "NEARBY PROPERTIES",
        `Medosha's gazetteer does not hold a position for "${place}".`,
        "Say you do not have a mapped location for that area, and offer to search by name instead. Do not estimate where it is.",
      ].join("\n"),
    };
  }

  const radiusKm = options.radiusKm ?? 2.5;
  // Degrees per kilometre at this latitude. Longitude shrinks with the cosine;
  // at 9°N that is a 1.2% correction, which is smaller than the neighbourhood
  // itself — but it is one line, and a box that is wrong in one axis returns a
  // lopsided set of listings.
  const latitudeSpan = radiusKm / 111;
  const longitudeSpan =
    radiusKm / (111 * Math.cos((found.latitude * Math.PI) / 180));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("properties_in_viewport", {
    south: found.latitude - latitudeSpan,
    west: found.longitude - longitudeSpan,
    north: found.latitude + latitudeSpan,
    east: found.longitude + longitudeSpan,
    types: null,
    kinds: null,
    min_price: null,
    max_price: null,
    min_bedrooms: null,
    min_area: null,
    max_results: options.limit ?? ROW_LIMIT,
  });

  if (error) {
    return {
      ...EMPTY,
      text: [
        "NEARBY PROPERTIES",
        "The property database could not be reached for this question.",
        "Say that Medosha's listings are temporarily unavailable right now.",
      ].join("\n"),
    };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      ...EMPTY,
      text: [
        "NEARBY PROPERTIES",
        `No listing is currently within ${radiusKm} km of ${found.name}.`,
        "Say so plainly. Do not widen the search silently and do not invent a listing.",
      ].join("\n"),
    };
  }

  const pins: ListingPin[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    latitude: row.latitude,
    longitude: row.longitude,
    price: row.price,
    currency: row.currency,
    pricePeriod: row.price_period,
    listingKind: row.listing_kind,
    bedrooms: row.bedrooms,
    neighbourhood: row.neighbourhood,
    href: `/property/${row.id}`,
    isSample: row.is_sample,
  }));

  return {
    query: { ...EMPTY.query, place: found.name, matched: true },
    pins,
    text: [
      "NEARBY PROPERTIES",
      `Listings within ${radiusKm} km of ${found.name}, from Medosha's live database.`,
      "",
      ...rows.map(
        (row) =>
          `- ${row.title}` +
          ` | ${row.listing_kind}` +
          ` | ${money(row.price, row.currency, row.price_period)}` +
          ` | ${row.bedrooms ?? "?"} bed` +
          ` | area: ${row.neighbourhood ?? "n/a"}` +
          (row.is_sample ? " | DEMO LISTING" : "") +
          ` | path: /property/${row.id}`,
      ),
    ].join("\n"),
  };
}

/**
 * Agents and agencies, for "who should I call about Bole?".
 *
 * Read from `profiles` — the same rows the member directory shows — rather
 * than from a table of agents that does not exist. An agent on Medosha is a
 * profile that lists property, and the count is what makes the answer useful:
 * "twelve listings in Bole" is a reason to call somebody and "estate agent" is
 * not.
 */
export async function searchAgents(
  question: string,
  limit = 8,
): Promise<{ text: string }> {
  const supabase = await createClient();
  const query = parsePropertyQuery(question, placeNames());

  let builder = supabase
    .from("profiles")
    .select(
      "id, full_name, username, company_name, location_city, phone, verification_status, account_type",
    )
    .not("username", "is", null)
    .limit(limit);

  // Narrowed by place when one was named, because "an agent in Addis" is every
  // agent and helps nobody.
  if (query.place) {
    builder = builder.or(
      `location_city.ilike.%${query.place}%,company_name.ilike.%${query.place}%`,
    );
  }

  const { data, error } = await builder;

  if (error) {
    return {
      text: [
        "PROPERTY AGENTS",
        "The member directory could not be reached for this question.",
        "Say so. Do not name an agent from general knowledge.",
      ].join("\n"),
    };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      text: [
        "PROPERTY AGENTS",
        "No Medosha member matches this search.",
        "Say so plainly, and suggest browsing /property to contact listing owners directly. Never invent an agent, a phone number or an agency.",
      ].join("\n"),
    };
  }

  return {
    text: [
      "PROPERTY AGENTS",
      "Medosha members who list property. This is the only source for names and contacts.",
      "",
      ...rows.map(
        (row) =>
          `- ${row.full_name ?? row.username}` +
          (row.company_name ? ` | ${row.company_name}` : "") +
          ` | ${row.account_type ?? "member"}` +
          ` | city: ${row.location_city ?? "n/a"}` +
          ` | ${row.verification_status}` +
          ` | path: /u/${row.username}`,
      ),
      "",
      "Never publish a phone number that is not shown on the member's own page. Link to the profile path instead.",
    ].join("\n"),
  };
}
