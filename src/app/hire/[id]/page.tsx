import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Gavel,
  MapPin,
  Sparkles,
  Wallet,
} from "lucide-react";

import { BidComparison } from "@/components/hire/bid-comparison";
import { BidForm } from "@/components/hire/bid-form";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import {
  BRIEF_STATUS,
  BUDGET_KIND,
  CONTRACT_SHAPE,
} from "@/lib/constants/services";
import {
  getBids,
  getBrief,
  getBriefAttachments,
  getMatches,
  getMyBid,
} from "@/lib/data/briefs";
import { getMyServices } from "@/lib/data/services";
import { createClient } from "@/lib/supabase/server";
import { cn, formatPrice, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const brief = await getBrief(id);
  if (!brief) return { title: "Project not found" };

  return {
    title: brief.title,
    description: brief.description.slice(0, 160),
  };
}

export default async function BriefPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const brief = await getBrief(id);
  if (!brief) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isClient = user?.id === brief.client_id;

  const [bids, attachments, myBid, myServices, matches] = await Promise.all([
    getBids(brief.id),
    getBriefAttachments(brief.id),
    getMyBid(brief.id, user?.id ?? null),
    user && !isClient ? getMyServices(user.id) : Promise.resolve([]),
    // Suggestions are the client's tool for chasing bids, so only they see them.
    isClient ? getMatches(brief.id, 8) : Promise.resolve([]),
  ]);

  const status = BRIEF_STATUS[brief.status];
  const clientName =
    brief.client?.company_name ??
    brief.client?.full_name ??
    brief.client?.username ??
    "A client";

  const budget =
    brief.budget_kind === "open"
      ? "Open to quotes"
      : brief.budget_min !== null && brief.budget_max !== null
        ? `${formatPrice(brief.budget_min, brief.currency)} – ${formatPrice(brief.budget_max, brief.currency)}`
        : brief.budget_max ?? brief.budget_min
          ? formatPrice((brief.budget_max ?? brief.budget_min)!, brief.currency)
          : "Not given";

  const budgetHint =
    brief.budget_max !== null
      ? `Client's budget tops out at ${formatPrice(brief.budget_max, brief.currency)}.`
      : null;

  return (
    <div className="container-page py-10">
      <Link
        href="/hire"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Project marketplace
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {brief.category}
                {brief.subcategory ? ` · ${brief.subcategory}` : ""}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  status.tone === "open" && "bg-emerald-500/10 text-emerald-500",
                  status.tone === "progress" && "bg-amber-500/10 text-amber-500",
                  status.tone === "done" && "bg-brand/10 text-brand",
                  status.tone === "muted" && "bg-muted text-muted-foreground",
                )}
              >
                {status.label}
              </span>
            </div>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {brief.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Image
                  src={brief.client?.avatar_url || AVATAR_PLACEHOLDER}
                  alt=""
                  width={20}
                  height={20}
                  className="size-5 rounded-full object-cover"
                />
                {brief.client?.username ? (
                  <Link
                    href={`/u/${brief.client.username}`}
                    className="hover:underline"
                  >
                    {clientName}
                  </Link>
                ) : (
                  clientName
                )}
              </span>
              {brief.location_city && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {brief.location_city}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Gavel className="size-4" />
                {brief.bid_count} {brief.bid_count === 1 ? "bid" : "bids"}
              </span>
              <span>Posted {formatRelativeTime(brief.created_at)}</span>
            </div>
          </header>

          <section>
            <h2 className="mb-2 text-lg font-semibold">The work</h2>
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {brief.description}
            </p>
          </section>

          {attachments.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">
                Images, videos and drawings
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {attachments.map((item) =>
                  item.kind === "image" ? (
                    <div
                      key={item.id}
                      className="relative aspect-square overflow-hidden rounded-xl bg-muted"
                    >
                      <Image
                        src={item.url}
                        alt={item.file_name ?? ""}
                        fill
                        sizes="25vw"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    /* A DWG has nothing to preview, so it is a download. */
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-3 text-center text-xs transition-colors hover:border-brand"
                    >
                      <span className="font-medium uppercase">{item.kind}</span>
                      <span className="line-clamp-2 text-muted-foreground">
                        {item.file_name ?? "Download"}
                      </span>
                    </a>
                  ),
                )}
              </div>
            </section>
          )}

          {/* The client sees every bid side by side; a bidder sees only their
              own, because RLS returns only that. */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              {isClient ? "Compare the bids" : "Your bid"}
            </h2>
            <BidComparison
              bids={bids}
              currency={brief.currency}
              awardedBidId={brief.awarded_bid_id}
              clientCity={brief.location_city}
              decided={brief.status !== "open"}
            />
          </section>

          {isClient && matches.length > 0 && brief.status === "open" && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <Sparkles className="size-4 text-brand" />
                Professionals we matched
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Already notified. Ranked on trade, budget, location,
                availability and track record.
              </p>
              <ul className="divide-y rounded-2xl border">
                {matches.map((match) => (
                  <li key={match.service_id}>
                    <Link
                      href={`/services/${match.service_id}`}
                      className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {match.title}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {match.reason}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium text-brand tabular-nums">
                        {Math.round(match.score * 100)}% match
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border p-5">
            <dl className="space-y-3 text-sm">
              <Detail icon={<Wallet className="size-4" />} label={BUDGET_KIND[brief.budget_kind]}>
                {budget}
              </Detail>
              <Detail label="Contract">
                {CONTRACT_SHAPE[brief.contract_shape]}
              </Detail>
              {brief.starts_on && (
                <Detail icon={<CalendarClock className="size-4" />} label="Starts">
                  {new Date(brief.starts_on).toLocaleDateString()}
                </Detail>
              )}
              {brief.deadline_on && (
                <Detail label="Finish by">
                  {new Date(brief.deadline_on).toLocaleDateString()}
                </Detail>
              )}
              {brief.bids_close_on && (
                <Detail label="Bids close">
                  {new Date(brief.bids_close_on).toLocaleDateString()}
                </Detail>
              )}
              {brief.bid_count > 1 && brief.average_bid !== null && (
                <Detail label="Average bid">
                  {formatPrice(brief.average_bid, brief.currency)}
                </Detail>
              )}
            </dl>

            {brief.required_skills.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-xs text-muted-foreground">Trades wanted</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {brief.required_skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground"
                    >
                      {skill.replace(/-/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 border-t pt-5">
              {brief.status === "open" ? (
                <BidForm
                  briefId={brief.id}
                  currency={brief.currency}
                  budgetHint={budgetHint}
                  signedIn={user !== null}
                  isClient={isClient}
                  services={myServices.map((service) => ({
                    id: service.id,
                    title: service.title,
                  }))}
                  existing={myBid}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  This project is {status.label.toLowerCase()} and no longer
                  taking bids.
                </p>
              )}
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
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
