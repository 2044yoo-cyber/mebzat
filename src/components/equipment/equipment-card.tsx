import Image from "next/image";
import Link from "next/link";
import { MapPin, Star, UserCog } from "lucide-react";

import { PRODUCT_PLACEHOLDER } from "@/lib/constants/placeholders";
import { cn, formatPrice } from "@/lib/utils";
import type { Equipment } from "@/types/database.types";

export type EquipmentCardData = Pick<
  Equipment,
  | "id"
  | "title"
  | "category"
  | "brand"
  | "cover_image_url"
  | "daily_rate"
  | "weekly_rate"
  | "monthly_rate"
  | "currency"
  | "operator_included"
  | "location_city"
  | "rating"
  | "review_count"
  | "available"
> & {
  owner?: { full_name: string | null; company_name: string | null } | null;
  company?: { name: string } | null;
};

/** Falls back through the rates so a listing priced only by month still shows one. */
function headlineRate(item: EquipmentCardData): { amount: number | null; per: string } {
  if (item.daily_rate !== null) return { amount: item.daily_rate, per: "day" };
  if (item.weekly_rate !== null) return { amount: item.weekly_rate, per: "week" };
  return { amount: item.monthly_rate, per: "month" };
}

export function EquipmentCard({ item }: { item: EquipmentCardData }) {
  const ownerName =
    item.company?.name ?? item.owner?.company_name ?? item.owner?.full_name;
  const rate = headlineRate(item);

  return (
    <Link
      href={`/equipment/${item.id}`}
      className="group block overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-4/3 bg-muted">
        <Image
          src={item.cover_image_url || PRODUCT_PLACEHOLDER}
          alt={item.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span
          className={cn(
            "absolute top-3 left-3 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur",
            item.available
              ? "bg-emerald-500/90 text-white"
              : "bg-background/90 text-muted-foreground",
          )}
        >
          {item.available ? "Available" : "On hire"}
        </span>
        {item.operator_included && (
          <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium backdrop-blur">
            <UserCog className="size-3" /> Operator
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-4">
        <p className="text-xs text-muted-foreground">{item.category}</p>
        <h3 className="line-clamp-2 font-medium leading-snug">{item.title}</h3>

        <p className="font-semibold">
          {rate.amount === null ? (
            "Rate on request"
          ) : (
            <>
              {formatPrice(rate.amount, item.currency)}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {rate.per}
              </span>
            </>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.location_city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {item.location_city}
            </span>
          )}
          {item.review_count > 0 && (
            <span className="flex items-center gap-1">
              <Star className="size-3" />
              {Number(item.rating).toFixed(1)} ({item.review_count})
            </span>
          )}
        </div>

        {ownerName && (
          <p className="truncate text-xs text-muted-foreground">{ownerName}</p>
        )}
      </div>
    </Link>
  );
}
