import Link from "next/link";
import { BadgeCheck, MapPin, Wallet } from "lucide-react";

import { DemoBadge } from "@/components/invest/demo-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { compactBirr } from "@/lib/constants/invest";
import { cn } from "@/lib/utils";
import type { InvestInvestor } from "@/types/database.types";

/**
 * An investor, as a card.
 *
 * Portfolio value is shown because these are sample profiles built to
 * demonstrate the module. A real member's holdings would be theirs to disclose,
 * which is why the badge distinguishing the two is on every one of these.
 */
export function InvestorCard({
  investor,
  className,
}: {
  investor: InvestInvestor;
  className?: string;
}) {
  const initials = investor.display_name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      href={`/invest/investors/${investor.id}`}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 transition-colors hover:border-brand",
        className,
      )}
    >
      <Avatar className="size-11 shrink-0">
        {investor.avatar_url && (
          <AvatarImage src={investor.avatar_url} alt="" />
        )}
        <AvatarFallback>{initials || "?"}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{investor.display_name}</span>
          {investor.verified && (
            <BadgeCheck
              className="size-3.5 shrink-0 text-brand"
              aria-label="Verified"
            />
          )}
          <DemoBadge demo={investor.is_demo} size="sm" />
        </div>

        {investor.city && (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3" />
            {investor.city}
          </p>
        )}

        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <div className="flex items-center gap-1.5">
            <Wallet className="size-3 text-muted-foreground" />
            <dt className="sr-only">Portfolio</dt>
            <dd className="font-semibold tabular-nums">
              {compactBirr(Number(investor.portfolio_value))}
            </dd>
          </div>
          <div>
            <dt className="sr-only">Projects</dt>
            <dd className="text-muted-foreground tabular-nums">
              {investor.projects_invested}{" "}
              {investor.projects_invested === 1 ? "project" : "projects"}
            </dd>
          </div>
        </dl>

        {investor.interests.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {investor.interests.slice(0, 3).map((interest) => (
              <li
                key={interest}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {interest}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}
