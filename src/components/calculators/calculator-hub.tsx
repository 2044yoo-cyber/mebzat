"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { FolderOpen, Search, Star, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { populatedCategories, popularCalculators, searchCalculators } from "@/lib/calculators/registry";
import { useFavourites, useRecents, whenLabel } from "@/lib/calculators/storage";
import type { CalculatorSpec } from "@/lib/calculators/types";

/**
 * The hub.
 *
 * Search runs over the forty-one specs in the browser. There is no endpoint
 * behind it and there should not be: the entire catalogue is smaller than the
 * request that would fetch it, and a search box that waits for a network round
 * trip on a phone in Addis feels broken even when it works.
 */
export function CalculatorHub() {
  const [query, setQuery] = useState("");
  const { favourites, toggle } = useFavourites();
  const { recents } = useRecents();

  const results = useMemo(() => searchCalculators(query), [query]);
  const categories = useMemo(() => populatedCategories(), []);
  const popular = useMemo(() => popularCalculators(), []);

  const starred = useMemo(
    () =>
      favourites
        .map((slug) => categories.flatMap((c) => c.calculators).find((one) => one.slug === slug))
        .filter((one): one is CalculatorSpec => Boolean(one)),
    [favourites, categories],
  );

  const searching = query.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder="Search — concrete, paint, tile, wardrobe, rebar…"
          aria-label="Search calculators"
          className="h-12 w-full min-w-0 rounded-xl border bg-background pl-10 pr-10 text-base"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!searching && (
        <Link
          href="/calculators/saved"
          className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <FolderOpen className="size-4" />
          Saved calculations
        </Link>
      )}

      {searching ? (
        <section aria-live="polite">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            {results.length === 0
              ? `Nothing matches “${query.trim()}”`
              : `${results.length} calculator${results.length === 1 ? "" : "s"}`}
          </h2>
          {results.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Try a material or a trade — “block”, “screed”, “roof”, “VAT”.
            </p>
          ) : (
            <Grid calculators={results} favourites={favourites} onToggle={toggle} />
          )}
        </section>
      ) : (
        <>
          {recents.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Recent calculations</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {recents.map((entry) => (
                  <li key={entry.slug}>
                    <Link
                      href={`/calculators/${entry.slug}`}
                      className="flex items-baseline justify-between gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{entry.title}</span>
                        <span className="block text-xs text-muted-foreground">{whenLabel(entry.at)}</span>
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">{entry.headline}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {starred.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">My calculators</h2>
              <Grid calculators={starred} favourites={favourites} onToggle={toggle} />
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Most used</h2>
            <Grid calculators={popular} favourites={favourites} onToggle={toggle} />
          </section>

          {categories.map((category) => (
            <section key={category.id}>
              <h2 className="text-lg font-semibold">{category.label}</h2>
              <p className="mb-3 text-sm text-muted-foreground">{category.blurb}</p>
              <Grid
                calculators={category.calculators}
                favourites={favourites}
                onToggle={toggle}
               
              />
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function Grid({
  calculators,
  favourites,
  onToggle,
}: {
  calculators: CalculatorSpec[];
  favourites: string[];
  onToggle: (slug: string) => void;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {calculators.map((calculator) => {
        const starred = favourites.includes(calculator.slug);
        return (
          <li key={calculator.slug} className="relative">
            <Link
              href={`/calculators/${calculator.slug}`}
              className="flex h-full flex-col rounded-2xl border p-4 pr-12 transition-colors hover:bg-muted"
            >
              <span className="text-sm font-medium">{calculator.title.replace(" Calculator", "")}</span>
              <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{calculator.summary}</span>
            </Link>
            {/* Outside the link: a star inside an anchor is a link you cannot
                star without navigating. */}
            <button
              type="button"
              onClick={() => onToggle(calculator.slug)}
              aria-label={starred ? `Remove ${calculator.title} from my calculators` : `Add ${calculator.title} to my calculators`}
              aria-pressed={starred}
              className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Star className={cn("size-4", starred && "fill-amber-400 text-amber-500")} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
