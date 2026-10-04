import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Clock, Globe, MapPin, Star } from "lucide-react";

import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { SERVICE_PRICING } from "@/lib/constants/community";
import { formatPrice } from "@/lib/utils";
import type { ServiceRow } from "@/lib/data/services";

/** "From ETB 180 per m²", or just the pricing model when there is no figure. */
function priceLabel(service: ServiceRow): string {
  if (service.price_from === null) {
    return `Priced ${SERVICE_PRICING[service.pricing]}`;
  }
  const from = formatPrice(service.price_from, service.currency);
  return `From ${from} ${SERVICE_PRICING[service.pricing]}`;
}

export function ServiceCard({ service }: { service: ServiceRow }) {
  const provider = service.provider;
  const name =
    service.company?.name ??
    provider?.company_name ??
    provider?.full_name ??
    "Medosha professional";
  const avatar = service.company?.logo_url ?? provider?.avatar_url;

  return (
    <Link
      href={`/services/${service.id}`}
      className="group flex flex-col rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
    >
      <div className="flex items-center gap-2.5">
        <Image
          src={avatar || AVATAR_PLACEHOLDER}
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-medium">
            <span className="truncate">{name}</span>
            {provider?.verification_status === "verified" && (
              <BadgeCheck
                className="size-3.5 shrink-0 text-brand"
                aria-label="Verified"
              />
            )}
          </p>
          {service.category && (
            <p className="truncate text-xs text-muted-foreground">
              {service.category.name}
            </p>
          )}
        </div>
      </div>

      <h3 className="mt-3 line-clamp-2 font-medium leading-snug group-hover:underline">
        {service.title}
      </h3>

      {service.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {service.description}
        </p>
      )}

      <p className="mt-3 font-semibold">{priceLabel(service)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {service.serves_remotely ? (
          <span className="flex items-center gap-1">
            <Globe className="size-3" /> Remote
          </span>
        ) : (
          service.location_city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {service.location_city}
            </span>
          )
        )}
        {service.lead_time_days !== null && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            Starts in {service.lead_time_days}d
          </span>
        )}
        {service.review_count > 0 && (
          <span className="flex items-center gap-1">
            <Star className="size-3" />
            {Number(service.rating).toFixed(1)} ({service.review_count})
          </span>
        )}
      </div>

      {!service.accepting_work && (
        <p className="mt-2 text-xs text-muted-foreground">
          Not taking new work right now
        </p>
      )}
    </Link>
  );
}
