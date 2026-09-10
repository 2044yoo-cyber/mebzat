"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import {
  digitalFieldsFor,
  parseSpecs,
  productSchema,
  type ProductFormValues,
  usedFieldsFor,
} from "@/lib/validations/product";
import type {
  ProductCondition,
  ProductStatus,
  StockStatus,
} from "@/types/database.types";

export type ProductFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseImageUrls(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((u): u is string => typeof u === "string");
    }
  } catch {
    // ignore malformed payloads
  }
  return [];
}

function buildValues(formData: FormData) {
  return productSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    brand: formData.get("brand"),
    price: formData.get("price") || undefined,
    currency: formData.get("currency"),
    unit: formData.get("unit"),
    stockStatus: formData.get("stockStatus"),
    fulfilment: formData.get("fulfilment"),
    digitalKind: formData.get("digitalKind"),
    fileFormat: formData.get("fileFormat"),
    fileSizeMb: formData.get("fileSizeMb") || undefined,
    license: formData.get("license"),
    condition: formData.get("condition"),
    usedGrade: formData.get("usedGrade"),
    conditionNotes: formData.get("conditionNotes"),
    knownDefects: formData.get("knownDefects"),
    saleReason: formData.get("saleReason"),
    ageMonths: formData.get("ageMonths") || undefined,
    locationCity: formData.get("locationCity"),
    locationArea: formData.get("locationArea"),
    locationCountry: formData.get("locationCountry"),
    deliveryAvailable: formData.get("deliveryAvailable") === "on",
    specs: formData.get("specs"),
    status: formData.get("status"),
  });
}

function collectFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    fieldErrors[String(issue.path[0])] = issue.message;
  }
  return fieldErrors;
}

function toColumns(data: ProductFormValues) {
  return {
    title: data.title,
    description: data.description || null,
    category_id: data.categoryId || null,
    brand: data.brand || null,
    price: data.price ?? null,
    currency: data.currency || "USD",
    unit: data.unit || null,
    stock_status: data.stockStatus as StockStatus,
    // The two columns that decide the section. Nothing else on the row says
    // "used" or "digital", so nothing else can disagree with them.
    //
    // A file is never second-hand and never shipped, and the database refuses
    // a listing that claims otherwise. Forced rather than validated: a seller
    // who set a condition and then chose Digital meant Digital.
    condition: (data.fulfilment === "digital"
      ? "new"
      : data.condition) as ProductCondition,
    ...usedFieldsFor(
      data.fulfilment === "digital" ? { ...data, condition: "new" } : data,
    ),
    ...digitalFieldsFor(data),
    location_city: data.locationCity || null,
    location_area: data.locationArea || null,
    location_country: data.locationCountry || null,
    delivery_available:
      data.fulfilment === "digital" ? false : Boolean(data.deliveryAvailable),
    specs: parseSpecs(data.specs),
    status: data.status as ProductStatus,
  };
}

export async function createProduct(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = buildValues(formData);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Log in again." };
  }

  const columns = toColumns(parsed.data);
  const images = parseImageUrls(formData.get("images"));
  const baseSlug = slugify(columns.title) || "product";

  let productId: string | null = null;
  for (let attempt = 0; attempt < 2 && !productId; attempt++) {
    const slug =
      attempt === 0
        ? baseSlug
        : `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

    const { data, error } = await supabase
      .from("products")
      .insert({
        ...columns,
        owner_id: user.id,
        slug,
        cover_image_url: images[0] ?? null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") continue; // slug clash, retry
      return { error: error.message };
    }
    productId = data.id;
  }

  if (!productId) {
    return { error: "Could not save product. Try a different name." };
  }

  if (images.length > 0) {
    const { error: imageError } = await supabase.from("product_images").insert(
      images.map((url, position) => ({
        product_id: productId!,
        url,
        position,
      })),
    );
    if (imageError) {
      return { error: imageError.message };
    }
  }

  revalidatePath("/products");
  revalidatePath("/marketplace");
  revalidatePath("/dashboard");
  redirect(`/marketplace/${productId}`);
}

export async function updateProduct(
  productId: string,
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = buildValues(formData);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Log in again." };
  }

  const columns = toColumns(parsed.data);
  const images = parseImageUrls(formData.get("images"));

  const { error } = await supabase
    .from("products")
    .update({ ...columns, cover_image_url: images[0] ?? null })
    .eq("id", productId)
    .eq("owner_id", user.id);

  if (error) {
    return { error: error.message };
  }

  // Replace the image set; RLS restricts these rows to the owner's products.
  await supabase.from("product_images").delete().eq("product_id", productId);
  if (images.length > 0) {
    await supabase.from("product_images").insert(
      images.map((url, position) => ({
        product_id: productId,
        url,
        position,
      })),
    );
  }

  revalidatePath("/products");
  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${productId}`);
  redirect(`/marketplace/${productId}`);
}

export async function deleteProduct(productId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("owner_id", user.id);

  revalidatePath("/products");
  revalidatePath("/marketplace");
  revalidatePath("/dashboard");
  redirect("/products");
}
