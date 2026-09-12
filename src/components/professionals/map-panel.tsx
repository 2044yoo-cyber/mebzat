"use client";

import dynamic from "next/dynamic";

import type { ProfessionalPoint } from "@/lib/professionals/map-points";

/**
 * The client boundary the map needs.
 *
 * `next/dynamic` with `ssr: false` cannot be called from a Server Component,
 * and the page is one. This is the smallest thing that can hold the call.
 *
 * The point of the indirection is that MapLibre is a large dependency and most
 * visits never leave the list: importing it here rather than on the page means
 * it is fetched when somebody switches to the map and not before.
 */
const ProfessionalsMap = dynamic(
  () =>
    import("@/components/professionals/professionals-map").then(
      (m) => m.ProfessionalsMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[28rem] animate-pulse rounded-2xl border bg-muted/40" />
    ),
  },
);

export function MapPanel({ points }: { points: ProfessionalPoint[] }) {
  return <ProfessionalsMap points={points} />;
}
