"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";

import { MapBoundary } from "@/components/property/map-boundary";
import { MapDiagnostics } from "@/components/property/map-diagnostics";
import { PropertyCard, toCardData } from "@/components/property/property-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AREA_BANDS,
  BEDROOM_OPTIONS,
  LISTING_KIND,
  PRICE_BANDS,
  PROPERTY_TYPE,
  PROPERTY_TYPE_GROUPS,
} from "@/lib/constants/properties";
import { onHighlight, type AiHighlight } from "@/lib/map/ai-highlight";
import { MAP_LAYERS } from "@/lib/map/markers";
import { clearSelection, select, useSelection } from "@/lib/workspace/selection";
import { openPanel } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";
import type { City, ListingKind, MapProperty } from "@/types/database.types";
import type { CanvasFilters } from "@/components/property/city-canvas";
import { StoreyFilter } from "@/components/property/storey-filter";
import type { BuildingGroup } from "@/lib/map/markers";

/**
 * Medosha City.
 *
 * The map is mounted once and never unmounted while this page is open.
 * Selecting a property opens a panel beside it rather than navigating, so the
 * camera, the loaded tiles and the user's place in their search all survive.
 *
 * Filter state is local rather than in the URL: the map refetches on its own
 * as the viewport changes, and pushing a route on every filter tap would
 * trigger a server render that fights it. Initial values still come from the
 * URL so the homepage search can deep-link into a filtered map.
 */

const CityCanvas = dynamic(
  () => import("@/components/property/city-canvas").then((mod) => mod.CityCanvas),
  {
    // MapLibre is browser-only and large. Splitting it also means a failure to
    // load the map bundle cannot take the page shell with it.
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center rounded-2xl border bg-muted/40">
        <span className="text-sm text-muted-foreground">Loading map…</span>
      </div>
    ),
  },
);

export function CityExplorer({
  city,
  cities,
  initialProperties,
}: {
  city: City;
  cities: City[];
  initialProperties: MapProperty[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [types, setTypes] = useState<string[]>(
    params.get("type")?.split(",").filter(Boolean) ?? [],
  );
  const [kind, setKind] = useState<ListingKind | null>(
    (params.get("kind") as ListingKind) || null,
  );
  const [band, setBand] = useState(Number(params.get("band")) || 0);
  const [beds, setBeds] = useState(Number(params.get("beds")) || 0);
  const [floors, setFloors] = useState<number | null>(
    Number(params.get("floors")) || null,
  );
  const [areaBand, setAreaBand] = useState(Number(params.get("area")) || 0);
  const [showFilters, setShowFilters] = useState(false);
  // Which building the list is showing the inside of, if any.
  const [building, setBuilding] = useState<BuildingGroup | null>(null);
  const [layers, setLayers] = useState<string[]>(["properties"]);
  const [showLayers, setShowLayers] = useState(false);

  const [results, setResults] = useState<MapProperty[]>(initialProperties);

  /**
   * Listings Medosha AI just searched for.
   *
   * The assistant is mounted in the shell, not here, so this arrives as a
   * browser event rather than a prop — see `lib/map/ai-highlight`. It marks
   * markers rather than replacing the map's own results: somebody who asked
   * about Bole should still be able to see that there is something in Ayat,
   * and a chat answer that emptied the map would be a worse map.
   */
  const [aiHighlight, setAiHighlight] = useState<AiHighlight | null>(null);

  useEffect(() => onHighlight(setAiHighlight), []);

  // Selection lives in the workspace store, not here, because the panel that
  // renders it lives in the shell — outside this module entirely. Publishing
  // it means one right-hand column for the whole application rather than the
  // shell's panel and the map's panel competing for the same 400px.
  const selection = useSelection();
  const selected =
    selection?.kind === "property" ? selection.property : null;

  // Leaving the map must not leave a property sitting in the shell's panel.
  useEffect(() => clearSelection, []);

  const filters = useMemo<CanvasFilters>(() => {
    // The band arrays are non-empty constants, but the fallback was itself an
    // index read — so it never actually removed the undefined it was there for.
    const price = PRICE_BANDS[band] ?? PRICE_BANDS[0] ?? { min: undefined, max: undefined };
    const area = AREA_BANDS[areaBand] ?? AREA_BANDS[0] ?? { min: undefined };
    return {
      types: types.length ? types : undefined,
      kinds: kind ? [kind] : undefined,
      minPrice: price.min,
      maxPrice: price.max,
      minBedrooms: beds || undefined,
      minArea: area.min,
      floors: floors ?? undefined,
    };
  }, [types, kind, band, beds, areaBand, floors]);

  const activeCount =
    types.length +
    (kind ? 1 : 0) +
    (band ? 1 : 0) +
    (beds ? 1 : 0) +
    (areaBand ? 1 : 0) +
    (floors ? 1 : 0);

  // Stable identities, so the canvas never sees a changed callback and has no
  // reason to do anything but keep running.
  const handleSelect = useCallback((property: MapProperty | null) => {
    if (!property) {
      clearSelection();
      return;
    }
    // Opening the panel is also what makes it visible if it was collapsed —
    // clicking a marker and getting nothing would read as a broken map.
    openPanel();
    select({ kind: "property", id: property.id, property });
  }, []);
  const handleResults = useCallback((rows: MapProperty[]) => {
    setResults(rows);
  }, []);

  // The text search filters the loaded viewport rather than refetching: the
  // rows are already here, and a round trip to filter what is on screen would
  // be slower than the typing.
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    let rows = results;

    // properties_in_viewport takes no storey argument, but it does return
    // `floors` — so this filters what is already on screen instead of
    // requiring a change to the database function.
    if (floors !== null) {
      rows = rows.filter((property) => property.floors === floors);
    }

    // A building marker was tapped: the list becomes that building's units.
    // Applied before the text search so somebody can still search within it.
    if (building) {
      rows = rows.filter((property) => property.building_id === building.id);
    }

    if (!term) return rows;
    return rows.filter(
      (property) =>
        property.title.toLowerCase().includes(term) ||
        property.neighbourhood?.toLowerCase().includes(term),
    );
  }, [results, query, floors, building]);

  function toggleType(value: string) {
    setTypes((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function toggleLayer(id: string) {
    setLayers((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function clearAll() {
    setTypes([]);
    setKind(null);
    setBand(0);
    setBeds(0);
    setAreaBand(0);
    setFloors(null);
    setBuilding(null);
    setQuery("");
  }

  const panelOpen = selected !== null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <select
          value={city.slug}
          onChange={(event) => router.push(`/city/${event.target.value}`)}
          aria-label="City"
          className="h-9 rounded-lg border bg-transparent px-3 text-sm font-medium"
        >
          {cities.map((entry) => (
            <option key={entry.id} value={entry.slug} disabled={!entry.active}>
              {entry.name}
              {entry.active ? "" : " (coming soon)"}
            </option>
          ))}
        </select>

        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Address, subcity, area…"
            aria-label="Search properties"
            className="h-9 pl-9"
          />
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
          {(["sale", "rent"] as ListingKind[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(kind === value ? null : value)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                kind === value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {LISTING_KIND[value]}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant={showFilters || activeCount > 0 ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters((value) => !value)}
        >
          <SlidersHorizontal className="size-4" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand px-1.5 text-xs text-brand-foreground">
              {activeCount}
            </span>
          )}
        </Button>

        <div className="relative">
          <Button
            type="button"
            variant={showLayers ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowLayers((value) => !value)}
          >
            Layers
          </Button>
          {showLayers && (
            <div className="absolute top-full left-0 z-50 mt-1 w-60 rounded-xl border bg-popover p-1 shadow-xl">
              {MAP_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  disabled={!layer.ready}
                  onClick={() => toggleLayer(layer.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    layer.ready ? "hover:bg-muted/60" : "cursor-not-allowed opacity-45",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: layer.colour }}
                  />
                  <span className="flex-1">{layer.label}</span>
                  {layer.ready ? (
                    <input
                      type="checkbox"
                      readOnly
                      checked={layers.includes(layer.id)}
                      className="size-3.5 rounded border"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">soon</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeCount > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            <X className="size-4" /> Clear
          </Button>
        )}

        <Link
          href="/property/new"
          className="ml-auto text-sm font-medium text-brand hover:underline"
        >
          List your property
        </Link>
      </div>

      {showFilters && (
        <div className="space-y-4 border-b bg-muted/30 px-4 py-4">
          <div className="flex flex-wrap gap-4">
            {PROPERTY_TYPE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1 text-xs text-muted-foreground">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.types.map((value) => (
                    <Chip
                      key={value}
                      active={types.includes(value)}
                      onClick={() => toggleType(value)}
                    >
                      {PROPERTY_TYPE[value].label}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-6">
            <FilterRow label="Price">
              {PRICE_BANDS.map((entry, index) => (
                <Chip key={entry.label} active={band === index} onClick={() => setBand(index)}>
                  {entry.label}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Bedrooms">
              {BEDROOM_OPTIONS.map((value) => (
                <Chip
                  key={value}
                  active={beds === value}
                  onClick={() => setBeds(beds === value ? 0 : value)}
                >
                  {value}+
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Area">
              {AREA_BANDS.map((entry, index) => (
                <Chip key={entry.label} active={areaBand === index} onClick={() => setAreaBand(index)}>
                  {entry.label}
                </Chip>
              ))}
            </FilterRow>
          </div>

          <StoreyFilter value={floors} onChange={setFloors} />
        </div>
      )}

      <div
        className={cn(
          "grid min-h-0 flex-1",
          // The results list gives way when a property is open: its detail is
          // already in the shell's panel, and the map deserves the room.
          panelOpen
            ? "lg:grid-cols-[minmax(0,1fr)]"
            : "lg:grid-cols-[minmax(0,1fr)_340px]",
        )}
      >
        <div className="min-h-64 p-3">
          <MapBoundary>
            <CityCanvas
              city={city}
              initial={initialProperties}
              filters={filters}
              selectedId={selected?.id ?? null}
              highlight={aiHighlight}
              panelOpen={panelOpen}
              onSelect={handleSelect}
              onResults={handleResults}
            onSelectBuilding={setBuilding}
            />
          </MapBoundary>
        </div>

        {/* Hidden while a property is open, because the shell's context panel
            is showing that property's detail beside this. */}
        {!panelOpen && (
          <aside className="min-h-0 overflow-y-auto border-t p-3 lg:border-t-0 lg:border-l">
            {building && (
              <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border bg-muted/40 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {building.name ?? "Building"}
                  </p>
                  {building.code && (
                    <Link
                      href={`/building/${building.code}`}
                      className="font-mono text-[11px] text-brand hover:underline"
                    >
                      {building.code} →
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setBuilding(null)}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Show all
                </button>
              </div>
            )}

            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">
                {visible.length}{" "}
                {building
                  ? visible.length === 1
                    ? "unit"
                    : "units"
                  : visible.length === 1
                    ? "property"
                    : "properties"}
                {query && " matching"}
              </h2>
              <Link
                href="/ai?q=Help%20me%20choose%20a%20property%20in%20Addis%20Ababa"
                className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                <Sparkles className="size-3" />
                Ask AI
              </Link>
            </div>

            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center">
                <Building2 className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-2 font-medium">No properties here yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pan the map, widen the filters, or be the first to list in
                  this area. The map stays usable either way.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {visible.map((property) => (
                  <li key={property.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(property)}
                      className="block w-full text-left"
                    >
                      <PropertyCard property={toCardData(property)} compact />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <MapDiagnostics className="mt-4" />
          </aside>
        )}
      </div>
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-sm transition-colors",
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "hover:border-brand hover:bg-brand/5",
      )}
    >
      {children}
    </button>
  );
}
