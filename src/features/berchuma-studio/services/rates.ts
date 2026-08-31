import "server-only";

import { createClient } from "@/lib/supabase/server";

import { BOARDS, EDGE_BANDS, HARDWARE } from "../types/catalogue";
import type { MarketRate } from "../types/cost";

/**
 * Live supplier prices for the things Berchuma builds with.
 *
 * This is the join that makes a Berchuma quote different from a spreadsheet:
 * every material in the catalogue carries a `priceKey`, and those keys are
 * matched against what suppliers are actually listing on Medosha's price
 * exchange this week. A design costed entirely from live listings reports 100%
 * confidence; one costed from the constants in `catalogue.ts` reports much
 * less, and says so on the panel.
 *
 * Nothing here throws. A price exchange that is empty, unreachable or not yet
 * seeded is a lower confidence number, not a broken studio — the fallback
 * rates are already in the catalogue for exactly this case.
 */

/** Every price key the cost engine might ask about. */
export function priceKeys(): string[] {
  return Array.from(
    new Set([
      ...BOARDS.map((board) => board.priceKey),
      ...EDGE_BANDS.map((band) => band.priceKey),
      ...HARDWARE.map((item) => item.priceKey),
    ]),
  );
}

export async function marketRates(): Promise<MarketRate[]> {
  const keys = priceKeys();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("price_listings")
      .select("id, item, unit, current_price, currency, updated_at")
      .in("item", keys)
      .eq("published", true)
      .eq("availability", "in_stock")
      .order("updated_at", { ascending: false });

    if (error || !data) return [];

    // Several suppliers list the same item. The ordering above puts the most
    // recently updated first and the map keeps that one, so a quote reflects
    // the freshest price rather than an arbitrary row — and never an average,
    // which would be a number no supplier will honour.
    const freshest = new Map<string, MarketRate>();
    for (const row of data) {
      const key = row.item.toLowerCase();
      if (freshest.has(key)) continue;
      freshest.set(key, {
        key: row.item,
        unit: row.unit,
        amount: Number(row.current_price),
        currency: row.currency,
        listingId: row.id,
      });
    }

    return Array.from(freshest.values());
  } catch {
    // Supabase unreachable. The studio still works; it just quotes from
    // catalogue constants and labels every line as an assumption.
    return [];
  }
}
