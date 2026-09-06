"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { CategoryIcon } from "@/components/products/category-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRODUCT_SORTS, type ProductSort } from "@/lib/constants/product-categories";
import { cn } from "@/lib/utils";

type Category = { id: string; slug: string; name: string };

export function MarketplaceFilters({
  categories,
  current,
}: {
  categories: Category[];
  current: {
    q: string;
    category: string;
    sort: ProductSort;
    minPrice: string;
    maxPrice: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(current.q);
  const [minPrice, setMinPrice] = useState(current.minPrice);
  const [maxPrice, setMaxPrice] = useState(current.maxPrice);
  const [showPrice, setShowPrice] = useState(
    Boolean(current.minPrice || current.maxPrice),
  );

  function pushWith(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page"); // any filter change resets pagination
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilters =
    current.q || current.category || current.minPrice || current.maxPrice;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pushWith({ q: q.trim() || null });
          }}
          className="relative flex-1"
        >
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, brands, materials…"
            className="pl-9"
            aria-label="Search products"
          />
        </form>

        <div className="flex items-center gap-2">
          <Select
            value={current.sort}
            onValueChange={(value) => pushWith({ sort: value as string })}
          >
            <SelectTrigger className="w-44" aria-label="Sort products">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRODUCT_SORTS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={showPrice ? "secondary" : "outline"}
            size="icon"
            aria-label="Price filter"
            aria-pressed={showPrice}
            onClick={() => setShowPrice((v) => !v)}
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>
      </div>

      {showPrice && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pushWith({
              minPrice: minPrice.trim() || null,
              maxPrice: maxPrice.trim() || null,
            });
          }}
          className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
        >
          <span className="text-sm text-muted-foreground">Price</span>
          <Input
            type="number"
            min={0}
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min"
            className="h-8 w-24"
            aria-label="Minimum price"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max"
            className="h-8 w-24"
            aria-label="Maximum price"
          />
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
      )}

      {/*
        Two rows on a phone, and never more.

        Twelve chips wrapped to five rows at 360px, which pushed the products
        themselves off the screen — the category rail was taller than the thing
        it filters. Shrinking the type does not fix it: measured at text-xs with
        tight padding the chips still come to about 1140px against roughly 650px
        of space in two rows, so "Construction Materials" alone would have to
        lose half its width.

        So the rows are capped and the overflow scrolls sideways, which is what
        a chip rail does everywhere else on a phone. Nothing is hidden and
        nothing is truncated; the type stays legible. From `sm` up there is room
        to wrap and it wraps, exactly as before.

        `grid-flow-col` fills top-then-bottom per column rather than left-to-
        right across two rows. That is the right order here: a column is one
        scroll position, so a category and the one under it arrive together.
      */}
      <div
        className={cn(
          "grid grid-flow-col grid-rows-2 justify-start gap-2 overflow-x-auto pb-1",
          // The scrollbar is noise on a rail this short, and on a phone there
          // is no scrollbar to hide anyway.
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "sm:flex sm:grid-flow-row sm:flex-wrap sm:overflow-visible sm:pb-0",
        )}
      >
        <button
          type="button"
          onClick={() => pushWith({ category: null })}
          className={cn(
            "rounded-full border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-3 sm:text-sm",
            !current.category
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:border-brand hover:bg-brand/5",
          )}
        >
          All
        </button>
        {categories.map((category) => {
          const active = current.category === category.slug;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() =>
                pushWith({ category: active ? null : category.slug })
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-3 sm:text-sm",
                active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:border-brand hover:bg-brand/5",
              )}
            >
              <CategoryIcon slug={category.slug} className="size-3 sm:size-3.5" />
              {category.name}
            </button>
          );
        })}
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setMinPrice("");
              setMaxPrice("");
              router.push(pathname);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1.5 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:px-3 sm:text-sm"
          >
            <X className="size-3.5" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
