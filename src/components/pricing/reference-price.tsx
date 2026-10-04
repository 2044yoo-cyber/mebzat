import { BookOpen, ShieldCheck } from "lucide-react";

import type { ReferencePrice } from "@/lib/data/price-book";

/**
 * What Medosha's own price book says, beside what a supplier is asking.
 *
 * The Price Exchange shows bids. A bid is what one supplier wants today, which
 * is a useful fact and not the same fact as what a material costs — and
 * somebody looking at ETB 1,850 for a bag of cement cannot tell whether that is
 * fair without the second number. Medosha has had the second number since the
 * workbook was imported and has never shown it to anybody.
 *
 * ## Why the status is on the face of it
 *
 * The book holds an administrator's verified figure and a teaching baseline
 * from the seed in the same table, and they are not the same claim. Rendering
 * them identically would turn 439 unreviewed planning numbers into what look
 * like Medosha's official prices — which is worse than showing nothing, because
 * a blank invites a question and a confident wrong number does not.
 */
export function ReferencePriceNote({
  reference,
  listingPrice,
}: {
  reference: ReferencePrice;
  /** The asking price, when there is one to compare against. */
  listingPrice?: number;
}) {
  const money = (value: number) =>
    `ETB ${Math.round(value).toLocaleString("en-US")}`;

  /**
   * How the asking price sits against the reference.
   *
   * Stated as a percentage and a direction, never as a verdict. "38% above the
   * reference" is a fact the reader can weigh; "overpriced" is a judgement
   * Medosha is not entitled to make about a supplier whose costs it does not
   * know.
   */
  const difference =
    listingPrice && reference.priceEtb > 0
      ? Math.round(((listingPrice - reference.priceEtb) / reference.priceEtb) * 100)
      : null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        {reference.verified ? (
          <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden />
        ) : (
          <BookOpen className="size-3.5 text-muted-foreground" aria-hidden />
        )}
        Medosha reference price
      </p>

      <p className="mt-1.5 text-base font-semibold tabular-nums">
        {money(reference.priceEtb)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          per {reference.unit}
        </span>
      </p>

      <p className="mt-0.5 text-xs text-muted-foreground">
        {reference.material}
        {reference.specification ? ` · ${reference.specification}` : ""}
        {reference.brand ? ` · ${reference.brand}` : ""} · {reference.region}
      </p>

      {difference !== null && Math.abs(difference) >= 2 ? (
        <p className="mt-1.5 text-xs">
          This listing is{" "}
          <span className="font-medium tabular-nums">
            {Math.abs(difference)}%{" "}
            {difference > 0 ? "above" : "below"}
          </span>{" "}
          the reference.
        </p>
      ) : null}

      {/*
        The provenance line. Never omitted, and never softened: a member who
        acts on one of these should know whether a person checked it.
      */}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {statusNote(reference)}
      </p>
    </div>
  );
}

function statusNote(reference: ReferencePrice): string {
  const when = new Date(reference.priceDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  switch (reference.status) {
    case "admin_verified":
      return `Verified by Medosha · ${when}`;
    case "supplier_submitted":
      return `Submitted by a supplier, not yet verified · ${when}`;
    case "web_sourced":
      return `Read from a published source, not yet verified · ${when}`;
    case "educational_estimate":
      // The one that most needs saying. These came from the seed workbook as
      // planning baselines and are not market prices.
      return `Planning baseline only — not a market price · ${when}`;
    case "expired":
      return `Out of date · last recorded ${when}`;
  }
}
