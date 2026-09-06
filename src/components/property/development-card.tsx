"use client";

import Link from "next/link";
import { ArrowRight, Building2, X } from "lucide-react";

import {
  CONSTRUCTION_STATUS,
  isPropertyType,
  PROPERTY_TYPE,
  shortPrice,
} from "@/lib/constants/properties";
import { DEVELOPMENT_COLOUR, type MapDevelopment } from "@/lib/map/markers";
import { cn } from "@/lib/utils";

/**
 * What a development is, once its pin has been tapped.
 *
 * One component for both sizes rather than a sheet and a card that drift
 * apart. Below `sm` it is anchored to the bottom edge and full width, which is
 * where a thumb is; from `sm` up it floats in the map's bottom-left corner at
 * a fixed width. The content is identical — a phone reader is not owed less of
 * the answer than somebody at a desk.
 *
 * Tapping the pin opens this rather than navigating. Somebody comparing four
 * towers should be able to look at four of them without four page loads and
 * four presses of the back button, which is the entire argument for a card.
 * "View project" is there for when they have chosen.
 *
 * Nothing here is invented. Every line is a column of `buildings` or a count
 * over its listed units, and a field the database has no answer for is left
 * out rather than filled with a dash — a row of dashes reads as a broken card,
 * not as an honest one.
 */
export function DevelopmentCard({
  development,
  onClose,
}: {
  development: MapDevelopment;
  onClose: () => void;
}) {
  const status = CONSTRUCTION_STATUS[development.constructionStatus]?.label;
  // Narrowed rather than cast: building_type is a text column as far as the
  // viewport function's row shape is concerned, and a value the enum does not
  // have should read as "no type" rather than as undefined.label.
  const type = isPropertyType(development.buildingType)
    ? PROPERTY_TYPE[development.buildingType].label
    : null;
  const where =
    development.neighbourhood ?? development.subCity ?? development.address;

  const facts: { label: string; value: string }[] = [];
  if (development.totalUnits) {
    facts.push({ label: "Units", value: String(development.totalUnits) });
  }
  if (development.floors) {
    facts.push({ label: "Floors", value: String(development.floors) });
  }
  if (development.priceFrom !== null) {
    facts.push({ label: "From", value: shortPrice(development.priceFrom, "ETB", null) });
  }
  if (
    development.completionPercent !== null &&
    development.completionPercent > 0 &&
    development.completionPercent < 100
  ) {
    facts.push({ label: "Built", value: `${development.completionPercent}%` });
  }

  return (
    <div
      role="dialog"
      aria-label={development.name ?? "Development"}
      className={cn(
        "absolute z-20 rounded-2xl border bg-background/95 shadow-2xl backdrop-blur",
        // A thumb's reach on a phone, the map's corner on a desktop. The
        // bottom inset clears the phone's navigation bar, which is fixed.
        "inset-x-2 bottom-2 sm:inset-x-auto sm:right-auto sm:bottom-3 sm:left-3 sm:w-[300px]",
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: DEVELOPMENT_COLOUR }}
          aria-hidden
        >
          <Building2 className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {development.name ?? "New project"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[type, where].filter(Boolean).join(" · ") || "New project"}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 pb-2 text-xs sm:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">
                {fact.label}
              </dt>
              <dd className="truncate font-medium tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {[status, development.developer].filter(Boolean).join(" · ") || " "}
        </span>
        <Link
          href={`/building/${development.code ?? development.id}`}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          View project
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
