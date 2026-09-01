"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, UserCog, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EquipmentSort } from "@/lib/data/equipment";

const SORT_LABELS: Record<EquipmentSort, string> = {
  cheapest: "Lowest rate",
  priciest: "Highest rate",
  rating: "Best rated",
  newest: "Recently listed",
};

/** Search, category, city, availability and operator, all written to the URL. */
export function EquipmentFilters({
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
    availableOnly: boolean;
    withOperator: boolean;
    sort: EquipmentSort;
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
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilters = Boolean(
    current.q ||
      current.category ||
      current.city ||
      current.availableOnly ||
      current.withOperator,
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
          placeholder="Search machines, brands, models…"
          className="pl-9"
          aria-label="Search equipment"
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
          <SelectTrigger className="w-40" aria-label="Sort equipment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant={current.availableOnly ? "secondary" : "outline"}
          aria-pressed={current.availableOnly}
          onClick={() =>
            pushWith({ available: current.availableOnly ? null : "1" })
          }
        >
          Available now
        </Button>

        <Button
          type="button"
          variant={current.withOperator ? "secondary" : "outline"}
          aria-pressed={current.withOperator}
          onClick={() =>
            pushWith({ operator: current.withOperator ? null : "1" })
          }
        >
          <UserCog className="size-4" /> With operator
        </Button>

        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQ("");
              router.push(pathname);
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}
