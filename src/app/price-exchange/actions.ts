"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type ExchangeResult = { error?: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/price-exchange");
  return { supabase, user };
}

/**
 * Places or improves a competing offer.
 *
 * One open bid per supplier per listing is enforced by a unique constraint, so
 * a repeat submission updates the existing offer rather than stacking bids.
 */
export async function submitBid(
  listingId: string,
  price: number,
  unit: string,
  note?: string,
): Promise<ExchangeResult> {
  const { supabase, user } = await requireUser();

  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Enter a price above zero." };
  }
  if (price > 1_000_000_000) {
    return { error: "That price looks wrong — check the figure." };
  }

  const { data: listing } = await supabase
    .from("price_listings")
    .select("supplier_id")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing) return { error: "That listing no longer exists." };
  if (listing.supplier_id === user.id) {
    return { error: "You cannot bid on your own listing." };
  }

  const { error } = await supabase.from("price_bids").upsert(
    {
      listing_id: listingId,
      bidder_id: user.id,
      price,
      unit,
      note: note?.slice(0, 500) ?? null,
      status: "open",
    },
    { onConflict: "listing_id,bidder_id" },
  );

  if (error) return { error: "Could not submit that bid." };

  revalidatePath("/price-exchange");
  return {};
}

/** Follows or unfollows a listing, so its price moves reach the user. */
export async function toggleWatch(listingId: string): Promise<ExchangeResult> {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("price_watchers")
    .select("listing_id")
    .eq("listing_id", listingId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("price_watchers")
        .delete()
        .eq("listing_id", listingId)
        .eq("user_id", user.id)
    : await supabase
        .from("price_watchers")
        .insert({ listing_id: listingId, user_id: user.id });

  if (error) return { error: "Could not update your watch list." };

  revalidatePath("/price-exchange");
  return {};
}

/** Updates a supplier's own published price. History is written by trigger. */
export async function updatePrice(
  listingId: string,
  price: number,
): Promise<ExchangeResult> {
  const { supabase, user } = await requireUser();

  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Enter a price above zero." };
  }

  const { error } = await supabase
    .from("price_listings")
    .update({ current_price: price })
    .eq("id", listingId)
    .eq("supplier_id", user.id);

  if (error) return { error: "Could not update that price." };

  revalidatePath("/price-exchange");
  return {};
}
