import { NextResponse } from "next/server";

import { parseCoordinates } from "@/lib/location/privacy";
import { createClient } from "@/lib/supabase/server";

/**
 * Location autocomplete.
 *
 * Matches cities, sub cities, neighbourhoods and landmarks, and understands a
 * pasted coordinate pair — a seller who knows exactly where their plot is
 * usually has the numbers, not a name anybody has heard of.
 *
 * Neighbourhood results are the centroid of the *published* points of the
 * listings in them, never of the real ones, so this endpoint cannot be used to
 * find a single hidden property by searching for its street.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type LocationHit = {
  kind:
    | "city"
    | "sub_city"
    | "neighbourhood"
    | "street"
    | "building"
    | "landmark"
    | "coordinates";
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
  city: string | null;
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) return NextResponse.json({ results: [] });

  const results: LocationHit[] = [];

  // A pasted coordinate pair is an answer, not a search term.
  const coordinates = parseCoordinates(query);
  if (coordinates) {
    results.push({
      kind: "coordinates",
      label: `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`,
      detail: "GPS coordinates",
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      city: null,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_locations", {
    query,
    max_results: 12,
  });

  if (error) {
    // A dead search box must not take the form down with it: the seller can
    // still drag the pin and type the city by hand.
    console.error("[medosha:locations] search failed:", error.message);
    return NextResponse.json({ results, degraded: true });
  }

  for (const row of data ?? []) {
    results.push({
      kind: row.kind as LocationHit["kind"],
      label: row.label,
      detail: row.detail,
      latitude: row.latitude,
      longitude: row.longitude,
      city: row.city,
    });
  }

  return NextResponse.json(
    { results },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}
