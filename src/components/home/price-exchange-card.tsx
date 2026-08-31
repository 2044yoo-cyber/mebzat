import Link from "next/link";
import { ArrowRight, Gavel, LineChart, TrendingDown } from "lucide-react";

import { PRICE_SECTORS } from "@/lib/constants/price-exchange";

/**
 * The homepage entry point to the Construction Price Exchange.
 *
 * One wide card rather than a section of listings: prices go stale, and a card
 * that promises live figures should send you to the live table rather than
 * render a snapshot that the homepage cache would freeze.
 */
export function PriceExchangeCard() {
  return (
    <Link
      href="/price-exchange"
      className="group relative isolate block overflow-hidden rounded-3xl border p-8 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-lg sm:p-10"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_80%_at_100%_0%,color-mix(in_oklch,var(--brand)_16%,transparent),transparent)]"
      />

      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <LineChart className="size-3 text-brand" />
            Live market
          </span>

          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            Construction Price Exchange
          </h2>
          <p className="mt-2 text-muted-foreground">
            Compare what materials, labour, furniture and whole projects
            actually cost right now. Bid against any published rate, follow the
            prices you care about, and see how they have moved.
          </p>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Gavel className="size-4 text-brand" /> Competitive bidding
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingDown className="size-4 text-brand" /> Price history
            </span>
            <span className="flex items-center gap-1.5">
              <LineChart className="size-4 text-brand" /> Market averages
            </span>
          </div>

          <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand">
            Open the exchange
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4 lg:w-96 lg:grid-cols-2">
          {PRICE_SECTORS.map((sector) => (
            <div
              key={sector.value}
              className="rounded-xl border bg-background/70 p-4 backdrop-blur"
            >
              <p className="text-sm font-medium">{sector.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {sector.blurb}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
