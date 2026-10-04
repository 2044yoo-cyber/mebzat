"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AreaOption } from "@/components/profile/trade-and-areas";
import { searchPlaces } from "@/lib/location/places";
import { cn } from "@/lib/utils";

/**
 * Where somebody works, on its own.
 *
 * `TradeAndAreas` already asks this, and asks it alongside a profession, a
 * trade's specialties and a work status — none of which an estate agent or a
 * hardware shop has. Rather than give them that form with three quarters of it
 * hidden, the one question they do share is lifted out here: the same chips,
 * the same gazetteer-ranked search, the same hidden `serviceAreas` field the
 * actions already know how to read.
 *
 * The ranking comes from `searchPlaces` and the rows from the database, so
 * "bol" means the same thing here as it does everywhere else.
 */
export function ServiceAreaPicker({
  areas,
  selected,
  label,
  help,
}: {
  areas: AreaOption[];
  selected: string[];
  label: string;
  help: string;
}) {
  const [chosen, setChosen] = useState<string[]>(selected);
  const [query, setQuery] = useState("");

  function toggle(slug: string) {
    setChosen((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  const matching = useMemo(() => {
    if (!query.trim()) return null;
    const ranked = searchPlaces(query, { limit: 200, kinds: ["area", "city"] });
    const order = new Map(ranked.map((place, index) => [place.slug, index]));
    return areas
      .filter((area) => order.has(area.slug))
      .sort((a, b) => order.get(a.slug)! - order.get(b.slug)!);
  }, [query, areas]);

  const grouped = useMemo(() => {
    const map = new Map<string, AreaOption[]>();
    for (const area of areas) {
      const key = area.sub_city ?? "Other";
      const list = map.get(key) ?? [];
      list.push(area);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [areas]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {chosen.length} selected
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>

      <input type="hidden" name="serviceAreas" value={chosen.join(",")} />

      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search areas and towns"
          aria-label="Search areas"
          className="pl-9"
        />
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto overscroll-contain rounded-lg border p-3">
        {matching ? (
          matching.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nothing matches that.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {matching.map((area) => (
                <Chip
                  key={area.slug}
                  area={area}
                  on={chosen.includes(area.slug)}
                  onToggle={toggle}
                />
              ))}
            </div>
          )
        ) : (
          grouped.map(([subCity, list]) => (
            <div key={subCity} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {subCity}
              </p>
              <div className="flex flex-wrap gap-2">
                {list.map((area) => (
                  <Chip
                    key={area.slug}
                    area={area}
                    on={chosen.includes(area.slug)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Chip({
  area,
  on,
  onToggle,
}: {
  area: AreaOption;
  on: boolean;
  onToggle: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onToggle(area.slug)}
      className={cn(
        "flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm transition-colors",
        on ? "border-brand bg-brand text-brand-foreground" : "hover:bg-muted",
      )}
    >
      {on && <Check className="size-3" />}
      {area.name}
    </button>
  );
}
