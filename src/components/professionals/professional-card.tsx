import Link from "next/link";
import { Briefcase, MapPin, ShieldCheck, Star } from "lucide-react";

import { VerifiedBadge } from "@/components/profile/verified-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ProfessionalRow } from "@/lib/data/professionals";
import { cn } from "@/lib/utils";

/**
 * One person in the results.
 *
 * Two numbers, not one. The average says how the work was received; the count
 * of reviews backed by a booking or a hire says how much of it happened. A
 * card showing only "5.0" is a card a scammer can produce.
 *
 * An unreviewed profile says so instead of showing a blank star row, because
 * a row of empty stars reads as a bad rating rather than as no rating.
 */
const WORK_STATUS: Record<string, { label: string; tone: string } | undefined> = {
  available: { label: "Available", tone: "text-emerald-600 dark:text-emerald-500" },
  limited: { label: "Limited availability", tone: "text-amber-600 dark:text-amber-500" },
  busy: { label: "Busy", tone: "text-muted-foreground" },
  fully_booked: { label: "Fully booked", tone: "text-muted-foreground" },
  offline: { label: "Not taking work", tone: "text-muted-foreground" },
};

export function ProfessionalCard({ person }: { person: ProfessionalRow }) {
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

  return (
    <Link
      href={`/u/${person.username}`}
      className="flex h-full gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted/50"
    >
      <Avatar className="size-12 shrink-0">
        <AvatarImage src={person.avatar_url ?? undefined} alt={name} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium">
              {name}
              {person.phone_verified && (
                <VerifiedBadge level="phone" showLabel={false} />
              )}
            </p>
            {person.username && (
              <p className="truncate text-xs text-muted-foreground">
                @{person.username}
              </p>
            )}
          </div>
          {status && (
            <span className={cn("shrink-0 text-xs", status.tone)}>
              {status.label}
            </span>
          )}
        </div>

        {person.trades.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {person.trades.slice(0, 3).map((trade) => (
              <Badge key={trade} variant="secondary" className="text-[11px]">
                {trade}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
          {person.location_city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {person.location_city}
            </span>
          )}
          {person.service_count > 0 && (
            <span className="flex items-center gap-1">
              <Briefcase className="size-3" />
              {person.service_count}{" "}
              {person.service_count === 1 ? "service" : "services"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
