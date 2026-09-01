"use client";

import Link from "next/link";
import {
  Building2,
  Car,
  Compass,
  HardHat,
  Landmark,
  PenTool,
  Sofa,
} from "lucide-react";

import { formatDistance } from "@/lib/location/privacy";
import { cn } from "@/lib/utils";

/**
 * The neighbourhood, for a buyer deciding whether to bother viewing.
 *
 * Drive times are straight-line distance scaled for Addis traffic, not a
 * routing call — there is no routing service in this deployment. They are
 * labelled "about" throughout, and the note says how they are worked out,
 * because a number presented as exact when it is not is worse than an
 * estimate that admits it.
 *
 * Services come from Medosha's own directory rather than a places API. The
 * point of listing an architect beside a property is that the buyer can hire
 * that architect here.
 */

export type TravelTime = { name: string; distance_m: number; minutes: number };

export type NearbyService = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  category: string;
  distance_m: number;
  verified: boolean;
};

const TRADE_LINKS = [
  { label: "Architects", query: "architect", icon: PenTool },
  { label: "Contractors", query: "contractor", icon: HardHat },
  { label: "Interior Designers", query: "interior designer", icon: Sofa },
  { label: "Furniture Stores", query: "furniture", icon: Sofa },
];

export function Neighbourhood({
  travel,
  services,
  city,
}: {
  travel: TravelTime[];
  services: NearbyService[];
  city: string | null;
}) {
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Compass className="size-4 text-brand" />
        Getting around
      </h2>

      {/* ---- Drive times -------------------------------------------- */}
      {travel.length > 0 && (
        <div className="space-y-2">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {travel.map((entry) => (
              <li
                key={entry.name}
                className="flex items-center gap-2 rounded-xl border p-2.5 text-sm"
              >
                <Car className="size-3.5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  about {entry.minutes} min
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Estimated from the approximate area at typical Addis traffic speeds.
            Not a routed journey — treat them as a rough guide.
          </p>
        </div>
      )}

      {/* ---- Street view -------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed p-3">
        <Landmark className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Street View</p>
          <p className="text-xs text-muted-foreground">
            Not available yet. It needs street-level imagery for Addis, which
            Medosha does not have a source for.
          </p>
        </div>
        <button
          type="button"
          disabled
          aria-disabled
          title="Not available yet"
          className="h-9 shrink-0 cursor-not-allowed rounded-xl border px-3 text-sm opacity-50"
        >
          Coming soon
        </button>
      </div>

      {/* ---- Services from Medosha ---------------------------------- */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Nearby on Medosha</h3>

        {services.length > 0 ? (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {services.slice(0, 8).map((service) => (
              <li key={service.id}>
                <Link
                  href={`/companies/${service.slug}`}
                  className="flex items-center gap-2.5 rounded-xl border p-2.5 text-sm transition-colors hover:border-brand"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted text-[10px] font-medium">
                    {service.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {service.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {service.category}
                      {service.verified && " · verified"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistance(service.distance_m)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Medosha companies have registered an address near here yet.
          </p>
        )}

        {/* Always shown, whether or not anyone is nearby: the buyer's next
            question is usually "who can do the work", and a search that
            returns the whole city is more useful than nothing. */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {TRADE_LINKS.map((trade) => (
            <Link
              key={trade.query}
              href={`/services?q=${encodeURIComponent(trade.query)}${city ? `&city=${encodeURIComponent(city)}` : ""}`}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
            >
              <trade.icon className="size-3" />
              {trade.label}
            </Link>
          ))}
          <Link
            href="/companies"
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              "text-muted-foreground transition-colors hover:border-brand hover:text-foreground",
            )}
          >
            <Building2 className="size-3" />
            All companies
          </Link>
        </div>
      </div>
    </section>
  );
}
