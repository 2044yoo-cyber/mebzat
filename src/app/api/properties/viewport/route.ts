import { NextResponse } from "next/server";

import { getPropertiesInViewport } from "@/lib/data/properties";
import { isListingKind, isPropertyType } from "@/lib/constants/properties";
import type { ListingKind, PropertyType } from "@/types/database.types";

/**
 * Property pins for a map viewport.
 *
 * A route rather than a server action because the map calls it on every pan
 * and needs to abort the previous request when the next one starts.
 *
 * It never returns a 5xx. The map treats a failed response as "no listings",
 * and a 500 would only turn a missing table into a scarier-looking outage than
 * it is — so an unexpected error comes back as an empty, well-formed result
 * with a reason attached.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parses a bound, refusing anything that is not a real coordinate. */
function coord(value: string | null, limit: number): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) return null;
  return parsed;
}

function positiveNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const south = coord(searchParams.get("south"), 90);
    const north = coord(searchParams.get("north"), 90);
    const west = coord(searchParams.get("west"), 180);
    const east = coord(searchParams.get("east"), 180);

    if (south === null || north === null || west === null || east === null) {
      return NextResponse.json(
        { properties: [], error: "Invalid viewport" },
        { status: 400 },
      );
    }

    const types = (searchParams.get("types")?.split(",") ?? []).filter(
      isPropertyType,
    ) as PropertyType[];
    const kinds = (searchParams.get("kinds")?.split(",") ?? []).filter(
      isListingKind,
    ) as ListingKind[];

    const { properties, available } = await getPropertiesInViewport(
      // A map crossing the antimeridian would send west > east; clamping keeps
      // the query sane rather than returning nothing.
      {
        south: Math.min(south, north),
        north: Math.max(south, north),
        west: Math.min(west, east),
        east: Math.max(west, east),
      },
      {
        types: types.length ? types : undefined,
        kinds: kinds.length ? kinds : undefined,
        minPrice: positiveNumber(searchParams.get("minPrice")),
        maxPrice: positiveNumber(searchParams.get("maxPrice")),
        minBedrooms: positiveNumber(searchParams.get("minBedrooms")),
        minArea: positiveNumber(searchParams.get("minArea")),
        floors: positiveNumber(searchParams.get("floors")),
      },
    );

    return NextResponse.json(
      {
        properties,
        // False when migration 0017 has not been applied. The map shows an
        // empty state rather than treating it as a network failure.
        available,
      },
      { headers: { "Cache-Control": "private, max-age=15" } },
    );
  } catch (error) {
    // Reaching here means Supabase itself was unreachable or misconfigured.
    console.error("[medosha:api] viewport failed:", error);
    return NextResponse.json({
      properties: [],
      available: false,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}
