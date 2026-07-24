"use client";

import { useActionState } from "react";

import {
  createProduct,
  updateProduct,
  type ProductFormState,
} from "@/app/(dashboard)/products/actions";
import { ProductImagesInput } from "@/components/products/product-images-input";
import { SpecsInput } from "@/components/products/specs-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STOCK_STATUS } from "@/lib/constants/product-categories";
import type { Product, ProductCategory } from "@/types/database.types";

const initialState: ProductFormState = {};

export function ProductForm({
  userId,
  categories,
  product,
  initialImageUrls = [],
  initialSpecs = {},
}: {
  userId: string;
  categories: Pick<ProductCategory, "id" | "name">[];
  product?: Product;
  initialImageUrls?: string[];
  initialSpecs?: Record<string, string>;
}) {
  const action = product
    ? updateProduct.bind(null, product.id)
    : createProduct;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Product name</Label>
        <Input
          id="title"
          name="title"
          defaultValue={product?.title ?? ""}
          placeholder="Porcelain Floor Tile 60×60"
          required
        />
        {state.fieldErrors?.title && (
          <p className="text-sm text-destructive">{state.fieldErrors.title}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Images</Label>
        <ProductImagesInput userId={userId} initialUrls={initialImageUrls} />
        <p className="text-xs text-muted-foreground">
          The first image is the cover. Hover an image to set a different cover
          or remove it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Category</Label>
          <Select name="categoryId" defaultValue={product?.category_id ?? undefined}>
            <SelectTrigger id="categoryId" className="w-full">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            name="brand"
            defaultValue={product?.brand ?? ""}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={product?.price ?? ""}
          />
          {state.fieldErrors?.price && (
            <p className="text-sm text-destructive">{state.fieldErrors.price}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={product?.currency ?? "USD"}
            maxLength={8}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            name="unit"
            defaultValue={product?.unit ?? ""}
            placeholder="per m², per piece…"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stockStatus">Availability</Label>
        <Select
          name="stockStatus"
          defaultValue={product?.stock_status ?? "in_stock"}
        >
          <SelectTrigger id="stockStatus" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STOCK_STATUS).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="locationCity">City</Label>
          <Input
            id="locationCity"
            name="locationCity"
            defaultValue={product?.location_city ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="locationCountry">Country</Label>
          <Input
            id="locationCountry"
            name="locationCountry"
            defaultValue={product?.location_country ?? ""}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          name="deliveryAvailable"
          value="on"
          defaultChecked={product?.delivery_available ?? false}
        />
        Delivery available
      </label>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={product?.description ?? ""}
          placeholder="Describe the product, its finish, dimensions, and what makes it a good choice."
        />
        {state.fieldErrors?.description && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.description}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Specifications</Label>
        <SpecsInput defaultValue={initialSpecs} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Visibility</Label>
        <Select name="status" defaultValue={product?.status ?? "published"}>
          <SelectTrigger id="status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="published">
              Published — visible to everyone
            </SelectItem>
            <SelectItem value="draft">Draft — only you can see it</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : product
            ? "Save changes"
            : "Publish product"}
      </Button>
    </form>
  );
}
