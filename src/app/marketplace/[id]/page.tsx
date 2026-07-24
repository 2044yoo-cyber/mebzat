import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Eye,
  MapPin,
  Store,
  Truck,
} from "lucide-react";

import { CategoryIcon } from "@/components/products/category-icon";
import { ProductCard } from "@/components/products/product-card";
import { ProductGallery } from "@/components/products/product-gallery";
import { ProductOwnerActions } from "@/components/products/product-owner-actions";
import { SaveButton } from "@/components/products/save-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { STOCK_STATUS } from "@/lib/constants/product-categories";
import { withFavorites } from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";
import { cn, formatPrice } from "@/lib/utils";
import type { ProductCardData } from "@/components/products/product-card";

type Supplier = {
  id: string;
  username: string | null;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  location_city: string | null;
  location_country: string | null;
  verification_status: string;
};

const DETAIL_COLUMNS = `
  *,
  supplier:profiles!owner_id(id, username, full_name, company_name, avatar_url, location_city, location_country, verification_status),
  category:product_categories(slug, name),
  images:product_images(url, position)
`;

async function loadProduct(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data as
    | (Record<string, unknown> & {
        supplier: Supplier | null;
        category: { slug: string; name: string } | null;
        images: { url: string; position: number }[] | null;
      })
    | null;
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const product = await loadProduct(id);
  if (!product) return { title: "Product not found" };
  const title = String(product.title);
  const description =
    (product.description as string | null)?.slice(0, 155) ||
    `${title} on the Medosha marketplace.`;
  const image = product.cover_image_url as string | null;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const product = await loadProduct(id);
  if (!product) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ownerId = product.owner_id as string;
  const isOwner = user?.id === ownerId;

  if (!isOwner) {
    await supabase.rpc("increment_product_views", { product_id: id });
  }

  let favorited = false;
  if (user) {
    const { data } = await supabase
      .from("product_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("product_id", id)
      .maybeSingle();
    favorited = Boolean(data);
  }

  const supplier = product.supplier;
  const category = product.category;
  const images = (product.images ?? [])
    .sort((a, b) => a.position - b.position)
    .map((i) => i.url);
  const cover = product.cover_image_url as string | null;
  const galleryImages = images.length > 0 ? images : cover ? [cover] : [];

  const specs = (product.specs ?? {}) as Record<string, string>;
  const specEntries = Object.entries(specs);
  const stock = STOCK_STATUS[product.stock_status as keyof typeof STOCK_STATUS];
  const supplierName = supplier?.company_name || supplier?.full_name || "Supplier";
  const price = product.price as number | null;
  const currency = product.currency as string;

  // Related products in the same category.
  let related: ProductCardData[] = [];
  if (product.category_id) {
    const { data } = await supabase
      .from("products")
      .select(
        "id, title, cover_image_url, price, currency, unit, brand, stock_status, status, supplier:profiles!owner_id(full_name, company_name)",
      )
      .eq("status", "published")
      .eq("category_id", product.category_id as string)
      .neq("id", id)
      .order("created_at", { ascending: false })
      .limit(4);
    related = await withFavorites(
      (data ?? []) as unknown as ProductCardData[],
      user?.id,
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: galleryImages,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    category: category?.name,
    offers:
      price != null
        ? {
            "@type": "Offer",
            price,
            priceCurrency: currency,
            availability:
              product.stock_status === "out_of_stock"
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
          }
        : undefined,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/marketplace" className="hover:text-foreground">
          Marketplace
        </Link>
        {category && (
          <>
            <span>/</span>
            <Link
              href={`/marketplace?category=${category.slug}`}
              className="hover:text-foreground"
            >
              {category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery images={galleryImages} alt={String(product.title)} />

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {category && (
                <Badge variant="secondary" className="gap-1">
                  <CategoryIcon slug={category.slug} className="size-3" />
                  {category.name}
                </Badge>
              )}
              {product.status === "draft" && <Badge>Draft</Badge>}
            </div>
            {product.brand ? (
              <p className="text-sm font-medium text-muted-foreground">
                {String(product.brand)}
              </p>
            ) : null}
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {String(product.title)}
            </h1>
          </div>

          <div className="flex items-end gap-3">
            <span className="text-3xl font-semibold">
              {formatPrice(price, currency)}
            </span>
            {price != null && product.unit ? (
              <span className="pb-1 text-sm text-muted-foreground">
                / {String(product.unit)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span
              className={cn(
                "font-medium",
                stock.tone === "positive" &&
                  "text-emerald-600 dark:text-emerald-500",
                stock.tone === "muted" && "text-muted-foreground",
                stock.tone === "negative" && "text-destructive",
              )}
            >
              {stock.label}
            </span>
            {product.delivery_available ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Truck className="size-4" /> Delivery available
              </span>
            ) : null}
            {product.location_city || product.location_country ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="size-4" />
                {[product.location_city, product.location_country]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            ) : null}
            <span className="flex items-center gap-1 text-muted-foreground">
              <Eye className="size-4" /> {String(product.views)} views
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {isOwner ? (
              <ProductOwnerActions productId={id} />
            ) : (
              <>
                <SaveButton
                  productId={id}
                  initialFavorited={favorited}
                  variant="labeled"
                  className="h-9"
                />
                {supplier?.username && (
                  <Link
                    href={`/u/${supplier.username}`}
                    className={buttonVariants()}
                  >
                    <Store className="size-4" /> Contact supplier
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Supplier card */}
          {supplier && (
            <Link
              href={supplier.username ? `/u/${supplier.username}` : "#"}
              className="flex items-center gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted/50"
            >
              <Avatar className="size-11">
                <AvatarImage
                  src={supplier.avatar_url ?? undefined}
                  alt={supplierName}
                />
                <AvatarFallback>
                  {supplierName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-medium">
                  {supplierName}
                  {supplier.verification_status === "verified" && (
                    <BadgeCheck className="size-4 text-brand" />
                  )}
                </p>
                {(supplier.location_city || supplier.location_country) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[supplier.location_city, supplier.location_country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
            </Link>
          )}
        </div>
      </div>

      {product.description ? (
        <section className="mt-12 max-w-3xl">
          <h2 className="text-lg font-semibold">Description</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">
            {String(product.description)}
          </p>
        </section>
      ) : null}

      {specEntries.length > 0 && (
        <section className="mt-12 max-w-3xl">
          <h2 className="text-lg font-semibold">Specifications</h2>
          <dl className="mt-3 divide-y rounded-2xl border">
            {specEntries.map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between gap-4 px-4 py-3 text-sm"
              >
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-4 text-lg font-semibold">
            More in {category?.name}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
