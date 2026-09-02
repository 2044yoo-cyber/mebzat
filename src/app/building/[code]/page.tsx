import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, MapPin } from "lucide-react";

import { StoreyIcon } from "@/components/property/storey-icons";
import {
  getBuildingByCode,
  getBuildingSummary,
  getBuildingUnits,
} from "@/lib/data/buildings";

export const dynamic = "force-dynamic";

/**
 * One building, and everything inside it.
 *
 * Addressed by its public code rather than its UUID: MED-ADD-BLD-0001 is what
 * an agent reads down a phone and what a buyer has written on a scrap of
 * paper, and a URL they can type is worth more here than a canonical id.
 *
 * Units are grouped by floor, highest first — that is how people talk about a
 * building they are choosing in, and a ten-storey list that starts at the
 * ground reads as a list of ground-floor flats until you scroll.
 */

function money(value: number | null, currency: string) {
  if (value === null) return "On request";
  const millions = value >= 1_000_000;
  return `${currency} ${millions ? `${(value / 1_000_000).toFixed(1)}M` : value.toLocaleString()}`;
}

export async function generateMetadata(props: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await props.params;
  const building = await getBuildingByCode(code);
  return { title: building ? building.name : "Building" };
}

export default async function BuildingPage(props: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await props.params;
  const building = await getBuildingByCode(code);
  if (!building) notFound();

  const [summary, floors] = await Promise.all([
    getBuildingSummary(building.id),
    getBuildingUnits(building.id),
  ]);

  const storeys = building.floors ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-4">
      <header className="flex gap-4">
        <div className="shrink-0 text-muted-foreground">
          <StoreyIcon storeys={storeys || 1} className="h-16 w-16" />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {building.name}
          </h1>
          {/* The code is selectable and monospaced because people copy it. */}
          <p className="mt-0.5 font-mono text-xs text-muted-foreground select-all">
            {building.code}
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            {storeys > 0 && (
              <>
                <span className="font-medium text-foreground">
                  G+{storeys - 1}
                </span>
                {" • "}
                {storeys} {storeys === 1 ? "floor" : "floors"}
                {" • "}
              </>
            )}
            {summary.totalUnits} {summary.totalUnits === 1 ? "unit" : "units"}
            {summary.availableUnits > 0 && (
              <>
                {" • "}
                <span className="font-medium text-brand">
                  {summary.availableUnits} available
                </span>
              </>
            )}
          </p>

          {(building.sub_city || building.address) && (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              {[building.sub_city, building.address].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </header>

      {building.description && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {building.description}
        </p>
      )}

      {floors.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No units listed in this building yet.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {floors.map(({ floor, units }) => (
            <section key={floor ?? "unknown"}>
              <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {floor === null
                  ? "Unassigned floor"
                  : floor === 0
                    ? "Ground floor"
                    : `Floor ${floor}`}
              </h2>

              {/* One column on a phone, two above — a unit row is short and
                  two of them side by side is still readable at 640px. */}
              <ul className="grid gap-2 sm:grid-cols-2">
                {units.map((unit) => (
                  <li key={unit.id}>
                    <Link
                      href={`/property/${unit.id}`}
                      className="flex h-full flex-col gap-1 rounded-xl border p-3 transition-colors hover:border-foreground/30 hover:bg-muted/40"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {unit.unit_number ? `U${unit.unit_number}` : unit.title}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {unit.status === "available"
                            ? unit.listing_kind === "rent"
                              ? "For rent"
                              : "For sale"
                            : unit.status}
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {[
                          unit.bedrooms ? `${unit.bedrooms} Bedroom` : null,
                          unit.bathrooms ? `${unit.bathrooms} Bath` : null,
                          unit.area_m2 ? `${unit.area_m2} m²` : null,
                        ]
                          .filter(Boolean)
                          .join(" • ") || "Details on request"}
                      </p>

                      <p className="mt-auto pt-1 font-semibold">
                        {money(unit.price, unit.currency)}
                        {unit.price_period && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {" "}
                            /{unit.price_period}
                          </span>
                        )}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-8 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
        <Building2 className="size-3.5" />
        Building reference {building.code}
      </footer>
    </div>
  );
}
