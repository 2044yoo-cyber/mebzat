"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  Landmark,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Signpost,
} from "lucide-react";

import type { LocationHit } from "@/app/api/locations/search/route";
import { cn } from "@/lib/utils";

/**
 * Searching for where a property is.
 *
 * Replaces typing a city and a neighbourhood into two boxes and hoping they
 * match something. Matches city, sub city, neighbourhood, street, landmark and
 * building name in one field, and understands a pasted coordinate pair — which
 * is what a seller who knows their plot exactly actually has to hand.
 *
 * Choosing a result fills the city, the neighbourhood and the pin together, so
 * they cannot disagree. Typing is never blocked: the map and the form work if
 * this returns nothing at all.
 */

const ICONS: Record<string, typeof MapPin> = {
  city: Building2,
  sub_city: Building2,
  neighbourhood: MapPin,
  street: Signpost,
  building: Building2,
  landmark: Landmark,
  coordinates: Navigation,
};

export function LocationSearch({
  onSelect,
  placeholder = "Search a city, neighbourhood, landmark, or paste coordinates",
  className,
}: {
  onSelect: (hit: LocationHit) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  // Results carry the term they answer, so a stale reply for "bo" is
  // ignored rather than cleared — clearing would be a synchronous setState
  // in an effect, and the render that follows would flash an empty list.
  const [answer, setAnswer] = useState<{ term: string; hits: LocationHit[] }>({
    term: "",
    hits: [],
  });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const boxRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // Debounced, and the previous request is abandoned rather than raced: a
  // slow answer for "bo" must never overwrite a fast one for "bole".
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/locations/search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        const payload = response.ok
          ? ((await response.json()) as { results?: LocationHit[] })
          : { results: [] };
        setAnswer({ term, hits: payload.results ?? [] });
        setActive(0);
      } catch {
        if (!controller.signal.aborted) setAnswer({ term, hits: [] });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  // Clicking away closes the list.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Only show results that answer what is currently typed.
  const term = query.trim();
  const results = answer.term === term ? answer.hits : [];

  const choose = useCallback((hit: LocationHit) => {
    onSelectRef.current(hit);
    setQuery(hit.label);
    setOpen(false);
  }, []);

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!open || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => (index + 1) % results.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => (index - 1 + results.length) % results.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const hit = results[active];
              if (hit) choose(hit);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="location-results"
          aria-autocomplete="list"
          className="h-10 w-full rounded-xl border bg-transparent pr-9 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {loading && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id="location-results"
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-background p-1 shadow-lg"
        >
          {results.map((hit, index) => {
            const Icon = ICONS[hit.kind] ?? MapPin;
            return (
              <li key={`${hit.kind}-${hit.label}-${index}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(hit)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    index === active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {hit.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {hit.detail}
                      {hit.city && hit.detail !== hit.city && ` · ${hit.city}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && query.trim().length >= 2 && !loading && results.length === 0 && (
        <p className="absolute z-30 mt-1 w-full rounded-xl border bg-background p-3 text-sm text-muted-foreground shadow-lg">
          Nothing matched. Drag the pin on the map instead, or paste
          coordinates like <code className="rounded bg-muted px-1">9.0102, 38.7612</code>.
        </p>
      )}
    </div>
  );
}
