import Image from "next/image";
import Link from "next/link";
import { Briefcase, MapPin, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import type { ProfileService } from "@/lib/data/professional-profile";

/**
 * The services this person offers.
 *
 * Compact cards rather than the full `ServiceCard`: that one carries the
 * provider's name and avatar, which on their own profile is the same face
 * repeated down the page.
 */

function price(service: ProfileService): string | null {
  if (service.price_from === null && service.price_to === null) return null;

  const unit = service.unit ? ` / ${service.unit}` : "";
  const money = (value: number) =>
    `${value.toLocaleString()} ${service.currency}`;

  if (service.price_from !== null && service.price_to !== null) {
    return service.price_from === service.price_to
      ? `${money(service.price_from)}${unit}`
      : `${money(service.price_from)} – ${money(service.price_to)}${unit}`;
  }
  if (service.price_from !== null) return `From ${money(service.price_from)}${unit}`;
  return `Up to ${money(service.price_to!)}${unit}`;
}

export function ProfileServices({
  services,
  name,
}: {
  services: ProfileService[];
  name: string;
}) {
  if (services.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        <Briefcase className="mx-auto mb-2 size-5" />
        {name} has not listed any services yet.
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {services.map((service) => {
        const label = price(service);
        return (
          <li key={service.id}>
            <Link
              href={`/services/${service.id}`}
              className="flex h-full gap-3 rounded-2xl border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                <Image
                  src={service.cover_image_url || PROJECT_PLACEHOLDER}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium">{service.title}</p>
                  {!service.accepting_work && (
                    <Badge variant="secondary" className="shrink-0">
                      Booked up
                    </Badge>
                  )}
                </div>
                {service.category && (
                  <p className="text-xs text-muted-foreground">
                    {service.category.name}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {label && <span className="font-medium text-foreground">{label}</span>}
                  {service.review_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      {service.rating.toFixed(1)} ({service.review_count})
                    </span>
                  )}
                  {service.location_city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {service.location_city}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
