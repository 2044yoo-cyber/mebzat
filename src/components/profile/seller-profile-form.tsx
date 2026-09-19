"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  saveSellerProfile,
  type SaveResult,
} from "@/app/(dashboard)/profile/seller/actions";
import { ServiceAreaPicker } from "@/components/profile/service-area-picker";
import type { AreaOption } from "@/components/profile/trade-and-areas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { categoryIcon } from "@/lib/constants/product-categories";
import { cn } from "@/lib/utils";
import type { SellerProfile } from "@/types/database.types";

const initialState: SaveResult = {};

export type CategoryOption = { slug: string; name: string };

/**
 * A shop's own details.
 *
 * The categories are the point of it. Somebody looking for cement finds a
 * supplier by what they stock, and the delivery areas decide whether that
 * supplier is any use to a site in Legetafo — so both are asked here and
 * neither is buried behind a disclosure.
 *
 * The delivery note only appears once delivery is ticked. A note about a
 * service that is switched off reads as a promise, and the action drops it
 * with the tick so the two cannot disagree.
 */
export function SellerProfileForm({
  seller,
  categories,
  areas,
  selectedAreas,
}: {
  seller: SellerProfile | null;
  categories: CategoryOption[];
  areas: AreaOption[];
  selectedAreas: string[];
}) {
  const [chosen, setChosen] = useState<string[]>(seller?.category_slugs ?? []);
  const [delivers, setDelivers] = useState(seller?.delivers ?? false);

  const [state, formAction, pending] = useActionState(
    async (_prev: SaveResult, formData: FormData) =>
      saveSellerProfile(formData),
    initialState,
  );

  useEffect(() => {
    if (state.savedAt) toast.success("Shop profile saved");
  }, [state.savedAt]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  function toggle(slug: string) {
    setChosen((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-4 rounded-xl border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="storeName">Shop or business name</Label>
            <Input
              id="storeName"
              name="storeName"
              defaultValue={seller?.store_name ?? ""}
              placeholder="What is on the sign"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPhone">Phone for orders</Label>
            <Input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              defaultValue={seller?.contact_phone ?? ""}
              placeholder="Leave blank to use your account number"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="contactEmail">Email for orders</Label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={seller?.contact_email ?? ""}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="about">About the shop</Label>
          <Textarea
            id="about"
            name="about"
            rows={4}
            defaultValue={seller?.about ?? ""}
            placeholder="What you stock, the brands you carry, opening hours."
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>What you sell</Label>
          <span className="text-xs text-muted-foreground">
            {chosen.length} selected
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Buyers filter the marketplace by these.
        </p>

        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No categories are set up yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const on = chosen.includes(category.slug);
              const Icon = categoryIcon(category.slug);
              return (
                <label
                  key={category.slug}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                    on
                      ? "border-brand bg-brand text-brand-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    name="categories"
                    value={category.slug}
                    checked={on}
                    onChange={() => toggle(category.slug)}
                    className="sr-only"
                  />
                  <Icon className="size-3.5" />
                  {category.name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <ServiceAreaPicker
          areas={areas}
          selected={selectedAreas}
          label="Areas you serve"
          help="Where you will send materials, or where customers can collect from."
        />

        <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
          <input
            type="checkbox"
            name="delivers"
            checked={delivers}
            onChange={(event) => setDelivers(event.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          I deliver to site
        </label>

        {delivers && (
          <div className="space-y-2">
            <Label htmlFor="deliveryNote">Delivery terms</Label>
            <Input
              id="deliveryNote"
              name="deliveryNote"
              defaultValue={seller?.delivery_note ?? ""}
              placeholder="Free over 10,000 ETB, otherwise 500 ETB in the city"
            />
          </div>
        )}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save shop profile"}
      </Button>
    </form>
  );
}
