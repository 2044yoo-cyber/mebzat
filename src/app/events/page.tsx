import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { EventCard } from "@/components/events/event-card";
import { Pagination } from "@/components/ui/pagination";
import { EVENT_KIND, isEventKind } from "@/lib/constants/community";
import { PAGE_SIZE, getEventCities, getEvents } from "@/lib/data/events";
import { cn } from "@/lib/utils";
import type { EventKind } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Events — Exhibitions, trade fairs, training and workshops",
  description:
    "Construction exhibitions, trade fairs, training courses and workshops across Ethiopia.",
};

export const dynamic = "force-dynamic";

export default async function EventsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const kindParam = get("kind");
  const kind: EventKind | undefined = isEventKind(kindParam)
    ? kindParam
    : undefined;
  const city = get("city") ?? "";
  const past = get("when") === "past";
  const page = Math.max(1, Number(get("page")) || 1);

  const [result, cities] = await Promise.all([
    getEvents({ kind, city: city || undefined, past, page }),
    getEventCities(),
  ]);

  function buildHref(
    overrides: Record<string, string | null>,
    nextPage?: number,
  ) {
    const params = new URLSearchParams();
    const current: Record<string, string> = {};
    if (kind) current.kind = kind;
    if (city) current.city = city;
    if (past) current.when = "past";

    for (const [key, value] of Object.entries({ ...current, ...overrides })) {
      if (value) params.set(key, value);
    }
    if (nextPage && nextPage > 1) params.set("page", String(nextPage));

    const qs = params.toString();
    return qs ? `/events?${qs}` : "/events";
  }

  return (
    <div className="container-page py-10">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" /> Events
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Exhibitions, training and workshops
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Where the construction industry meets — trade fairs, courses, site
          visits and webinars.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildHref({ when: null })}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            !past
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:border-brand hover:bg-brand/5",
          )}
        >
          Upcoming
        </Link>
        <Link
          href={buildHref({ when: "past" })}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            past
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:border-brand hover:bg-brand/5",
          )}
        >
          Past
        </Link>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Link
          href={buildHref({ kind: null })}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            !kind
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:border-brand hover:bg-brand/5",
          )}
        >
          All types
        </Link>
        {(Object.keys(EVENT_KIND) as EventKind[]).map((value) => (
          <Link
            key={value}
            href={buildHref({ kind: kind === value ? null : value })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              kind === value
                ? "border-brand bg-brand text-brand-foreground"
                : "hover:border-brand hover:bg-brand/5",
            )}
          >
            {EVENT_KIND[value]}
          </Link>
        ))}
      </div>

      {cities.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={buildHref({ city: null })}
            className={cn(
              "rounded-full px-2.5 py-1 text-sm transition-colors",
              !city
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Everywhere
          </Link>
          {cities.map((value) => (
            <Link
              key={value}
              href={buildHref({ city: city === value ? null : value })}
              className={cn(
                "rounded-full px-2.5 py-1 text-sm transition-colors",
                city === value
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8">
        {!result.available ? (
          <Empty
            title="Events are not set up yet"
            description="Apply migration 0012_jobs_events.sql, then events will appear here."
          />
        ) : result.events.length === 0 ? (
          <Empty
            title={past ? "No past events recorded" : "No upcoming events"}
            description="Check back soon, or organise one yourself."
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "event" : "events"}
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            <div className="mt-10">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={result.total}
                makeHref={(nextPage) => buildHref({}, nextPage)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-16 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
