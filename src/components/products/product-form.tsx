"use client";

import { useActionState, useState } from "react";

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
import {
  CONDITIONS,
  SELLABLE_CONDITIONS,
  STOCK_STATUS,
  USED_GRADES,
} from "@/lib/constants/product-categories";
import type {
  Product,
  ProductCategory,
  ProductCondition,
} from "@/types/database.types";

const initialState: ProductFormState = {};

export function ProductForm({
  userId,
  categories,
  product,
  initialImageUrls = [],
  initialSpecs = {},
  /** Preset by the page somebody arrived from — Used Items opens on Used. */
  initialCondition,
}: {
  userId: string;
  categories: Pick<ProductCategory, "id" | "name">[];
  product?: Product;
  initialImageUrls?: string[];
  initialSpecs?: Record<string, string>;
  initialCondition?: ProductCondition;
}) {
  const action = product
    ? updateProduct.bind(null, product.id)
    : createProduct;
  const [state, formAction, pending] = useActionState(action, initialState);

  // Which section the listing lands in, and the only thing that decides
  // whether the second-hand fields are worth asking for. Held in state rather
  // than read back from the form, because the fields have to appear as soon as
  // the seller picks Used, not after a round trip.
  const [condition, setCondition] = useState<ProductCondition>(
    // The listing being edited wins over the link that was followed: opening
    // a new listing's form from Used Items should default to Used, but
    // editing an existing new listing must not silently switch it.
    (product?.condition as ProductCondition | undefined) ??
      initialCondition ??
      "new",
  );
  const secondHand = condition !== "new";

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
          or remove it. Published photos carry your watermark.
        </p>
        {/* Only on a second-hand listing. A supplier photographing new stock
            does not need to be told to show the damage, and a shot list on
            every listing is a shot list nobody reads. */}
        {secondHand && (
          <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              What buyers ask for, in this order
            </p>
            <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              <li>Front, straight on</li>
              <li>Back</li>
              <li>Side</li>
              <li>Close-up of the surface or finish</li>
              <li>Every scratch, dent or missing part</li>
              <li>Serial or model plate, if it has one</li>
            </ul>
            <p className="mt-1.5">
              The damage photo is the one that sells it. A buyer who finds the
              scratch on collection walks away; one who saw it first turns up
              expecting it.
            </p>
          </div>
        )}
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

      <div className="space-y-4 rounded-xl border p-4">
        <div className="space-y-2">
          <Label htmlFor="condition">Condition</Label>
          <Select
            name="condition"
            value={condition}
            onValueChange={(value) => setCondition(value as ProductCondition)}
          >
            <SelectTrigger id="condition" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELLABLE_CONDITIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {CONDITIONS[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {secondHand
              ? "This listing will appear under Marketplace → Used Items. You do not need to post it twice."
              : "This listing will appear under Marketplace → New Items."}
          </p>
          {state.fieldErrors?.condition && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.condition}
            </p>
          )}
        </div>

        {/* Only asked for when they mean something. A form that shows every
            field to everybody is a form people abandon halfway. */}
        {secondHand && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="usedGrade">Used condition</Label>
                <Select
                  name="usedGrade"
                  defaultValue={product?.used_grade ?? "good"}
                >
                  <SelectTrigger id="usedGrade" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(USED_GRADES).map(([value, grade]) => (
                      <SelectItem key={value} value={value}>
                        {grade.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ageMonths">Age in months (optional)</Label>
                <Input
                  id="ageMonths"
                  name="ageMonths"
                  type="number"
                  min={0}
                  max={1200}
                  placeholder="30"
                  defaultValue={product?.age_months ?? ""}
                />
                {state.fieldErrors?.ageMonths && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.ageMonths}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="conditionNotes">
                Condition details (optional)
              </Label>
              <Textarea
                id="conditionNotes"
                name="conditionNotes"
                rows={2}
                placeholder="One owner, kept indoors, all parts present."
                defaultValue={product?.condition_notes ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="knownDefects">Known defects (optional)</Label>
              <Textarea
                id="knownDefects"
                name="knownDefects"
                rows={2}
                placeholder="Scratch on the left edge. Handle is loose."
                defaultValue={product?.known_defects ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                Say what is wrong. A buyer who finds out on collection leaves a
                review about it.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="saleReason">Reason for selling (optional)</Label>
              <Input
                id="saleReason"
                name="saleReason"
                placeholder="Moving office"
                defaultValue={product?.sale_reason ?? ""}
              />
            </div>
          </div>
        )}
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="locationCity">City</Label>
          <Input
            id="locationCity"
            name="locationCity"
            defaultValue={product?.location_city ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="locationArea">Area (optional)</Label>
          <Input
            id="locationArea"
            name="locationArea"
            placeholder="Bole"
            defaultValue={product?.location_area ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            A neighbourhood, not your address.
          </p>
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
