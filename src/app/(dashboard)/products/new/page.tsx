import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProductForm } from "@/components/products/product-form";
import { getProductCategories } from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add Product" };

export default async function NewProductPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const categories = await getProductCategories();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          List a product
        </h1>
        <p className="text-muted-foreground">
          Add photos, pricing, and details to publish this product to the
          marketplace.
        </p>
      </div>
      <ProductForm userId={user.id} categories={categories} />
    </div>
  );
}
