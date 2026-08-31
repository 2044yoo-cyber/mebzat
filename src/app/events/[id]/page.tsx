import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Users,
  Video,
} from "lucide-react";

import { AttendButton } from "@/components/events/attend-button";
import { COVER_PLACEHOLDER } from "@/lib/constants/placeholders";
import { EVENT_KIND } from "@/lib/constants/community";
import { getEvent, getMyAttendance } from "@/lib/data/events";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const event = await getEvent(id);
  if (!event) return { title: "Event not found" };

  return {
    title: event.title,
    description:
      event.description?.slice(0, 160) ??
      `${EVENT_KIND[event.kind]} on ${new Date(event.starts_at).toLocaleDateString()}.`,
    openGraph: {
      title: event.title,
      description: event.description?.slice(0, 160) ?? undefined,
      type: "article",
      images: event.cover_image_url ? [event.cover_image_url] : undefined,
    },
  };
}

export default async function EventPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const event = await getEvent(id);
  if (!event) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const attendance = await getMyAttendance(event.id, user?.id ?? null);

  const starts = new Date(event.starts_at);
  const ends = event.ends_at ? new Date(event.ends_at) : null;
  const organizer =
    event.company?.name ??
    event.organizer?.company_name ??
    event.organizer?.full_name ??
    "Medosha member";
  const full =
    event.capacity !== null && event.attendee_count >= event.capacity;

  // Schema.org so the event can surface as a rich result.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.starts_at,
    ...(event.ends_at ? { endDate: event.ends_at } : {}),
    eventAttendanceMode: event.is_online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    eventStatus:
      event.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    ...(event.description ? { description: event.description } : {}),
    ...(event.cover_image_url ? { image: [event.cover_image_url] } : {}),
    location: event.is_online
      ? { "@type": "VirtualLocation", url: event.online_url }
      : {
          "@type": "Place",
          name: event.venue ?? event.location_city ?? "Venue",
          address: {
            "@type": "PostalAddress",
            addressLocality: event.location_city,
            addressCountry: event.location_country,
          },
        },
    organizer: { "@type": "Organization", name: organizer },
    ...(event.price !== null
      ? {
          offers: {
            "@type": "Offer",
            price: event.price,
            priceCurrency: event.currency,
          },
        }
      : {}),
  };

  return (
    <div className="container-page py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/events"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All events
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted">
            <Image
              src={event.cover_image_url || COVER_PLACEHOLDER}
              alt={event.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 65vw"
              className="object-cover"
            />
          </div>

          <header>
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
              {EVENT_KIND[event.kind]}
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              {event.title}
            </h1>
            <p className="mt-2 text-muted-foreground">
              Organised by{" "}
              {event.company?.slug ? (
                <Link
                  href={`/companies/${event.company.slug}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {organizer}
                </Link>
              ) : event.organizer?.username ? (
                <Link
                  href={`/u/${event.organizer.username}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {organizer}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{organizer}</span>
              )}
            </p>
          </header>

          {event.description && (
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {event.description}
            </p>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border p-5">
            <dl className="space-y-4 text-sm">
              <Detail icon={<CalendarDays className="size-4" />} label="Date">
                {starts.toLocaleString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </Detail>

              <Detail icon={<Clock className="size-4" />} label="Time">
                {starts.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {ends &&
                  ` – ${ends.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`}
              </Detail>

              <Detail
                icon={
                  event.is_online ? (
                    <Video className="size-4" />
                  ) : (
                    <MapPin className="size-4" />
                  )
                }
                label={event.is_online ? "Online" : "Venue"}
              >
                {event.is_online
                  ? "Joining link sent on registration"
                  : [event.venue, event.address, event.location_city]
                      .filter(Boolean)
                      .join(", ") || "To be announced"}
              </Detail>

              <Detail icon={<Users className="size-4" />} label="Attending">
                {event.attendee_count}
                {event.capacity !== null && ` of ${event.capacity}`}
              </Detail>
            </dl>

            <div className="mt-5 border-t pt-5">
              <p className="mb-4 text-2xl font-semibold">
                {event.price === null || event.price === 0
                  ? "Free"
                  : formatPrice(event.price, event.currency)}
              </p>

              <AttendButton
                eventId={event.id}
                current={attendance}
                signedIn={user !== null}
                isOrganizer={user?.id === event.organizer_id}
                full={full}
                registrationUrl={event.registration_url}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-brand">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 font-medium">{children}</dd>
      </div>
    </div>
  );
}
