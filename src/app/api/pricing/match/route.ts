import { NextResponse } from "next/server";

import { bookCandidates } from "@/lib/data/material-prices";
import { priceMaterials } from "@/lib/data/materials";
import { createClient } from "@/lib/supabase/server";

/**
 * Prices a bill against Medosha's own data.
 *
 * Two sources, and they answer different questions. The **marketplace** says
 * what a supplier is asking for a specific listing today. The **price book**
 * says what the material is worth as a reference — a figure an administrator
 * has stood behind, or a baseline nobody has yet. A bill wants both: the
 * listing when there is one, and the reference when there is not.
 *
 * Neither is allowed to become an AI guess. When both come back empty the line
 * keeps whatever rate it already had, and the response says how many lines that
 * happened to.
 *
 * The takeoff workspace parses and measures in the browser — no server needed,
 * and somebody's drawings never leave their machine. This is the one thing it
 * cannot do there: both sources are databases, and reaching them requires a
 * session.
 *
 * Costs no credits. Nothing here calls a model; it is a search and some
 * arithmetic, and charging for a price lookup would make people avoid the
 * feature that makes the estimate real.
 *
 * The response carries prices and product names only — never a supplier's
 * contact details, which belong on the listing page behind whatever rules that
 * page already applies.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A bill is long, but not unbounded. Forty lines is a house. */
const MAX_ITEMS = 200;

type Body = { items?: unknown };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to price against the marketplace." },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "No items were sent." }, { status: 400 });
  }

  const items = body.items
    .slice(0, MAX_ITEMS)
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const key = typeof item.key === "string" ? item.key : null;
      const description =
        typeof item.description === "string" ? item.description.slice(0, 300) : "";
      const unit = typeof item.unit === "string" ? item.unit.slice(0, 20) : "";
      return key && description && unit ? { key, description, unit } : null;
    })
    .filter((item): item is { key: string; description: string; unit: string } =>
      item !== null,
    );

  if (items.length === 0) {
    return NextResponse.json({ error: "No usable items." }, { status: 400 });
  }

  try {
    const priced = await priceMaterials(items);

    // The price book, one line at a time. Sequential for the same reason the
    // marketplace search is: forty concurrent queries to save a moment is how a
    // project gets rate-limited, and the book is cached per description inside
    // the lookup anyway.
    const book = new Map<string, Awaited<ReturnType<typeof bookCandidates>>>();
    for (const item of items) {
      if (book.has(item.key)) continue;
      book.set(item.key, await bookCandidates(item.description, item.unit));
    }

    return NextResponse.json({
      results: priced.map((entry) => ({
        key: entry.key,
        // Book first in the array purely for readability — `resolvePrice` ranks
        // by source, not by position, so a verified reference wins over a
        // marketplace average wherever it sits.
        candidates: [...(book.get(entry.key) ?? []), ...entry.candidates],
        message: entry.match.message,
        // The near misses, so somebody can pick one by hand rather than being
        // told only that nothing matched.
        alternatives: entry.match.matches.slice(0, 5).map((match) => ({
          id: match.candidate.id,
          title: match.candidate.title,
          price: match.candidate.price,
          unit: match.candidate.unit,
          currency: match.candidate.currency ?? "ETB",
          supplier: match.candidate.supplier ?? null,
          score: match.score,
          usable: match.usable,
        })),
      })),
    });
  } catch (error) {
    console.error("[pricing] marketplace match failed:", error);
    return NextResponse.json(
      { error: "The marketplace could not be reached. Rates are unchanged." },
      { status: 503 },
    );
  }
}
