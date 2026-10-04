"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  BadgeCheck,
  Check,
  Minus,
  ShieldCheck,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { decideBid } from "@/app/hire/actions";
import { Button } from "@/components/ui/button";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { BID_STATUS, WORK_STATUS, responseTimeLabel } from "@/lib/constants/services";
import { cn, formatPrice } from "@/lib/utils";
import type { BidRow } from "@/lib/data/briefs";
import type { BriefBidStatus, WorkStatus } from "@/types/database.types";

/**
 * Bids side by side.
 *
 * A table rather than a stack of cards, because the point is comparison and
 * comparison needs aligned columns. It scrolls horizontally inside its own
 * container so the page never does.
 *
 * The best value in each numeric column is marked, since "cheapest" and
 * "fastest" are the two things every client scans for first and neither is
 * obvious across eight rows of different figures.
 */
export function BidComparison({
  bids,
  currency,
  awardedBidId,
  clientCity,
  decided,
}: {
  bids: BidRow[];
  currency: string;
  awardedBidId: string | null;
  clientCity: string | null;
  decided: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [acting, setActing] = useState<string | null>(null);

  // The winners in each column, so they can be marked rather than hunted for.
  const best = useMemo(() => {
    const prices = bids.map((bid) => Number(bid.price));
    const timelines = bids
      .map((bid) => bid.timeline_days)
      .filter((value): value is number => value !== null);
    const warranties = bids
      .map((bid) => bid.warranty_months)
      .filter((value): value is number => value !== null);
    const ratings = bids
      .map((bid) => bid.service?.rating ?? 0)
      .filter((value) => value > 0);

    return {
      price: prices.length ? Math.min(...prices) : null,
      timeline: timelines.length ? Math.min(...timelines) : null,
      warranty: warranties.length ? Math.max(...warranties) : null,
      rating: ratings.length ? Math.max(...ratings) : null,
    };
  }, [bids]);

  function decide(bidId: string, status: BriefBidStatus, label: string) {
    setActing(bidId);
    startTransition(async () => {
      const result = await decideBid(bidId, status);
      setActing(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(label);
      router.refresh();
    });
  }

  if (bids.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-14 text-center">
        <p className="font-medium">No bids yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Matching professionals have been notified. Bids usually start
          arriving within a day or two.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-3 py-3 font-medium">Company / Professional</th>
            <th className="px-3 py-3 text-right font-medium">Price</th>
            <th className="px-3 py-3 font-medium">Timeline</th>
            <th className="px-3 py-3 font-medium">Rating</th>
            <th className="px-3 py-3 font-medium">Availability</th>
            <th className="px-3 py-3 font-medium">Experience</th>
            <th className="px-3 py-3 font-medium">Verified</th>
            <th className="px-3 py-3 text-right font-medium">Completed</th>
            <th className="px-3 py-3 font-medium">Portfolio</th>
            <th className="px-3 py-3 font-medium">Warranty</th>
            <th className="px-3 py-3 font-medium">Scope</th>
            <th className="px-3 py-3 font-medium">Distance</th>
            <th className="px-3 py-3 font-medium">Response</th>
            <th className="px-3 py-3 text-right font-medium">Hire</th>
          </tr>
        </thead>

        <tbody>
          {bids.map((bid) => {
            const bidder = bid.bidder;
            const name =
              bid.company?.name ??
              bidder?.company_name ??
              bidder?.full_name ??
              "Medosha member";
            const verified =
              bid.company?.verified ||
              bidder?.verification_status === "verified";
            const won = awardedBidId === bid.id;
            const sameCity =
              clientCity !== null && bidder?.location_city === clientCity;

            return (
              <tr
                key={bid.id}
                className={cn(
                  "border-b transition-colors last:border-0 hover:bg-muted/40",
                  won && "bg-emerald-500/5",
                  bid.status === "declined" && "opacity-50",
                )}
              >
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2">
                    <Image
                      src={bid.company?.logo_url || bidder?.avatar_url || AVATAR_PLACEHOLDER}
                      alt=""
                      width={28}
                      height={28}
                      className="size-7 shrink-0 rounded-full object-cover"
                    />
                    <span className="min-w-0">
                      {bidder?.username ? (
                        <Link
                          href={`/u/${bidder.username}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="block truncate font-medium">{name}</span>
                      )}
                      {bid.service && (
                        <Link
                          href={`/services/${bid.service.id}`}
                          className="block truncate text-xs text-muted-foreground hover:underline"
                        >
                          {bid.service.title}
                        </Link>
                      )}
                    </span>
                  </span>
                </td>

                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      Number(bid.price) === best.price && "text-emerald-500",
                    )}
                  >
                    {formatPrice(bid.price, bid.currency || currency)}
                  </span>
                  {bid.price_note && (
                    <span className="block text-xs text-muted-foreground">
                      {bid.price_note}
                    </span>
                  )}
                </td>

                <td className="px-3 py-3 whitespace-nowrap">
                  <span
                    className={cn(
                      "tabular-nums",
                      bid.timeline_days !== null &&
                        bid.timeline_days === best.timeline &&
                        "font-medium text-emerald-500",
                    )}
                  >
                    {bid.timeline_days === null ? "—" : `${bid.timeline_days} days`}
                  </span>
                  {bid.can_start_on && (
                    <span className="block text-xs text-muted-foreground">
                      from {new Date(bid.can_start_on).toLocaleDateString()}
                    </span>
                  )}
                </td>

                <td className="px-3 py-3 whitespace-nowrap">
                  {bid.service && bid.service.review_count > 0 ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        bid.service.rating === best.rating &&
                          "font-medium text-emerald-500",
                      )}
                    >
                      <Star className="size-3" />
                      {Number(bid.service.rating).toFixed(1)}
                      <span className="text-xs text-muted-foreground">
                        ({bid.service.review_count})
                      </span>
                    </span>
                  ) : (
                    <Dash />
                  )}
                </td>

                <td className="px-3 py-3 whitespace-nowrap">
                  {bidder?.work_status ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        WORK_STATUS[bidder.work_status as WorkStatus]?.text,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-2 rounded-full",
                          WORK_STATUS[bidder.work_status as WorkStatus]?.dot,
                        )}
                      />
                      {WORK_STATUS[bidder.work_status as WorkStatus]?.label}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </td>

                <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                  {bidder?.years_experience
                    ? `${bidder.years_experience} yrs`
                    : "—"}
                </td>

                <td className="px-3 py-3">
                  {verified ? (
                    <BadgeCheck
                      className="size-4 text-brand"
                      aria-label="Verified"
                    />
                  ) : (
                    <Dash />
                  )}
                </td>

                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {bid.service?.completed_projects ?? "—"}
                </td>

                <td className="px-3 py-3">
                  {bid.service ? (
                    <Link
                      href={`/services/${bid.service.id}`}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      View
                    </Link>
                  ) : (
                    <Dash />
                  )}
                </td>

                <td className="px-3 py-3 whitespace-nowrap">
                  <span
                    className={cn(
                      "tabular-nums",
                      bid.warranty_months !== null &&
                        bid.warranty_months === best.warranty &&
                        "font-medium text-emerald-500",
                    )}
                  >
                    {bid.warranty_months === null
                      ? "—"
                      : `${bid.warranty_months} mo`}
                  </span>
                </td>

                <td className="px-3 py-3 whitespace-nowrap text-xs">
                  <span className="flex flex-col gap-0.5">
                    <Included label="Material" on={bid.material_included} />
                    <Included label="Labour" on={bid.labour_included} />
                  </span>
                </td>

                <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                  {bidder?.location_city ? (
                    <span className={cn(sameCity && "text-emerald-500")}>
                      {sameCity ? "Same city" : bidder.location_city}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </td>

                <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                  {responseTimeLabel(bidder?.response_minutes ?? null) ?? "—"}
                </td>

                <td className="px-3 py-3">
                  {won ? (
                    <span className="flex items-center justify-end gap-1 text-sm font-medium text-emerald-500">
                      <Trophy className="size-3.5" />
                      Hired
                    </span>
                  ) : decided ? (
                    <span className="block text-right text-xs text-muted-foreground">
                      {BID_STATUS[bid.status]}
                    </span>
                  ) : (
                    <span className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          decide(bid.id, "accepted", `Hired ${name}`)
                        }
                      >
                        {acting === bid.id && pending ? "…" : "Hire"}
                      </Button>
                      {bid.status !== "shortlisted" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            decide(bid.id, "shortlisted", "Shortlisted")
                          }
                          title="Shortlist"
                        >
                          <ShieldCheck className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => decide(bid.id, "declined", "Declined")}
                        title="Decline"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Dash() {
  return <Minus className="size-3 text-muted-foreground/50" aria-label="Not given" />;
}

function Included({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        on ? "text-foreground" : "text-muted-foreground/60 line-through",
      )}
    >
      {on ? <Check className="size-3" /> : <X className="size-3" />}
      {label}
    </span>
  );
}
