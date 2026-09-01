import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  Globe,
  MapPin,
  MessageSquare,
} from "lucide-react";

import { ReviewCard, Stars } from "@/components/reviews/review-card";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { SERVICE_PRICING } from "@/lib/constants/community";
import { getReviewSummary, getReviews } from "@/lib/data/reviews";
import { getService } from "@/lib/data/services";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const service = await getService(id);
  if (!service) return { title: "Service not found" };

  return {
    title: service.title,
    description:
      service.description?.slice(0, 160) ??
      `${service.title} on Medosha, priced ${SERVICE_PRICING[service.pricing]}.`,
    openGraph: {
      title: service.title,
      description: service.description?.slice(0, 160) ?? undefined,
      images: service.cover_image_url ? [service.cover_image_url] : undefined,
    },
  };
}

export default async function ServicePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const service = await getService(id);
  if (!service) notFound();

  const [reviews, summary] = await Promise.all([
    getReviews("service", service.id, 6),
    getReviewSummary("service", service.id),
  ]);

  const provider = service.provider;
  const name =
    service.company?.name ??
    provider?.company_name ??
    provider?.full_name ??
    "Medosha professional";
  const avatar = service.company?.logo_url ?? provider?.avatar_url;

  const priceRange =
    service.price_from === null
      ? null
      : service.price_to === null
        ? formatPrice(service.price_from, service.currency)
        : `${formatPrice(service.price_from, service.currency)} – ${formatPrice(
            service.price_to,
            service.currency,
          )}`;

  return (
    <div className="container-page py-10">
      <Link
        href="/services"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All services
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {service.cover_image_url && (
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted">
              <Image
                src={service.cover_image_url}
                alt={service.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 65vw"
                className="object-cover"
              />
            </div>
          )}

          <header>
            {service.category && (
              <p className="text-sm text-muted-foreground">
                {service.category.name}
              </p>
            )}
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {service.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {service.serves_remotely && (
                <span className="flex items-center gap-1.5">
                  <Globe className="size-4" /> Works remotely
                </span>
              )}
              {service.location_city && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {service.location_city}
                </span>
              )}
              {service.lead_time_days !== null && (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4" />
                  Can start in {service.lead_time_days} days
                </span>
              )}
              {summary.total > 0 && (
                <span className="flex items-center gap-1.5">
                  <Stars rating={summary.average} />
                  {summary.average.toFixed(1)} ({summary.total})
                </span>
              )}
            </div>
          </header>

          {service.description && (
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {service.description}
            </p>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Reviews{" "}
              <span className="text-muted-foreground">({summary.total})</span>
            </h2>
            {reviews.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No reviews yet. The first client can leave one.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border p-5">
            <p className="text-sm text-muted-foreground">
              {priceRange ? "Price" : "Pricing"}
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {priceRange ?? "On request"}
            </p>
            <p className="text-sm text-muted-foreground">
              {SERVICE_PRICING[service.pricing]}
              {service.unit ? ` · per ${service.unit}` : ""}
            </p>

            {!service.accepting_work && (
              <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                This provider is not taking new work at the moment. You can
                still message them.
              </p>
            )}

            <Link
              href={`/messages?supplier=${service.provider_id}`}
              className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <MessageSquare className="size-4" />
              Request a quote
            </Link>
          </div>

          <div className="rounded-2xl border p-5">
            <p className="text-xs text-muted-foreground">Offered by</p>
            <div className="mt-2 flex items-center gap-3">
              <Image
                src={avatar || AVATAR_PLACEHOLDER}
                alt=""
                width={44}
                height={44}
                className="size-11 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-medium">
                  {service.company?.slug ? (
                    <Link
                      href={`/companies/${service.company.slug}`}
                      className="truncate hover:underline"
                    >
                      {name}
                    </Link>
                  ) : provider?.username ? (
                    <Link
                      href={`/u/${provider.username}`}
                      className="truncate hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="truncate">{name}</span>
                  )}
                  {provider?.verification_status === "verified" && (
                    <BadgeCheck
                      className="size-4 shrink-0 text-brand"
                      aria-label="Verified"
                    />
                  )}
                </p>
                {provider?.account_type && (
                  <p className="text-sm text-muted-foreground capitalize">
                    {provider.account_type}
                  </p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
