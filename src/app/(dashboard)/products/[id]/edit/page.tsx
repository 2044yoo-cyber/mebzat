import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProductForm } from "@/components/products/product-form";
import { getProductCategories } from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";
import type { Json, Product } from "@/types/database.types";

/**
 * specs is jsonb, so the column can hold anything. The form edits it as a flat
 * map of strings. A non-string value is dropped rather than coerced: rendering
 * an object as "[object Object]" into an editable field would let the user
 * save that string back over real data.
 */
function toSpecMap(value: Json): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export const metadata: Metadata = { title: "Edit Product" };

export default async function EditProductPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!product) {
    notFound();
  }

  const [{ data: images }, categories] = await Promise.all([
    supabase
      .from("product_images")
      .select("url, position")
      .eq("product_id", id)
      .order("position", { ascending: true }),
    getProductCategories(),
  ]);

  const initialImageUrls = (images ?? []).map((i) => i.url);
  const typedProduct = product as Product;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit product</h1>
        <p className="text-muted-foreground">
          Update the details, images, or availability of this product.
        </p>
      </div>
      <ProductForm
        userId={user.id}
        categories={categories}
        product={typedProduct}
        initialImageUrls={initialImageUrls}
        initialSpecs={toSpecMap(typedProduct.specs)}
      />
    </div>
  );
}
