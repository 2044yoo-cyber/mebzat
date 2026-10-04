import { NextResponse } from "next/server";

import { isConstructionStatus } from "@/lib/constants/properties";
import { getDevelopmentsInViewport } from "@/lib/data/buildings";

/**
 * Development pins for a map viewport.
 *
 * The same shape as /api/properties/viewport, and deliberately: the map calls
 * both on every pan and aborts the previous pair when the next begins, so a
 * second pattern here would be a second thing to get wrong on a slow
 * connection.
 *
 * It never returns a 5xx. The map treats a failed response as "no
 * developments", and a 500 would turn a layer that is not installed yet into a
 * scarier-looking outage than it is.
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const south = coord(searchParams.get("south"), 90);
  const north = coord(searchParams.get("north"), 90);
  const west = coord(searchParams.get("west"), 180);
  const east = coord(searchParams.get("east"), 180);

  // A half-formed box would be a full-table scan wearing a viewport's clothes.
  if (south === null || north === null || west === null || east === null) {
    return NextResponse.json({ developments: [], reason: "bad-bounds" });
  }

  const statuses = (searchParams.get("construction") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isConstructionStatus);

  try {
    const developments = await getDevelopmentsInViewport({
      south,
      west,
      north,
      east,
      statuses: statuses.length > 0 ? statuses : null,
    });
    return NextResponse.json(
      { developments },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[medosha:map] developments route failed:", error);
    return NextResponse.json({ developments: [], reason: "error" });
  }
}
