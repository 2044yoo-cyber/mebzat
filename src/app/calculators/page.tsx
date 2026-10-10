import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CalculatorHub } from "@/components/calculators/calculator-hub";
import { CALCULATORS } from "@/lib/calculators/registry";

export const metadata: Metadata = {
  title: "Construction Calculators",
  description:
    "Fast, practical calculators for construction, architecture, materials and furniture — concrete, rebar, blocks, tile, paint, roofing, cut lists and cost. Free, and they work offline.",
  alternates: { canonical: "/calculators" },
};

/**
 * The hub.
 *
 * Static: the catalogue is compiled in, so this page has nothing to fetch and
 * no reason to be dynamic. Search, favourites and recents all happen in the
 * browser on top of it.
 */
export default function CalculatorsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Construction Calculators</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Fast, practical calculators for construction, architecture, materials, and furniture.
        </p>
        <Link
          href="/build-intelligence"
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Build Intelligence: costs, materials and house planning
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          {CALCULATORS.length} calculators. All free, no sign-in needed, and the arithmetic runs on your
          device.
        </p>
      </header>

      <CalculatorHub />
    </div>
  );
}
