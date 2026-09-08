import Image from "next/image";
import Link from "next/link";
import { ImageOff, MapPin } from "lucide-react";

import { ConditionBadge } from "@/components/products/condition-badge";
import { SaveButton } from "@/components/products/save-button";
import { STOCK_STATUS } from "@/lib/constants/product-categories";
import { cn, formatPrice } from "@/lib/utils";
import type { Product } from "@/types/database.types";

export type ProductCardData = Pick<
  Product,
  | "id"
  | "title"
  | "cover_image_url"
  | "price"
  | "currency"
  | "unit"
  | "brand"
  | "stock_status"
  | "status"
  | "condition"
  | "used_grade"
  | "location_city"
  | "location_area"
> & {
  supplier?: {
    full_name: string | null;
    company_name: string | null;
  } | null;
  favorited?: boolean;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const supplierName =
    product.supplier?.company_name || product.supplier?.full_name;
  const stock = STOCK_STATUS[product.stock_status];
  // Area first, city second — "Bole, Addis Ababa" is what somebody deciding
  // whether to go and collect a sofa actually needs.
  const place = [product.location_area, product.location_city]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/marketplace/${product.id}`}
      className="group block overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square bg-muted">
        {product.cover_image_url ? (
          <Image
            src={product.cover_image_url}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {product.status === "draft" && (
            <span className="rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">
              Draft
            </span>
          )}
          {/* From the column, so it cannot disagree with the section the
              listing appears in. */}
          <ConditionBadge
            condition={product.condition}
            grade={product.used_grade}
            className="bg-background/90"
          />
        </div>
        <div className="absolute right-3 top-3">
          <SaveButton
            productId={product.id}
            initialFavorited={product.favorited ?? false}
          />
        </div>
      </div>
      <div className="space-y-1 p-4">
        {product.brand && (
          <p className="text-xs font-medium text-muted-foreground">
            {product.brand}
          </p>
        )}
        <h3 className="truncate font-medium">{product.title}</h3>
        <div className="flex items-baseline justify-between gap-2 pt-0.5">
          <span className="font-semibold">
            {formatPrice(product.price, product.currency)}
            {product.price != null && product.unit && (
              <span className="text-xs font-normal text-muted-foreground">
                {" "}
                / {product.unit}
              </span>
            )}
          </span>
          <span
            className={cn(
              "shrink-0 text-xs",
              stock.tone === "positive" && "text-emerald-600 dark:text-emerald-500",
              stock.tone === "muted" && "text-muted-foreground",
              stock.tone === "negative" && "text-destructive",
            )}
          >
            {stock.label}
          </span>
        </div>
        {place && (
          <p className="flex items-center gap-1 truncate pt-1 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            {place}
          </p>
        )}
        {supplierName && (
          <p className="truncate pt-1 text-xs text-muted-foreground">
            by {supplierName}
          </p>
        )}
      </div>
    </Link>
  );
}
