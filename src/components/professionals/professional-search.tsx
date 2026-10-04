"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { MapPin, Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROFESSIONS } from "@/lib/constants/professions";
import type { Area } from "@/lib/data/professionals";
import { cn } from "@/lib/utils";

/**
 * Two questions: what do you need, and where is the job.
 *
 * The second is the one this whole feature turns on, so it is a field of its
 * own rather than a filter behind a button. It is also a *list*, not free
 * text: the search can only match an area it knows, and a typed "Summitt"
 * returning nothing reads as "no welders work in Summit" rather than as a
 * spelling mistake.
 *
 * Everything writes to the URL. A search somebody can send to a friend, and a
 * back button that goes back a filter rather than off the page.
 */

const CHIPS = [
  { id: "all", label: "All" },
  { id: "individuals", label: "Individuals" },
  { id: "companies", label: "Companies" },
  { id: "available", label: "Available Now" },
  { id: "verified", label: "Verified" },
  { id: "top", label: "Top Rated" },
] as const;

const SORTS = [
  { value: "relevance", label: "Best match" },
  { value: "rating", label: "Highest rated" },
  { value: "nearest", label: "Nearest" },
  { value: "experience", label: "Most experienced" },
] as const;

export function ProfessionalSearch({
  areas,
  categories,
}: {
  areas: Area[];
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const get = useCallback((key: string) => params.get(key) ?? "", [params]);

  /** One place that writes the URL, so no two controls can disagree about it. */
  const apply = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      // Any change to the filters is a new result set, so page 1.
      next.delete("page");
      const query = next.toString();
      router.push(query ? `/professionals?${query}` : "/professionals");
    },
    [params, router],
  );

  const provider = get("provider");
  const activeChip = get("verified") === "1"
    ? "verified"
    : get("available") === "1"
      ? "available"
      : get("rating")
        ? "top"
        : provider === "individual"
          ? "individuals"
          : provider === "company"
            ? "companies"
            : "all";

  function chooseChip(id: (typeof CHIPS)[number]["id"]) {
    // Each chip is the one thing it says. Turning one on clears the others
    // rather than quietly stacking, because a row where three are lit and the
    // result set is the intersection is a row nobody can reason about.
    const cleared = {
      provider: null,
      available: null,
      verified: null,
      rating: null,
    } as Record<string, string | null>;

    if (id === "individuals") cleared.provider = "individual";
    if (id === "companies") cleared.provider = "company";
    if (id === "available") cleared.available = "1";
    if (id === "verified") cleared.verified = "1";
    if (id === "top") cleared.rating = "4";
    apply(cleared);
  }

  const activeFilters = ["category", "experience", "sort", "radius"].filter(
    (key) => get(key),
  ).length;

  return (
    <div className="space-y-3">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          apply({
            profession: String(data.get("profession") ?? ""),
            area: String(data.get("area") ?? ""),
          });
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="profession"
            list="profession-options"
            defaultValue={get("profession")}
            placeholder="What service do you need?"
            aria-label="Service or profession"
            className="min-h-11 pl-9"
          />
          <datalist id="profession-options">
            {PROFESSIONS.map((p) => (
              <option key={p.value} value={p.value} />
            ))}
          </datalist>
        </div>

        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            name="area"
            defaultValue={get("area")}
            aria-label="Job location"
            className="min-h-11 w-full rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Where is the job?</option>
            {areas.map((area) => (
              <option key={area.slug} value={area.slug}>
                {area.name}
                {area.sub_city ? ` — ${area.sub_city}` : ""}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" className="min-h-11">
          Search
        </Button>
      </form>

      {/* Scrolls rather than wrapping: two rows of chips push the results
          below the fold on a phone, which is where most of this is used. */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => chooseChip(chip.id)}
            className={cn(
              "min-h-9 shrink-0 rounded-full border px-3 text-sm transition-colors",
              activeChip === chip.id
                ? "border-brand bg-brand text-brand-foreground"
                : "hover:bg-muted",
            )}
          >
            {chip.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "ml-auto flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors hover:bg-muted",
            activeFilters > 0 && "border-brand text-brand",
          )}
        >
          <SlidersHorizontal className="size-4" />
          Filters
          {activeFilters > 0 && <span>({activeFilters})</span>}
        </button>
      </div>

      {open && (
        <div className="space-y-4 rounded-2xl border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Filters</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close filters"
              className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="filter-category">Category</Label>
              <select
                id="filter-category"
                value={get("category")}
                onChange={(e) => apply({ category: e.target.value })}
                className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Any category</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-experience">Years of experience</Label>
              <select
                id="filter-experience"
                value={get("experience")}
                onChange={(e) => apply({ experience: e.target.value })}
                className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Any</option>
                <option value="1">1 year or more</option>
                <option value="3">3 years or more</option>
                <option value="5">5 years or more</option>
                <option value="10">10 years or more</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-rating">Minimum rating</Label>
              <select
                id="filter-rating"
                value={get("rating")}
                onChange={(e) => apply({ rating: e.target.value })}
                className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Any rating</option>
                <option value="3">3.0 and above</option>
                <option value="4">4.0 and above</option>
                <option value="4.5">4.5 and above</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-sort">Sort by</Label>
              <select
                id="filter-sort"
                value={get("sort") || "relevance"}
                onChange={(e) => apply({ sort: e.target.value })}
                className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => router.push("/professionals")}
          >
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
