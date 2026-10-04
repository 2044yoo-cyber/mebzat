import { NextResponse } from "next/server";

import { normalizeQuery, searchSuggestions } from "@/lib/data/search";

/**
 * Typeahead endpoint for the global search box.
 *
 * A route rather than a server action because it is called on every keystroke:
 * actions serialise behind the router and a stale one cannot be abandoned,
 * while a fetch can be cancelled by an AbortController when the next character
 * arrives.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = normalizeQuery(searchParams.get("q"));

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchSuggestions(q, 8);

  return NextResponse.json(
    { results },
    {
      // Short enough that a new listing shows up quickly, long enough that
      // holding a key down does not hit the database on every repeat.
      headers: { "Cache-Control": "private, max-age=10" },
    },
  );
}
