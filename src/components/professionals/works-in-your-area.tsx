"use client";

import { useState } from "react";
import { CheckCircle2, Info, MapPin, Map as MapIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "Do they work where I am?"
 *
 * The question a customer actually has, answered without them having to read a
 * list of thirty area names and find their own. It compares slugs rather than
 * display names, so "CMC" and "Cmc" are the same answer.
 *
 * A "no" is not a dead end. It says the area is not listed *yet* and offers
 * the one thing that can change that — asking — because a professional who
 * would happily travel and simply has not ticked the box is the common case,
 * not the rare one.
 *
 * Nothing here exposes where anybody lives. The base is an area name, one
 * level coarser than a street, and the list is of areas somebody has
 * volunteered to work in.
 */

export type AreaChoice = { slug: string; name: string };

export function WorksInYourArea({
  baseArea,
  serviceAreas,
  servesEntireCity,
  travelRadiusKm,
  areas,
  city,
}: {
  baseArea: string | null;
  serviceAreas: AreaChoice[];
  servesEntireCity: boolean;
  travelRadiusKm: number | null;
  /** Everywhere a customer can ask about. */
  areas: AreaChoice[];
  city: string | null;
}) {
  const [asked, setAsked] = useState("");

  const covered =
    servesEntireCity || serviceAreas.some((a) => a.slug === asked);
  const askedName = areas.find((a) => a.slug === asked)?.name ?? "";

  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <div className="space-y-1 text-sm">
        {baseArea && (
          <p className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="text-muted-foreground">Based in </span>
              {baseArea}
            </span>
          </p>
        )}

        {servesEntireCity ? (
          <p className="flex items-center gap-2">
            <MapIcon className="size-4 shrink-0 text-muted-foreground" />
            Works anywhere in {city ?? "the city"}
          </p>
        ) : serviceAreas.length > 0 ? (
          <p className="flex items-start gap-2">
            <MapIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="text-muted-foreground">Service areas </span>
              {serviceAreas.map((a) => a.name).join(" · ")}
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-2 text-muted-foreground">
            <MapIcon className="mt-0.5 size-4 shrink-0" />
            No service areas listed yet.
          </p>
        )}

        {travelRadiusKm && (
          <p className="pl-6 text-xs text-muted-foreground">
            Also travels up to {travelRadiusKm} km from base.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        <label htmlFor="area-check" className="text-sm font-medium">
          Check if they work in my area
        </label>
        <select
          id="area-check"
          value={asked}
          onChange={(e) => setAsked(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Choose your area</option>
          {areas.map((area) => (
            <option key={area.slug} value={area.slug}>
              {area.name}
            </option>
          ))}
        </select>

        {asked && (
          <p
            className={cn(
              "flex items-start gap-2 rounded-lg p-3 text-sm",
              covered
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {covered ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0" />
            )}
            {covered
              ? `This professional works in ${askedName}.`
              : `This professional does not currently list ${askedName}. It is worth asking — many travel further than they have ticked.`}
          </p>
        )}
      </div>
    </section>
  );
}
