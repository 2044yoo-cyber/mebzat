import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProductForm } from "@/components/products/product-form";
import { SELLABLE_CONDITIONS } from "@/lib/constants/product-categories";
import { getProductCategories } from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";
import type { ProductCondition } from "@/types/database.types";

export const metadata: Metadata = { title: "Add Product" };

export default async function NewProductPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const raw = Array.isArray(sp.condition) ? sp.condition[0] : sp.condition;

  // Validated against what the form can actually offer, not trusted. A query
  // parameter naming a condition the form has never shipped would render a
  // select with no matching option and silently save as new.
  const condition: ProductCondition | undefined =
    raw && (SELLABLE_CONDITIONS as string[]).includes(raw)
      ? (raw as ProductCondition)
      : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // A fallback, not the path this normally takes: `/products/new` is in
    // PROTECTED_ROUTES, so the middleware redirects before this file runs. It
    // is here in case that list changes, and it uses `redirect` — the
    // parameter the login form actually reads — rather than `next`, which is
    // the OAuth callback's name for the same idea and is ignored here.
    const target = condition
      ? `/products/new?condition=${condition}`
      : "/products/new";
    redirect(`/login?redirect=${encodeURIComponent(target)}`);
  }

  const categories = await getProductCategories();
  const secondHand = condition !== undefined && condition !== "new";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {secondHand ? "Sell something used" : "List a product"}
        </h1>
        <p className="text-muted-foreground">
          {secondHand
            ? "Photos, a price and an honest description of the condition. It publishes to Marketplace → Used Items."
            : "Add photos, pricing, and details to publish this product to the marketplace."}
        </p>
      </div>
      <ProductForm
        userId={user.id}
        categories={categories}
        initialCondition={condition}
      />
    </div>
  );
}
