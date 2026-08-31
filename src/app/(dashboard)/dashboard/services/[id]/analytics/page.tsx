import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  Eye,
  Gavel,
  MessageSquare,
  Percent,
  Phone,
  Search,
  Send,
  TrendingUp,
  Trophy,
  UserRound,
  Wallet,
} from "lucide-react";

import { Sparkline } from "@/components/services/sparkline";
import { WorkStatusDot } from "@/components/services/work-status";
import { cn, formatPrice } from "@/lib/utils";
import {
  getService,
  getServiceAnalytics,
  getServiceTrend,
} from "@/lib/data/services";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Service analytics" };

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

export default async function ServiceAnalyticsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const rangeParam = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const days = RANGES.includes(rangeParam as 7 | 30 | 90) ? rangeParam : 30;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/services/${id}/analytics`);

  const service = await getService(id);
  if (!service || service.provider_id !== user.id) notFound();

  const [stats, viewTrend, quoteTrend] = await Promise.all([
    getServiceAnalytics(service.id, days),
    getServiceTrend(service.id, "view", days),
    getServiceTrend(service.id, "quote_request", days),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/services"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        My Services
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {service.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <WorkStatusDot status={service.work_status} />
            <span>{service.completed_projects} completed</span>
            {service.review_count > 0 && (
              <span>
                {Number(service.rating).toFixed(1)} ★ ({service.review_count})
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
          {RANGES.map((value) => (
            <Link
              key={value}
              href={`/dashboard/services/${service.id}/analytics?days=${value}`}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                days === value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}d
            </Link>
          ))}
        </div>
      </header>

      {/* The funnel, in the order a client moves through it. */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Reach
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<Search className="size-4" />} label="Search appearances" value={stats.searchAppearances} />
          <Metric icon={<Eye className="size-4" />} label="Views" value={stats.views} />
          <Metric icon={<UserRound className="size-4" />} label="Profile visits" value={stats.profileVisits} />
          <Metric icon={<Bookmark className="size-4" />} label="Saved by users" value={stats.bookmarks} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Contact
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<Send className="size-4" />} label="Quote requests" value={stats.quoteRequests} />
          <Metric icon={<MessageSquare className="size-4" />} label="Messages" value={stats.messages} />
          <Metric icon={<Phone className="size-4" />} label="Calls" value={stats.calls} />
          <Metric
            icon={<Percent className="size-4" />}
            label="Conversion rate"
            value={stats.conversionRate}
            suffix="%"
            hint="Quote requests per 100 views"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Work won
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<Gavel className="size-4" />} label="Bids submitted" value={stats.bidsSubmitted} />
          <Metric icon={<Trophy className="size-4" />} label="Accepted jobs" value={stats.bidsAccepted} />
          <Metric icon={<TrendingUp className="size-4" />} label="Completed jobs" value={stats.jobsCompleted} />
          <Metric
            icon={<Wallet className="size-4" />}
            label="Revenue"
            display={formatPrice(stats.revenue, service.currency)}
          />
        </div>
        {stats.averageBid !== null && (
          <p className="mt-2 text-sm text-muted-foreground">
            Average bid {formatPrice(stats.averageBid, service.currency)}.
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Chart
          title="Views"
          points={viewTrend}
          days={days}
          empty="No views recorded in this period."
        />
        <Chart
          title="Quote requests"
          points={quoteTrend}
          days={days}
          empty="No quote requests in this period."
        />
      </section>

      {stats.views === 0 && (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing to show yet. Views, quote requests and calls are recorded as
          soon as people start finding this service.
        </p>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  display,
  suffix,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  display?: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border p-4" title={hint}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {display ?? (value ?? 0).toLocaleString()}
        {suffix}
      </p>
    </div>
  );
}

function Chart({
  title,
  points,
  days,
  empty,
}: {
  title: string;
  points: { day: string; total: number }[];
  days: number;
  empty: string;
}) {
  return (
    <div className="rounded-2xl border p-4">
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">Last {days} days</p>
      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <Sparkline points={points} className="mt-3" />
      )}
    </div>
  );
}
