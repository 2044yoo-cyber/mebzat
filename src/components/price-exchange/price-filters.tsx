"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRICE_SORTS, type PriceSortKey } from "@/lib/constants/price-exchange";
import { cn } from "@/lib/utils";

/**
 * Search, category, city, verified and sort for the market table.
 *
 * Every control writes to the URL and lets the server re-query, so a filtered
 * market is shareable and the 50-row page stays authoritative.
 */
export function PriceFilters({
  categories,
  cities,
  current,
}: {
  categories: string[];
  cities: string[];
  current: {
    q: string;
    category: string;
    city: string;
    verified: boolean;
    sort: PriceSortKey;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(current.q);

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

  const hasFilters = Boolean(
    current.q || current.category || current.city || current.verified,
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          pushWith({ q: q.trim() || null });
        }}
        className="relative flex-1"
      >
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search items, brands, specifications…"
          className="pl-9"
          aria-label="Search prices"
        />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={current.category || "all"}
          onValueChange={(value) =>
            pushWith({ category: value === "all" ? null : (value as string) })
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={current.city || "all"}
          onValueChange={(value) =>
            pushWith({ city: value === "all" ? null : (value as string) })
          }
        >
          <SelectTrigger className="w-40" aria-label="Filter by city">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={current.sort}
          onValueChange={(value) => pushWith({ sort: value as string })}
        >
          <SelectTrigger className="w-44" aria-label="Sort prices">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRICE_SORTS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant={current.verified ? "secondary" : "outline"}
          aria-pressed={current.verified}
          onClick={() => pushWith({ verified: current.verified ? null : "1" })}
        >
          <BadgeCheck
            className={cn("size-4", current.verified && "text-brand")}
          />
          Verified only
        </Button>

        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQ("");
              const sector = searchParams.get("sector");
              router.push(sector ? `${pathname}?sector=${sector}` : pathname);
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}
