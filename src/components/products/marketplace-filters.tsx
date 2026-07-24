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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pushWith({ category: null })}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
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
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:border-brand hover:bg-brand/5",
              )}
            >
              <CategoryIcon slug={category.slug} className="size-3.5" />
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
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
