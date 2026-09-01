"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
  Bus,
  GraduationCap,
  Hospital,
  Landmark,
  Lock,
  MapPin,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";

import {
  distanceMetres,
  formatDistance,
  locationBadges,
  radiusLabel,
  showsCircle,
  showsMap,
  type LocationVisibility,
} from "@/lib/location/privacy";
import { cn } from "@/lib/utils";

/**
 * Where a property is, as told to a buyer.
 *
 * The map is loaded only when there is a map to show and only when this
 * section is reached — a property page that nobody scrolls should not pay for
 * MapLibre, and a neighbourhood-only listing should not download it at all.
 *
 * Everything here comes from the published point. The component is never given
 * the exact coordinates of a hidden listing, so there is nothing in the page
 * source, the props or the network tab to recover them from — the privacy does
 * not depend on this file behaving.
 */

const PrivacyMap = dynamic(
  () => import("@/components/property/privacy-map").then((m) => m.PrivacyMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 animate-pulse rounded-2xl border bg-muted/40" />
    ),
  },
);

const PLACE_ICONS: Record<string, typeof MapPin> = {
  school: GraduationCap,
  university: GraduationCap,
  hospital: Hospital,
  clinic: Hospital,
  pharmacy: Hospital,
  supermarket: ShoppingBag,
  mall: ShoppingBag,
  market: ShoppingBag,
  bus_stop: Bus,
  transport: Bus,
  landmark: Landmark,
};

const PLACE_GROUPS: { id: string; label: string; kinds: string[] }[] = [
  { id: "schools", label: "Schools", kinds: ["school", "university"] },
  { id: "health", label: "Health", kinds: ["hospital", "clinic", "pharmacy"] },
  {
    id: "shopping",
    label: "Shopping",
    kinds: ["supermarket", "mall", "market"],
  },
  { id: "transport", label: "Transport", kinds: ["bus_stop", "transport"] },
];

export type NearbyPlace = {
  id: string;
  name: string;
  kind: string;
  distance_m: number;
  rating: number | null;
};

export function PublicLocation({
  latitude,
  longitude,
  radiusM,
  visibility,
  isExact,
  verified,
  city,
  subCity,
  neighbourhood,
  landmark,
  cityCentre,
  places = [],
  canRequestAccess = true,
  onRequestAccess,
}: {
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  visibility: LocationVisibility;
  /** Whether the coordinates above are the real ones. */
  isExact: boolean;
  verified: boolean;
  city: string | null;
  subCity: string | null;
  neighbourhood: string | null;
  landmark: string | null;
  cityCentre?: { latitude: number; longitude: number; name: string } | null;
  places?: NearbyPlace[];
  canRequestAccess?: boolean;
  onRequestAccess?: () => void;
}) {
  const badges = locationBadges({ visibility, verified, isExact });
  const circle = showsCircle(visibility, isExact);
  const mapped = showsMap(visibility, isExact) && latitude !== null && longitude !== null;

  const centreDistance = useMemo(() => {
    if (!cityCentre || latitude === null || longitude === null) return null;
    return distanceMetres(
      latitude,
      longitude,
      cityCentre.latitude,
      cityCentre.longitude,
    );
  }, [cityCentre, latitude, longitude]);

  const grouped = PLACE_GROUPS.map((group) => ({
    ...group,
    items: places
      .filter((place) => group.kinds.includes(place.kind))
      .slice(0, 4),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <MapPin className="size-4 text-brand" />
          Location
        </h2>
        <ul className="flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <li
              key={badge.id}
              title={badge.title}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                badge.tone === "verified" &&
                  "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                badge.tone === "approximate" &&
                  "border-brand/40 text-brand",
                badge.tone === "hidden" && "text-muted-foreground",
              )}
            >
              {badge.tone === "verified" ? (
                <ShieldCheck className="size-3" />
              ) : badge.tone === "hidden" ? (
                <Lock className="size-3" />
              ) : (
                <MapPin className="size-3" />
              )}
              {badge.tone === "hidden" ? "" : "✓ "}
              {badge.label}
            </li>
          ))}
        </ul>
      </div>

      {/* ---- The address, as much of it as is public -------------------- */}
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {city && <Row label="City" value={city} />}
        {subCity && <Row label="Sub city" value={subCity} />}
        {neighbourhood && <Row label="Neighbourhood" value={neighbourhood} />}
        {landmark && <Row label="Near" value={landmark} />}
        {circle && (
          <Row
            label="Approximate area"
            value={`Within ${radiusLabel(radiusM)}`}
          />
        )}
        {centreDistance !== null && cityCentre && (
          <Row
            label={`From ${cityCentre.name} centre`}
            value={formatDistance(centreDistance)}
          />
        )}
      </dl>

      {/* ---- The map ---------------------------------------------------- */}
      {mapped ? (
        <PrivacyMap
          latitude={latitude}
          longitude={longitude}
          radiusM={radiusM}
          showCircle={circle}
        />
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed p-4">
          <Lock className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This seller shares the neighbourhood only. Ask for a viewing and
            they can send you the exact location.
          </p>
        </div>
      )}

      {circle && (
        <p className="text-xs text-muted-foreground">
          The property is somewhere inside this circle. The circle is not
          centred on it.
        </p>
      )}

      {/* ---- Getting the real thing ------------------------------------- */}
      {!isExact && canRequestAccess && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-muted/30 p-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Need the exact address?</p>
            <p className="text-muted-foreground">
              The seller shares it once they accept a viewing request, approve
              you as a buyer, or send it to you directly.
            </p>
          </div>
          {onRequestAccess && (
            <button
              type="button"
              onClick={onRequestAccess}
              className="h-9 shrink-0 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
            >
              Request a viewing
            </button>
          )}
        </div>
      )}

      {/* ---- What is around it ------------------------------------------ */}
      {grouped.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">What is nearby</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {grouped.map((group) => (
              <div key={group.id}>
                <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((place) => {
                    const Icon = PLACE_ICONS[place.kind] ?? MapPin;
                    return (
                      <li
                        key={place.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Icon className="size-3.5 shrink-0 text-brand" />
                        <span className="min-w-0 flex-1 truncate">
                          {place.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDistance(place.distance_m)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {!isExact && (
            <p className="text-xs text-muted-foreground">
              Distances are measured from the approximate area, so they are
              accurate to about {radiusLabel(radiusM)}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{value}</dd>
    </div>
  );
}
