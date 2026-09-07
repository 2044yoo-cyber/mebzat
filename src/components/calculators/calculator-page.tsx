"use client";

import Link from "next/link";

import { PencilRuler, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { BoqCalculator } from "./boq-calculator";
import { CalculatorForm } from "./calculator-form";
import { MaterialsCalculator } from "./materials-calculator";
import { UnitConverter } from "./unit-converter";
import { calculatorBySlug } from "@/lib/calculators/registry";
import { studioLinkFor } from "@/lib/calculators/studio";
import { useFavourites, useRecents } from "@/lib/calculators/storage";

/**
 * One calculator, wired up.
 *
 * The spec is looked up here rather than passed in from the server page,
 * because a spec contains its `compute` function and functions do not survive
 * the server-to-client boundary. The slug is the handle; the registry is
 * compiled into both bundles.
 */
export function CalculatorPage({ slug }: { slug: string }) {
  const spec = calculatorBySlug(slug);
  const { favourites, toggle } = useFavourites();
  const { remember } = useRecents();

  if (!spec) return null;

  const starred = favourites.includes(spec.slug);
  const studio = studioLinkFor(spec.slug);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => toggle(spec.slug)}
          aria-pressed={starred}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
            starred ? "border-amber-500/40 bg-amber-500/10" : "hover:bg-muted",
          )}
        >
          <Star className={cn("size-4", starred && "fill-amber-400 text-amber-500")} />
          {starred ? "In my calculators" : "Add to my calculators"}
        </button>

        {studio && (
          <Link
            href={studio.href}
            className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <PencilRuler className="size-4" />
            Open in Design Studio
          </Link>
        )}
      </div>

      {spec.custom === "boq" ? (
        <BoqCalculator />
      ) : spec.custom === "materials" ? (
        <MaterialsCalculator />
      ) : spec.custom === "converter" ? (
        <UnitConverter />
      ) : (
        <CalculatorForm
          spec={spec}
          onCalculated={({ headline }) =>
            remember({ slug: spec.slug, title: spec.title.replace(" Calculator", ""), headline })
          }
        />
      )}
    </div>
  );
}
