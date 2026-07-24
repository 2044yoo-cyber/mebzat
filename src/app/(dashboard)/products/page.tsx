import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, Plus, Store } from "lucide-react";

import { ProductCard } from "@/components/products/product-card";
import type { ProductCardData } from "@/components/products/product-card";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Products" };

export default async function MyProductsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("products")
    .select(
      "id, title, cover_image_url, price, currency, unit, brand, stock_status, status",
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const products = (data ?? []) as ProductCardData[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My products</h1>
          <p className="text-muted-foreground">
            Products you&apos;ve listed on the marketplace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/marketplace"
            className={buttonVariants({ variant: "outline" })}
          >
            <Store className="size-4" /> Marketplace
          </Link>
          <Link href="/products/new" className={buttonVariants()}>
            <Plus className="size-4" /> New product
          </Link>
        </div>
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center">
          <Package className="size-8 text-muted-foreground" />
          <p className="font-medium">No products yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            List your first product with photos, pricing, and specs to reach
            buyers across the network.
          </p>
          <Link
            href="/products/new"
            className={buttonVariants({ variant: "outline" })}
          >
            <Plus className="size-4" /> List your first product
          </Link>
        </div>
      )}
    </div>
  );
}
