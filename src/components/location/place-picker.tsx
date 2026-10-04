"use client";

import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";

import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  isPlausiblePlace,
  searchPlaces,
  type PlaceKind,
} from "@/lib/location/places";

/**
 * One place, typed rather than scrolled to.
 *
 * ## The hidden input holds whatever is in the box
 *
 * Not "whatever was last picked from the list". Somebody who types "Ayertena"
 * in full and tabs away without touching the suggestions has answered the
 * question, and a field that silently discards that is a field that loses
 * work — which is the failure this whole change exists to fix, in miniature.
 * The suggestions are help, not a gate.
 *
 * What the box holds still has to look like a place name, so `isPlausiblePlace`
 * decides whether it is submitted at all. That line is where "a list you can
 * add to" stops being "a free-text field under a different name".
 */
export function PlacePicker({
  name,
  id,
  defaultValue,
  kinds,
  placeholder = "Start typing…",
  describedBy,
}: {
  name: string;
  id?: string;
  defaultValue?: string | null;
  kinds?: readonly PlaceKind[];
  placeholder?: string;
  describedBy?: string;
}) {
  const [query, setQuery] = useState(defaultValue ?? "");

  const options: ComboboxOption[] = useMemo(
    () =>
      searchPlaces(query, { limit: 12, kinds }).map((place) => ({
        value: place.slug,
        label: place.name,
        hint: place.parent,
      })),
    [query, kinds],
  );

  const trimmed = query.trim();
  const known = options.some(
    (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
  );
  const usable = trimmed.length === 0 || isPlausiblePlace(trimmed);

  return (
    <div className="space-y-1.5">
      {/* Submitted empty rather than submitted wrong: a value the list would
          not accept back is not worth storing. */}
      <input type="hidden" name={name} value={usable ? trimmed : ""} />
      <Combobox
        id={id}
        query={query}
        onQueryChange={setQuery}
        options={options}
        onSelect={(option) => setQuery(option.label)}
        onAddCustom={(value) => setQuery(value)}
        placeholder={placeholder}
        emptyText="No place by that name"
        aria-labelledby={describedBy}
      />
      {trimmed.length > 0 && !known && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {usable
            ? "Not on our list — it will be saved as you typed it."
            : "That does not look like a place name."}
        </p>
      )}
    </div>
  );
}
