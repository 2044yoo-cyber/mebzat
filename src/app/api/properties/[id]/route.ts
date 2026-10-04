import { NextResponse } from "next/server";

import {
  getNearbyPlaces,
  getProperty,
  getPropertyMedia,
} from "@/lib/data/properties";

/**
 * Everything the side panel needs for one property, in one request.
 *
 * The panel opens over a live map, so it cannot navigate — it fetches. One
 * endpoint rather than three, because three round trips to fill one panel is
 * three chances for it to appear in pieces.
 *
 * Like the viewport route, it never returns 5xx: a panel that says "could not
 * load" is better than one that throws behind a map the user is still using.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    // A malformed id would otherwise reach Postgres and error there.
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const property = await getProperty(id);
    if (!property) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Media and nearby places are decoration: the panel is useful without
    // them, so a failure in either returns empty rather than failing the call.
    const [media, nearby] = await Promise.all([
      getPropertyMedia(id).catch(() => []),
      getNearbyPlaces(id, 2).catch(() => []),
    ]);

    return NextResponse.json(
      { property, media, nearby },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (error) {
    console.error("[medosha:api] property detail failed:", error);
    return NextResponse.json({
      property: null,
      media: [],
      nearby: [],
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}
