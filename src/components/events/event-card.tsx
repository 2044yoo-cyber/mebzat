import Image from "next/image";
import Link from "next/link";
import { MapPin, Users, Video } from "lucide-react";

import { COVER_PLACEHOLDER } from "@/lib/constants/placeholders";
import { EVENT_KIND } from "@/lib/constants/community";
import { formatPrice } from "@/lib/utils";
import type { EventRow } from "@/lib/data/events";

export function EventCard({ event }: { event: EventRow }) {
  const starts = new Date(event.starts_at);
  const organizer =
    event.company?.name ??
    event.organizer?.company_name ??
    event.organizer?.full_name;

  return (
    <Link
      href={`/events/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
    >
      <div className="relative aspect-video bg-muted">
        <Image
          src={event.cover_image_url || COVER_PLACEHOLDER}
          alt={event.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* A date block reads faster than a line of text in a grid. */}
        <span className="absolute top-3 left-3 flex size-12 flex-col items-center justify-center rounded-xl bg-background/95 backdrop-blur">
          <span className="text-lg leading-none font-semibold">
            {starts.getDate()}
          </span>
          <span className="text-[10px] uppercase text-muted-foreground">
            {starts.toLocaleString(undefined, { month: "short" })}
          </span>
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium backdrop-blur">
          {EVENT_KIND[event.kind]}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-medium leading-snug">{event.title}</h3>

        <p className="text-sm text-muted-foreground">
          {starts.toLocaleString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {event.is_online ? (
            <span className="flex items-center gap-1">
              <Video className="size-3" /> Online
            </span>
          ) : (
            event.location_city && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {event.location_city}
              </span>
            )
          )}
          {event.attendee_count > 0 && (
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {event.attendee_count} going
            </span>
          )}
          <span className="ml-auto font-medium text-foreground">
            {event.price === null || event.price === 0
              ? "Free"
              : formatPrice(event.price, event.currency)}
          </span>
        </div>

        {organizer && (
          <p className="truncate text-xs text-muted-foreground">{organizer}</p>
        )}
      </div>
    </Link>
  );
}
