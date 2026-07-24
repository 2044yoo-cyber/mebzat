import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, Store } from "lucide-react";

import { ProductCard } from "@/components/products/product-card";
import type { ProductCardData } from "@/components/products/product-card";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved Products" };

export default async function SavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("product_favorites")
    .select(
      "product:products(id, title, cover_image_url, price, currency, unit, brand, stock_status, status, supplier:profiles!owner_id(full_name, company_name))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const products = ((data ?? [])
    .map((row) => row.product)
    .filter(Boolean) as unknown as ProductCardData[]).map((p) => ({
    ...p,
    favorited: true,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Saved products
        </h1>
        <p className="text-muted-foreground">
          Products you&apos;ve bookmarked from the marketplace.
        </p>
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center">
          <Bookmark className="size-8 text-muted-foreground" />
          <p className="font-medium">Nothing saved yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Tap the bookmark on any product to save it here for later.
          </p>
          <Link
            href="/marketplace"
            className={buttonVariants({ variant: "outline" })}
          >
            <Store className="size-4" /> Browse the marketplace
          </Link>
        </div>
      )}
    </div>
  );
}
