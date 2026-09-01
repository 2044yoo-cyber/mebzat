import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarRange,
  MapPin,
  MessageSquare,
  Truck,
  UserCog,
} from "lucide-react";

import { BookingForm } from "@/components/equipment/booking-form";
import { ReviewCard, Stars } from "@/components/reviews/review-card";
import { PRODUCT_PLACEHOLDER } from "@/lib/constants/placeholders";
import {
  getBookedRanges,
  getEquipmentItem,
} from "@/lib/data/equipment";
import { getReviewSummary, getReviews } from "@/lib/data/reviews";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
};

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const item = await getEquipmentItem(id);
  if (!item) return { title: "Equipment not found" };

  const rate =
    item.daily_rate !== null
      ? `${item.currency} ${item.daily_rate} per day`
      : "Rate on request";

  return {
    title: `${item.title} — ${rate}`,
    description:
      item.description ??
      `Hire ${item.title} in ${item.location_city ?? "Ethiopia"} through Medosha.`,
    openGraph: {
      title: item.title,
      description: item.description ?? undefined,
      images: item.cover_image_url ? [item.cover_image_url] : undefined,
    },
  };
}

export default async function EquipmentDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const item = await getEquipmentItem(id);
  if (!item) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [booked, reviews, summary] = await Promise.all([
    getBookedRanges(item.id),
    getReviews("equipment", item.id, 6),
    getReviewSummary("equipment", item.id),
  ]);

  const ownerName =
    item.company?.name ??
    item.owner?.company_name ??
    item.owner?.full_name ??
    "Medosha member";

  const gallery = [
    ...(item.cover_image_url ? [{ id: "cover", url: item.cover_image_url, alt: item.title }] : []),
    ...(item.images ?? []),
  ];

  return (
    <div className="container-page py-10">
      <Link
        href="/equipment"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All equipment
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted">
            <Image
              src={gallery[0]?.url || PRODUCT_PLACEHOLDER}
              alt={gallery[0]?.alt ?? item.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-cover"
            />
          </div>

          {gallery.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {gallery.slice(1, 5).map((image) => (
                <div
                  key={image.id}
                  className="relative aspect-square overflow-hidden rounded-xl bg-muted"
                >
                  <Image
                    src={image.url}
                    alt={image.alt ?? ""}
                    fill
                    sizes="20vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <header>
            <p className="text-sm text-muted-foreground">{item.category}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {item.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {item.location_city && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {item.location_city}
                </span>
              )}
              {item.operator_included && (
                <span className="flex items-center gap-1.5">
                  <UserCog className="size-4" />
                  Operator included
                </span>
              )}
              {item.delivery_available && (
                <span className="flex items-center gap-1.5">
                  <Truck className="size-4" />
                  Delivery available
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

          {item.description && (
            <p className="whitespace-pre-wrap text-muted-foreground">
              {item.description}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Spec label="Condition" value={CONDITION_LABEL[item.condition] ?? item.condition} />
            <Spec label="Brand" value={item.brand ?? "—"} />
            <Spec label="Model" value={item.model ?? "—"} />
            <Spec
              label="Year"
              value={item.year_made === null ? "—" : String(item.year_made)}
            />
          </dl>

          {booked.length > 0 && (
            <section className="rounded-2xl border p-4">
              <h2 className="flex items-center gap-2 font-medium">
                <CalendarRange className="size-4 text-brand" />
                Already booked
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {booked.map((range) => (
                  <li
                    key={`${range.starts_on}-${range.ends_on}`}
                    className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground"
                  >
                    {new Date(range.starts_on).toLocaleDateString()} –{" "}
                    {new Date(range.ends_on).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Reviews{" "}
              <span className="text-muted-foreground">({summary.total})</span>
            </h2>
            {reviews.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No reviews yet. The first renter can leave one.
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
            <dl className="space-y-2 text-sm">
              <Rate label="Per day" amount={item.daily_rate} currency={item.currency} />
              <Rate label="Per week" amount={item.weekly_rate} currency={item.currency} />
              <Rate label="Per month" amount={item.monthly_rate} currency={item.currency} />
              {item.deposit !== null && (
                <Rate
                  label="Deposit"
                  amount={item.deposit}
                  currency={item.currency}
                />
              )}
            </dl>

            <div className="mt-5 border-t pt-5">
              <BookingForm
                equipmentId={item.id}
                currency={item.currency}
                dailyRate={item.daily_rate}
                weeklyRate={item.weekly_rate}
                monthlyRate={item.monthly_rate}
                minDays={item.min_rental_days}
                signedIn={user !== null}
                isOwner={user?.id === item.owner_id}
                booked={booked}
              />
            </div>
          </div>

          <div className="rounded-2xl border p-5">
            <p className="text-xs text-muted-foreground">Listed by</p>
            <p className="mt-1 flex items-center gap-1.5 font-medium">
              {item.company?.slug ? (
                <Link
                  href={`/companies/${item.company.slug}`}
                  className="hover:underline"
                >
                  {ownerName}
                </Link>
              ) : item.owner?.username ? (
                <Link href={`/u/${item.owner.username}`} className="hover:underline">
                  {ownerName}
                </Link>
              ) : (
                ownerName
              )}
              <BadgeCheck className="size-4 text-brand" aria-hidden />
            </p>
            <Link
              href={`/messages?supplier=${item.owner_id}`}
              className="mt-3 flex items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition-colors hover:border-brand"
            >
              <MessageSquare className="size-4" />
              Message the owner
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function Rate({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: number | null;
  currency: string;
}) {
  if (amount === null) return null;
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">
        {formatPrice(amount, currency)}
      </dd>
    </div>
  );
}
