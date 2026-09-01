"use client";

import Image from "next/image";
import Link from "next/link";
import { Bath, BedDouble, MapPin, Maximize } from "lucide-react";

import { ListingBadges } from "@/components/property/listing-badges";
import { isRenderableSrc, safeImageSrc } from "@/lib/images/safe-src";
import { markerFor, type SellerKind } from "@/lib/property/listing";
import { cn } from "@/lib/utils";

/**
 * What a map marker shows when you point at it.
 *
 * Built entirely from data the viewport query already returned, so hovering
 * costs nothing — the alternative is a fetch per marker, which on a map with
 * three hundred pins is a request storm and a visible delay on every one.
 */

export type HoverProperty = {
  id: string;
  title: string;
  property_type: string;
  listing_kind: string;
  price: number | null;
  currency: string;
  price_period: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  cover_image_url: string | null;
  neighbourhood: string | null;
  seller_kind: SellerKind | null;
  listing_verified: boolean;
  is_premium: boolean;
  /** Sample data. Drives the DEMO badge — never absent on a demo listing. */
  is_sample?: boolean;
  /** "approximate" when the pin is a neighbourhood centroid, not a building. */
  location_accuracy?: "exact" | "approximate" | "unknown" | null;
  /** The agency or agent behind the listing, for the preview line. */
  agent_name?: string | null;
};

export function PropertyHoverCard({
  property,
  className,
}: {
  property: HoverProperty;
  className?: string;
}) {
  const marker = markerFor(property.property_type);

  return (
    <article
      className={cn(
        "w-64 overflow-hidden rounded-2xl border bg-background shadow-lg",
        className,
      )}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {isRenderableSrc(property.cover_image_url) ? (
          <Image
            src={safeImageSrc(property.cover_image_url)}
            alt=""
            fill
            sizes="256px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-3xl">
            {marker.emoji}
          </span>
        )}
        <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
          {marker.emoji} {marker.label}
        </span>
      </div>

      <div className="space-y-1.5 p-3">
        <p className="text-sm font-semibold">
          {property.price === null
            ? "Price on request"
            : `${property.price.toLocaleString("en-ET")} ${property.currency}`}
          {property.price_period && (
            <span className="font-normal text-muted-foreground">
              {" "}
              / {property.price_period}
            </span>
          )}
        </p>

        <p className="line-clamp-2 text-sm">{property.title}</p>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {property.bedrooms !== null && (
            <span className="flex items-center gap-1">
              <BedDouble className="size-3" />
              {property.bedrooms}
            </span>
          )}
          {property.bathrooms !== null && (
            <span className="flex items-center gap-1">
              <Bath className="size-3" />
              {property.bathrooms}
            </span>
          )}
          {property.area_m2 !== null && (
            <span className="flex items-center gap-1">
              <Maximize className="size-3" />
              {property.area_m2} m²
            </span>
          )}
        </p>

        {property.neighbourhood && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {property.neighbourhood}
          </p>
        )}

        {property.agent_name && (
          <p className="truncate text-xs text-muted-foreground">
            {property.is_sample ? "Demo agent: " : ""}
            {property.agent_name}
          </p>
        )}

        <ListingBadges
          sellerKind={property.seller_kind}
          listingVerified={property.listing_verified}
          isPremium={property.is_premium}
          isSample={property.is_sample}
          size="small"
        />

        {/* Said on the card rather than only on the property page. This is the
            surface where a pin looks most like a precise claim — somebody
            reading a map assumes the marker is the building, and for these it
            is the middle of a neighbourhood. */}
        {property.location_accuracy === "approximate" && (
          <p className="flex items-start gap-1 text-[11px] leading-tight text-muted-foreground">
            <MapPin className="mt-px size-3 shrink-0" />
            Approximate location — general area, not the exact property.
          </p>
        )}

        <Link
          href={`/property/${property.id}`}
          className="mt-1 block rounded-lg border px-2 py-1.5 text-center text-xs font-medium hover:bg-muted"
        >
          View Property
        </Link>
      </div>
    </article>
  );
}
