import Link from "next/link";
import { Clock, Gavel, MapPin, Wallet } from "lucide-react";

import { BRIEF_STATUS, CONTRACT_SHAPE } from "@/lib/constants/services";
import { cn, formatPrice, formatRelativeTime } from "@/lib/utils";
import type { BriefRow } from "@/lib/data/briefs";

/** Renders whatever budget the client actually gave. */
function budgetLabel(brief: BriefRow): string {
  if (brief.budget_kind === "open") return "Open to quotes";
  if (brief.budget_min !== null && brief.budget_max !== null) {
    return `${formatPrice(brief.budget_min, brief.currency)} – ${formatPrice(brief.budget_max, brief.currency)}`;
  }
  const single = brief.budget_max ?? brief.budget_min;
  return single === null ? "Budget not given" : formatPrice(single, brief.currency);
}

export function BriefCard({ brief }: { brief: BriefRow }) {
  const status = BRIEF_STATUS[brief.status];

  return (
    <Link
      href={`/hire/${brief.id}`}
      className="group block rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {brief.category}
            {brief.subcategory ? ` · ${brief.subcategory}` : ""}
          </p>
          <h3 className="mt-0.5 font-medium leading-snug group-hover:underline">
            {brief.title}
          </h3>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            status.tone === "open" && "bg-emerald-500/10 text-emerald-500",
            status.tone === "progress" && "bg-amber-500/10 text-amber-500",
            status.tone === "done" && "bg-brand/10 text-brand",
            status.tone === "muted" && "bg-muted text-muted-foreground",
          )}
        >
          {status.label}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
        {brief.description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Wallet className="size-3" />
          {budgetLabel(brief)}
        </span>
        {brief.location_city && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3" />
            {brief.location_city}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Gavel className="size-3" />
          {brief.bid_count} {brief.bid_count === 1 ? "bid" : "bids"}
        </span>
        {brief.deadline_on && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            by {new Date(brief.deadline_on).toLocaleDateString()}
          </span>
        )}
        <span className="ml-auto">{formatRelativeTime(brief.created_at)}</span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {CONTRACT_SHAPE[brief.contract_shape]}
        {/* The spread tells a bidder whether it is worth pricing at all. */}
        {brief.bid_count > 1 &&
          brief.lowest_bid !== null &&
          brief.highest_bid !== null && (
            <>
              {" · bids from "}
              {formatPrice(brief.lowest_bid, brief.currency)} to{" "}
              {formatPrice(brief.highest_bid, brief.currency)}
            </>
          )}
      </p>
    </Link>
  );
}
