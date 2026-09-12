import Link from "next/link";
import { MapPin, Map as MapIcon, ShieldCheck, Star } from "lucide-react";

import { ContactButtons } from "@/components/professionals/contact-buttons";
import {
  VerifiedBadge,
  verificationLevelsOf,
} from "@/components/profile/verified-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ProfessionalRow } from "@/lib/data/professionals";
import { cn } from "@/lib/utils";

/**
 * One professional in the results.
 *
 * Two locations, said differently. "Based in" is where they are; "Works in" is
 * where they will come to — and the second is the one that decides whether
 * they are useful to the person reading. Showing only the first is what the
 * directory did before, and it is why a welder in Bole looked like the wrong
 * answer to somebody in Summit.
 *
 * Two numbers, not one. The average says how the work was received; the count
 * of reviews backed by a booking says how much of it happened. A card showing
 * only "5.0" is a card a scammer can produce. An unreviewed profile says so
 * rather than showing a blank star row, because empty stars read as a bad
 * rating rather than as no rating.
 */
const WORK_STATUS: Record<string, { label: string; dot: string; tone: string } | undefined> = {
  available: {
    label: "Available today",
    dot: "bg-emerald-500",
    tone: "text-emerald-600 dark:text-emerald-500",
  },
  limited: {
    label: "Available this week",
    dot: "bg-emerald-500",
    tone: "text-emerald-600 dark:text-emerald-500",
  },
  busy: { label: "Busy", dot: "bg-amber-500", tone: "text-amber-600 dark:text-amber-500" },
  fully_booked: {
    label: "Not accepting work",
    dot: "bg-muted-foreground",
    tone: "text-muted-foreground",
  },
  offline: {
    label: "Not accepting work",
    dot: "bg-muted-foreground",
    tone: "text-muted-foreground",
  },
};

/** How this professional covers the area that was asked for. */
const MATCH_NOTE: Record<string, string | undefined> = {
  radius: "Travels to this area",
  city: "Covers the whole city",
};

export function ProfessionalCard({
  person,
  jobArea,
}: {
  person: ProfessionalRow;
  /** The area that was searched for, so the card can say how they cover it. */
  jobArea?: string;
}) {
  const name =
    person.full_name || person.company_name || `@${person.username ?? ""}`;
  const initials = name
    .replace(/^@/, "")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const status = WORK_STATUS[person.work_status];
  const levels = verificationLevelsOf(person);
  const trade = person.profession ?? person.trades[0] ?? null;
  const note = person.match_kind ? MATCH_NOTE[person.match_kind] : undefined;

  // Four names and a count. A card that lists fourteen areas is a card whose
  // other half nobody reads.
  const areas = person.service_areas.slice(0, 4);
  const moreAreas = person.service_areas.length - areas.length;

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex gap-3">
        <Link href={`/u/${person.username}`} className="shrink-0">
          <Avatar className="size-12">
            <AvatarImage src={person.avatar_url ?? undefined} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/u/${person.username}`} className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-medium hover:underline">
                {name}
                {levels[0] && (
                  <VerifiedBadge level={levels[0]} showLabel={false} />
                )}
              </p>
            </Link>
            {status && (
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1.5 text-xs",
                  status.tone,
                )}
              >
                <span className={cn("size-2 rounded-full", status.dot)} />
                {status.label}
              </span>
            )}
          </div>

          {trade && (
            <p className="truncate text-sm text-muted-foreground">
              {trade}
              {person.specialties.length > 0 && (
                <span className="hidden sm:inline">
                  {" · "}
                  {person.specialties.slice(0, 2).join(", ")}
                </span>
              )}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {person.review_count > 0 ? (
              <>
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  {(person.rating ?? 0).toFixed(1)}
                </span>
                <span>
                  {person.review_count}{" "}
                  {person.review_count === 1 ? "review" : "reviews"}
                </span>
                {person.verified_reviews > 0 && (
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="size-3 text-emerald-600 dark:text-emerald-500" />
                    {person.verified_reviews} backed by a job
                  </span>
                )}
              </>
            ) : (
              <span>No reviews yet</span>
            )}
            {typeof person.years_experience === "number" &&
              person.years_experience > 0 && (
                <span>
                  {person.years_experience}{" "}
                  {person.years_experience === 1 ? "year" : "years"} experience
                </span>
              )}
          </div>
        </div>
      </div>

      {/* The two locations, kept apart on purpose. */}
      <div className="space-y-1 text-xs">
        {(person.base_area || person.location_city) && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            Based in {person.base_area ?? person.location_city}
          </p>
        )}
        {areas.length > 0 ? (
          <p className="flex items-start gap-1.5">
            <MapIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="text-muted-foreground">Works in </span>
              {areas.join(" · ")}
              {moreAreas > 0 && (
                <span className="text-muted-foreground"> +{moreAreas} more</span>
              )}
            </span>
          </p>
        ) : person.serves_entire_city ? (
          <p className="flex items-center gap-1.5">
            <MapIcon className="size-3 shrink-0 text-muted-foreground" />
            Works anywhere in {person.location_city ?? "the city"}
          </p>
        ) : null}
        {note && jobArea && (
          <Badge variant="secondary" className="text-[11px]">
            {note}
          </Badge>
        )}
      </div>

      <ContactButtons
        username={person.username}
        name={name}
        phone={person.phone}
        className="mt-auto"
      />
    </div>
  );
}
