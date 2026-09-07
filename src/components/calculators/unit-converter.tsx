"use client";

import { useState } from "react";

import {
  areaFromSquareMetres,
  areaInSquareMetres,
  AREA_LABELS,
  AREA_UNITS,
  formatNumber,
  fromMetres,
  LENGTH_LABELS,
  LENGTH_UNITS,
  massFromKg,
  massInKg,
  MASS_LABELS,
  MASS_UNITS,
  toMetres,
  volumeFromCubicMetres,
  volumeInCubicMetres,
  VOLUME_LABELS,
  VOLUME_UNITS,
  type AreaUnit,
  type LengthUnit,
  type MassUnit,
  type VolumeUnit,
} from "@/lib/calculators/units";

/**
 * One number in, every equivalent out.
 *
 * The usual converter makes you pick a "to" unit and gives one answer, which
 * means converting 3.6 m to both feet and millimetres is two operations. This
 * shows the whole family at once — the reader picks what they were looking for
 * off the list.
 *
 * Everything routes through the same SI conversions the calculators use, so a
 * foot is 0.3048 m here and in the concrete calculator, guaranteed by there
 * being one definition.
 */

const FAMILIES = ["length", "area", "volume", "mass"] as const;
type Family = (typeof FAMILIES)[number];

const FAMILY_LABELS: Record<Family, string> = {
  length: "Length",
  area: "Area",
  volume: "Volume",
  mass: "Weight",
};

export function UnitConverter() {
  const [family, setFamily] = useState<Family>("length");
  const [raw, setRaw] = useState("1");
  const [unit, setUnit] = useState<string>("m");

  const parsed = Number(raw.trim());
  const amount = Number.isFinite(parsed) ? parsed : 0;

  const units: readonly string[] =
    family === "length" ? LENGTH_UNITS : family === "area" ? AREA_UNITS : family === "volume" ? VOLUME_UNITS : MASS_UNITS;

  const labels: Record<string, string> =
    family === "length" ? LENGTH_LABELS : family === "area" ? AREA_LABELS : family === "volume" ? VOLUME_LABELS : MASS_LABELS;

  function convert(target: string): number {
    switch (family) {
      case "length":
        return fromMetres(toMetres(amount, unit as LengthUnit), target as LengthUnit);
      case "area":
        return areaFromSquareMetres(areaInSquareMetres(amount, unit as AreaUnit), target as AreaUnit);
      case "volume":
        return volumeFromCubicMetres(volumeInCubicMetres(amount, unit as VolumeUnit), target as VolumeUnit);
      case "mass":
        return massFromKg(massInKg(amount, unit as MassUnit), target as MassUnit);
    }
  }

  /** Places enough to be useful at both ends: 1 mm in km needs six. */
  function places(value: number): number {
    const size = Math.abs(value);
    if (size === 0) return 2;
    if (size >= 1000) return 2;
    if (size >= 1) return 4;
    if (size >= 0.001) return 6;
    return 8;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="rounded-2xl border p-4 sm:p-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">What are you converting?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FAMILIES.map((one) => (
              <button
                key={one}
                type="button"
                onClick={() => {
                  setFamily(one);
                  setUnit(
                    one === "length" ? "m" : one === "area" ? "m2" : one === "volume" ? "m3" : "kg",
                  );
                }}
                aria-pressed={family === one}
                className={
                  family === one
                    ? "h-11 rounded-xl bg-brand text-sm font-medium text-brand-foreground"
                    : "h-11 rounded-xl border text-sm font-medium transition-colors hover:bg-muted"
                }
              >
                {FAMILY_LABELS[one]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Amount</span>
            <span className="flex items-stretch gap-2">
              <input
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                inputMode="decimal"
                className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm tabular-nums"
              />
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                aria-label="Unit to convert from"
                className="h-11 w-24 shrink-0 rounded-xl border bg-muted px-2 text-sm"
              >
                {units.map((one) => (
                  <option key={one} value={one}>{labels[one]}</option>
                ))}
              </select>
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {formatNumber(amount, places(amount))} {labels[unit]} is
        </p>
        <dl className="mt-3 divide-y">
          {units
            .filter((one) => one !== unit)
            .map((one) => {
              const converted = convert(one);
              return (
                <div key={one} className="flex items-baseline justify-between gap-3 py-2.5">
                  <dt className="text-sm text-muted-foreground">{labels[one]}</dt>
                  <dd className="text-right text-sm font-medium tabular-nums">
                    {formatNumber(converted, places(converted))}
                  </dd>
                </div>
              );
            })}
        </dl>
      </div>
    </div>
  );
}
