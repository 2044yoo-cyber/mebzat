"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AREA_BANDS,
  BEDROOM_OPTIONS,
  PRICE_BANDS,
  PROPERTY_TYPE,
  PROPERTY_TYPES,
} from "@/lib/constants/properties";

/**
 * Quick property search for the homepage.
 *
 * Everything goes into the URL and the map reads it on arrival, so the search
 * is a deep link rather than a second search implementation living here.
 */
export function PropertySearch() {
  const router = useRouter();

  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [band, setBand] = useState(0);
  const [beds, setBeds] = useState(0);
  const [areaBand, setAreaBand] = useState(0);

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const params = new URLSearchParams();
    if (location.trim()) params.set("q", location.trim());
    if (type) params.set("type", type);

    const price = PRICE_BANDS[band];
    if (price?.min !== undefined) params.set("minPrice", String(price.min));
    if (price?.max !== undefined) params.set("maxPrice", String(price.max));

    if (beds) params.set("beds", String(beds));

    const area = AREA_BANDS[areaBand];
    if (area?.min !== undefined) params.set("minArea", String(area.min));

    const qs = params.toString();
    router.push(qs ? `/city?${qs}` : "/city");
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-2 rounded-2xl border bg-background/70 p-2 backdrop-blur sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_auto]"
    >
      <Input
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        placeholder="Location, e.g. Bole"
        aria-label="Location"
        className="h-11"
      />

      <Select
        value={type}
        onChange={setType}
        label="Property type"
        placeholder="Any type"
        options={PROPERTY_TYPES.map((value) => ({
          value,
          label: PROPERTY_TYPE[value].label,
        }))}
      />

      <Select
        value={String(band)}
        onChange={(value) => setBand(Number(value))}
        label="Price range"
        options={PRICE_BANDS.map((entry, index) => ({
          value: String(index),
          label: entry.label,
        }))}
      />

      <Select
        value={String(beds)}
        onChange={(value) => setBeds(Number(value))}
        label="Bedrooms"
        options={[
          { value: "0", label: "Any beds" },
          ...BEDROOM_OPTIONS.map((value) => ({
            value: String(value),
            label: `${value}+ beds`,
          })),
        ]}
      />

      <Select
        value={String(areaBand)}
        onChange={(value) => setAreaBand(Number(value))}
        label="Area"
        options={AREA_BANDS.map((entry, index) => ({
          value: String(index),
          label: entry.label,
        }))}
      />

      <Button type="submit" size="lg" className="h-11">
        <Search className="size-4" />
        Search
      </Button>
    </form>
  );
}

/**
 * A native select.
 *
 * Deliberately not the Base UI Select here: this row sits inside a form on a
 * marketing section, and the native control is keyboard- and mobile-correct
 * with no popover layering to fight the section's backdrop blur.
 */
function Select({
  value,
  onChange,
  label,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="h-11 w-full rounded-lg border bg-transparent px-3 text-sm"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
