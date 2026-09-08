"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The filters somebody hiring actually applies.
 *
 * Every one of them is a URL parameter, so a search is a link: a client can
 * send "carpenters in Bole who can start" to a colleague, and the back button
 * works. Changing any filter clears the page number — staying on page 4 of a
 * result set that just became eleven rows long is how a filter appears to
 * return nothing.
 */

const TOGGLES = [
  {
    key: "verified",
    label: "Verified only",
    hint: "Confirmed a code sent to their phone",
  },
  {
    key: "available",
    label: "Can start now",
    hint: "Marked available or taking limited work",
  },
] as const;

const RATINGS = [
  { key: "", label: "Any rating" },
  { key: "4.5", label: "4.5 and above" },
  { key: "4", label: "4 and above" },
  { key: "3", label: "3 and above" },
];

export function ProfessionalFilters({
  current,
  categories,
  cities,
}: {
  current: {
    q: string;
    category: string;
    city: string;
    rating: string;
    verified: boolean;
    available: boolean;
  };
  categories: { slug: string; name: string }[];
  cities: string[];
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
    // A filter change that keeps the page number lands on an empty page and
    // reads as "no results".
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          pushWith({ q: q.trim() || null });
        }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Name, trade or what they do…"
          className="pl-9"
          aria-label="Search professionals"
        />
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="filter-trade">Trade</Label>
          <Select
            value={current.category || "all"}
            onValueChange={(value) =>
              pushWith({ category: value === "all" ? null : value })
            }
          >
            <SelectTrigger id="filter-trade" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any trade</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.slug} value={category.slug}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-city">City</Label>
          <Select
            value={current.city || "all"}
            onValueChange={(value) =>
              pushWith({ city: value === "all" ? null : value })
            }
          >
            <SelectTrigger id="filter-city" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anywhere</SelectItem>
              {cities.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-rating">Rating</Label>
          <Select
            value={current.rating || ""}
            onValueChange={(value) => pushWith({ rating: value || null })}
          >
            <SelectTrigger id="filter-rating" className="w-full">
              <SelectValue placeholder="Any rating" />
            </SelectTrigger>
            <SelectContent>
              {RATINGS.map((option) => (
                <SelectItem key={option.key || "any"} value={option.key || "any"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TOGGLES.map((toggle) => {
          const on =
            toggle.key === "verified" ? current.verified : current.available;
          return (
            <button
              key={toggle.key}
              type="button"
              title={toggle.hint}
              aria-pressed={on}
              onClick={() => pushWith({ [toggle.key]: on ? null : "1" })}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm transition-colors",
                on
                  ? "border-brand bg-brand/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {toggle.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
