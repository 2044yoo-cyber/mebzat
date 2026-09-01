import Image from "next/image";
import Link from "next/link";
import { Bath, Bed, Maximize, MapPin, Rotate3d } from "lucide-react";

import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import { safeImageSrc } from "@/lib/images/safe-src";
import {
  LISTING_KIND,
  PROPERTY_TYPE,
  isLandType,
} from "@/lib/constants/properties";
import { cn, formatPrice } from "@/lib/utils";
import type { MapProperty, Property } from "@/types/database.types";

export type PropertyCardData = Pick<
  Property,
  | "id"
  | "title"
  | "property_type"
  | "listing_kind"
  | "price"
  | "currency"
  | "price_period"
  | "bedrooms"
  | "bathrooms"
  | "area_m2"
  | "cover_image_url"
  | "neighbourhood"
  | "has_360"
> & { location_city?: string | null };

/** Accepts either a full row or a map pin, which carry the same essentials. */
export function toCardData(property: MapProperty): PropertyCardData {
  return {
    id: property.id,
    title: property.title,
    property_type: property.property_type,
    listing_kind: property.listing_kind,
    price: property.price,
    currency: property.currency,
    price_period: property.price_period,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    area_m2: property.area_m2,
    cover_image_url: property.cover_image_url,
    neighbourhood: property.neighbourhood,
    has_360: property.has_360,
  };
}

export function PropertyCard({
  property,
  compact = false,
  active = false,
}: {
  property: PropertyCardData;
  compact?: boolean;
  active?: boolean;
}) {
  const land = isLandType(property.property_type);

  return (
    <Link
      href={`/property/${property.id}`}
      className={cn(
        "group block overflow-hidden rounded-2xl border bg-card transition-all hover:shadow-md",
        active && "border-brand ring-2 ring-brand/30",
        compact ? "flex gap-3" : "",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 bg-muted",
          compact ? "aspect-square w-28" : "aspect-4/3",
        )}
      >
        <Image
          src={safeImageSrc(property.cover_image_url, PROJECT_PLACEHOLDER)}
          alt={property.title}
          fill
          sizes={compact ? "112px" : "(max-width: 768px) 100vw, 33vw"}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {!compact && (
          <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium backdrop-blur">
            {LISTING_KIND[property.listing_kind]}
          </span>
        )}
        {property.has_360 && (
          <span
            className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium backdrop-blur"
            title="Has a 360° tour"
          >
            <Rotate3d className="size-3" />
            360°
          </span>
        )}
      </div>

      <div className={cn("min-w-0 flex-1", compact ? "py-2 pr-3" : "p-4")}>
        <p className="font-semibold">
          {property.price === null
            ? "Price on request"
            : formatPrice(property.price, property.currency)}
          {property.price_period && (
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / {property.price_period}
            </span>
          )}
        </p>

        <h3
          className={cn(
            "mt-0.5 font-medium leading-snug",
            compact ? "line-clamp-1 text-sm" : "line-clamp-2",
          )}
        >
          {property.title}
        </h3>

        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {[property.neighbourhood, property.location_city]
            .filter(Boolean)
            .join(", ") || PROPERTY_TYPE[property.property_type].label}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {/* Land has no bedrooms, so showing "0 beds" would be noise. */}
          {!land && property.bedrooms !== null && (
            <span className="flex items-center gap-1">
              <Bed className="size-3" />
              {property.bedrooms}
            </span>
          )}
          {!land && property.bathrooms !== null && (
            <span className="flex items-center gap-1">
              <Bath className="size-3" />
              {property.bathrooms}
            </span>
          )}
          {property.area_m2 !== null && property.area_m2 > 0 && (
            <span className="flex items-center gap-1">
              <Maximize className="size-3" />
              {Number(property.area_m2).toLocaleString()} m²
            </span>
          )}
          {!compact && (
            <span className="ml-auto">
              {PROPERTY_TYPE[property.property_type].label}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
