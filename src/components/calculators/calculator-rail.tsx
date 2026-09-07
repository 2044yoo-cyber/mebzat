import Link from "next/link";

import { ArrowRight, Calculator } from "lucide-react";

import { popularCalculators } from "@/lib/calculators/registry";

/**
 * The calculators, on the home page.
 *
 * A row of the ones people reach for, not the whole catalogue: the home page's
 * job here is to tell somebody the calculators exist, and one tap gets them to
 * the rest. Scrolls sideways inside its own strip on a phone rather than
 * wrapping into a wall of chips.
 */
export function CalculatorRail() {
  const popular = popularCalculators();

  return (
    <section className="mb-3 rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Calculator className="size-4" />
          Construction Calculators
        </h2>
        <Link
          href="/calculators"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          View all
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {popular.map((calculator) => (
          <li key={calculator.slug} className="shrink-0">
            <Link
              href={`/calculators/${calculator.slug}`}
              className="inline-flex h-9 items-center rounded-full border px-3.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              {calculator.title.replace(" Calculator", "")}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
