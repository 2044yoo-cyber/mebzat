import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, Eye, Plus, Send, Users, Wrench } from "lucide-react";

import { ServiceRowActions } from "@/components/services/service-row-actions";
import { WorkStatusDot } from "@/components/services/work-status";
import { buttonVariants } from "@/components/ui/button";
import { SERVICE_PRICING } from "@/lib/constants/community";
import { SERVICE_SCOPE, responseTimeLabel } from "@/lib/constants/services";
import { getMyServices } from "@/lib/data/services";
import { createClient } from "@/lib/supabase/server";
import { cn, formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "My Services" };

export const dynamic = "force-dynamic";

/**
 * My Services.
 *
 * One account, many services — each managed on its own line, because each one
 * is an independent business with its own price, capacity and availability.
 */
export default async function MyServicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/services");

  const services = await getMyServices(user.id);

  const live = services.filter((service) => service.status === "published");
  const totals = services.reduce(
    (sum, service) => ({
      views: sum.views + service.views,
      quotes: sum.quotes + service.quote_request_count,
      followers: sum.followers + service.follower_count,
      bookmarks: sum.bookmarks + service.bookmark_count,
    }),
    { views: 0, quotes: 0, followers: 0, bookmarks: 0 },
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wrench className="size-4" /> Services
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            My Services
          </h1>
          <p className="mt-1 text-muted-foreground">
            You are not limited to one profession. Publish every service you
            offer — each one has its own price, capacity and analytics.
          </p>
        </div>
        <Link
          href="/dashboard/services/new"
          className={buttonVariants({ size: "lg" })}
        >
          <Plus className="size-4" />
          Add service
        </Link>
      </header>

      {services.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Services" value={`${live.length} live`} sub={`${services.length} total`} />
          <Stat icon={<Eye className="size-4" />} label="Views" value={totals.views.toLocaleString()} />
          <Stat icon={<Send className="size-4" />} label="Quote requests" value={String(totals.quotes)} />
          <Stat icon={<Users className="size-4" />} label="Followers" value={String(totals.followers)} />
          <Stat icon={<Bookmark className="size-4" />} label="Bookmarks" value={String(totals.bookmarks)} />
        </div>
      )}

      {services.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center">
          <Wrench className="size-8 text-muted-foreground" />
          <p className="font-medium">No services yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            An interior studio that also makes wardrobes, prepares BOQs and
            supplies materials would publish four services here. Start with
            one.
          </p>
          <Link
            href="/dashboard/services/new"
            className={cn(buttonVariants(), "mt-2")}
          >
            <Plus className="size-4" />
            Add your first service
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {services.map((service) => (
            <li
              key={service.id}
              className={cn(
                "rounded-2xl border p-5",
                service.status !== "published" && "bg-muted/40",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/services/${service.id}`}
                      className="font-medium hover:underline"
                    >
                      {service.title}
                    </Link>
                    {service.status !== "published" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Paused
                      </span>
                    )}
                    <WorkStatusDot status={service.work_status} />
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {service.category?.name ?? "Uncategorised"}
                    {service.subcategory ? ` · ${service.subcategory}` : ""}
                    {" · "}
                    {SERVICE_SCOPE[service.scope].label}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium">
                      {service.price_from === null
                        ? SERVICE_PRICING[service.pricing]
                        : `${formatPrice(service.price_from, service.currency)} ${SERVICE_PRICING[service.pricing]}`}
                    </span>
                    <span className="text-muted-foreground">
                      {service.views} views
                    </span>
                    <span className="text-muted-foreground">
                      {service.quote_request_count} quotes
                    </span>
                    {service.review_count > 0 && (
                      <span className="text-muted-foreground">
                        {Number(service.rating).toFixed(1)} ★ (
                        {service.review_count})
                      </span>
                    )}
                    {responseTimeLabel(service.response_minutes) && (
                      <span className="text-muted-foreground">
                        {responseTimeLabel(service.response_minutes)}
                      </span>
                    )}
                  </div>
                </div>

                <ServiceRowActions
                  serviceId={service.id}
                  status={service.status}
                  workStatus={service.work_status}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
