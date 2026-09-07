"use client";

import { useEffect, useState } from "react";

import { DEFAULT_VALIDITY_DAYS, isPriceDataStatus, type PriceDataStatus } from "@/lib/prices/status";
import { createClient } from "@/lib/supabase/client";

/**
 * A current price from Medosha's price book, for a calculator to offer.
 *
 * ## What this is not
 *
 * It is not a source of prices. `material_prices` is, and it is filled by the
 * Price Exchange and by administrators. Nothing here invents a figure, and when
 * the book has nothing for a material the answer is nothing — the calculator
 * then asks the reader to type a price, which is what it does today.
 *
 * That distinction matters more than it looks. An estimate built on a made-up
 * rate is indistinguishable, on screen, from one built on a real quotation. The
 * only honest way to tell them apart is to refuse to supply the made-up one.
 *
 * ## Why the age comes back with it
 *
 * A price with no date is a rumour. `age_days` lets the caller say "collected
 * three days ago" or "collected last year, check before you rely on it", and
 * the reader decides. The 180-day validity window is the price book's own
 * (`DEFAULT_VALIDITY_DAYS`), not a second opinion invented here.
 */

export type CalculatorPrice = {
  price: number;
  currency: string;
  unit: string;
  material: string;
  city: string;
  supplier: string | null;
  verified: boolean;
  /** The price book's own trust level, for the label and its caveat. */
  dataStatus: PriceDataStatus;
  collectedAt: string;
  ageDays: number;
  /** Past the price book's validity window. Shown, but flagged. */
  stale: boolean;
};

export type PriceLookup =
  | { state: "asking" }
  | { state: "found"; price: CalculatorPrice }
  | { state: "none" }
  | { state: "unreachable" };

/**
 * Ask the price book once for one material.
 *
 * "none" and "unreachable" are deliberately different. The first means Medosha
 * genuinely has no price and the reader should type one; the second means we
 * could not ask. Collapsing them would tell somebody a price does not exist
 * when the truth is that the network is down.
 */
export function useMaterialPrice(materialKey: string | undefined, city: string): PriceLookup {
  // What came back, and what it was asked about. Holding the question with the
  // answer is what lets "still asking" be *derived* rather than set: if the
  // stored key is not the key being asked about now, the answer on hand is for
  // a different material and the honest state is "asking".
  //
  // The alternative — setting "asking" at the top of the effect — is a
  // synchronous setState in an effect body, which React 19 rejects and which
  // causes a second render before the request has even left.
  const [answered, setAnswered] = useState<{ key: string; city: string; result: PriceLookup } | null>(
    null,
  );

  useEffect(() => {
    if (!materialKey) return;

    let live = true;

    void (async () => {
      let result: PriceLookup;
      try {
        const { data, error } = await createClient().rpc("calculator_material_price", {
          p_material: materialKey,
          p_city: city,
        });
        if (error) {
          result = { state: "unreachable" };
        } else {
          const row = Array.isArray(data) ? data[0] : data;
          result = row
            ? {
                state: "found",
                price: {
                  price: Number(row.price),
                  currency: String(row.currency ?? "ETB"),
                  unit: String(row.unit ?? ""),
                  material: String(row.material ?? materialKey),
                  city: String(row.city_region ?? city),
                  supplier: row.supplier ? String(row.supplier) : null,
                  verified: Boolean(row.verified),
                  dataStatus: isPriceDataStatus(row.data_status) ? row.data_status : "supplier_submitted",
                  collectedAt: String(row.price_date),
                  ageDays: Number(row.age_days ?? 0),
                  stale: Number(row.age_days ?? 0) > DEFAULT_VALIDITY_DAYS,
                },
              }
            : { state: "none" };
        }
      } catch {
        result = { state: "unreachable" };
      }

      if (live) setAnswered({ key: materialKey, city, result });
    })();

    return () => {
      live = false;
    };
  }, [materialKey, city]);

  // No material to ask about is not a pending request; it is a settled "none".
  if (!materialKey) return { state: "none" };
  if (answered && answered.key === materialKey && answered.city === city) return answered.result;
  return { state: "asking" };
}

/** "collected today" / "collected 12 days ago" — the line under a price. */
export function collectedLabel(ageDays: number): string {
  if (ageDays <= 0) return "collected today";
  if (ageDays === 1) return "collected yesterday";
  if (ageDays < 30) return `collected ${ageDays} days ago`;
  if (ageDays < 365) return `collected ${Math.floor(ageDays / 30)} months ago`;
  return `collected over a year ago`;
}
