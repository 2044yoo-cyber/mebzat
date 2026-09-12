"use client";

import { useMemo, useState } from "react";
import { Check, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AVAILABILITY,
  PROFESSIONS,
  TRAVEL_RADII,
  specialtiesFor,
} from "@/lib/constants/professions";
import { cn } from "@/lib/utils";

/**
 * The trade, and where its owner will go.
 *
 * Two location questions that look alike and are not. "Based in" is one
 * answer; "Areas I work in" is a list, and it is the list search reads. A form
 * that asked only the first is the form that left a welder in Bole invisible
 * to every job in Summit — so the second is not tucked behind an "advanced"
 * disclosure, and the help text under it says outright which one customers
 * search by.
 */

export type AreaOption = { slug: string; name: string; sub_city: string | null };

export function TradeAndAreas({
  areas,
  profession,
  specialties,
  baseArea,
  serviceAreaSlugs,
  travelRadiusKm,
  servesEntireCity,
  workStatus,
}: {
  areas: AreaOption[];
  profession: string | null;
  specialties: string[];
  baseArea: string | null;
  serviceAreaSlugs: string[];
  travelRadiusKm: number | null;
  servesEntireCity: boolean;
  workStatus: string;
}) {
  const [trade, setTrade] = useState(profession ?? "");
  const [chosen, setChosen] = useState<string[]>(serviceAreaSlugs);
  const [wholeCity, setWholeCity] = useState(servesEntireCity);
  const [specialtyText, setSpecialtyText] = useState(specialties.join(", "));

  const suggested = useMemo(() => specialtiesFor(trade), [trade]);

  function toggleArea(slug: string) {
    setChosen((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function addSpecialty(value: string) {
    const parts = specialtyText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.some((p) => p.toLowerCase() === value.toLowerCase())) return;
    setSpecialtyText([...parts, value].join(", "));
  }

  // Grouped so a list of forty areas reads as a map rather than as a wall.
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
    <div className="space-y-4 rounded-xl border p-4">
      <p className="text-sm font-medium">Your trade and where you work</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profession">Profession</Label>
          <Input
            id="profession"
            name="profession"
            list="profession-list"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            placeholder="Welder, Carpenter, Electrician…"
          />
          <datalist id="profession-list">
            {PROFESSIONS.map((p) => (
              <option key={p.value} value={p.value} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2">
          <Label htmlFor="workStatus">Availability</Label>
          <select
            id="workStatus"
            name="workStatus"
            defaultValue={workStatus}
            className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            {AVAILABILITY.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="specialties">Specialties</Label>
        <Input
          id="specialties"
          name="specialties"
          value={specialtyText}
          onChange={(e) => setSpecialtyText(e.target.value)}
          placeholder="Gates, handrails, steel furniture"
        />
        {suggested.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {suggested.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addSpecialty(s)}
                className="min-h-8 rounded-full border px-2.5 text-xs transition-colors hover:bg-muted"
              >
                + {s}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Separate with commas. Up to 12.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="baseArea">Based in</Label>
          <select
            id="baseArea"
            name="baseArea"
            defaultValue={baseArea ?? ""}
            className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Not set</option>
            {areas.map((area) => (
              <option key={area.slug} value={area.name}>
                {area.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Shown on your profile. Customers do not search by this.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="travelRadius">Also travel up to</Label>
          <select
            id="travelRadius"
            name="travelRadius"
            defaultValue={travelRadiusKm ? String(travelRadiusKm) : ""}
            className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Only the areas I pick</option>
            {TRAVEL_RADII.map((km) => (
              <option key={km} value={km}>
                {km} km from base
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Areas I work in</Label>
          <span className="text-xs text-muted-foreground">
            {chosen.length} selected
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          This is what customers search by. Pick every area you would take a job
          in, not just where you are based.
        </p>

        <input type="hidden" name="serviceAreas" value={chosen.join(",")} />

        <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
          <input
            type="checkbox"
            name="servesEntireCity"
            checked={wholeCity}
            onChange={(e) => setWholeCity(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          I work anywhere in the city
        </label>

        {!wholeCity && (
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border p-3">
            {grouped.map(([subCity, list]) => (
              <div key={subCity} className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MapPin className="size-3" /> {subCity}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((area) => {
                    const on = chosen.includes(area.slug);
                    return (
                      <button
                        key={area.slug}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleArea(area.slug)}
                        className={cn(
                          "flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm transition-colors",
                          on
                            ? "border-brand bg-brand text-brand-foreground"
                            : "hover:bg-muted",
                        )}
                      >
                        {on && <Check className="size-3" />}
                        {area.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
