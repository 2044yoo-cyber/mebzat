"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * The one billing write a member makes directly.
 *
 * Cancelling is the only change to a subscription that does not involve money
 * moving, so it is the only one that is a server action rather than a payment
 * flow. It calls `cancel_subscription()`, which stops the renewal and leaves
 * access alone until the period ends — taking the plan away the moment somebody
 * cancels is taking money for a month they cannot use.
 *
 * Buying, upgrading and topping up all go through `/api/billing/checkout`
 * instead, because they end at a provider's page rather than back here.
 */

export type BillingResult = { ok?: boolean; error?: string };

export async function cancelSubscription(): Promise<BillingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sign in first." };

  const { error } = await supabase.rpc("cancel_subscription");

  if (error) {
    console.error("[billing] cancel failed:", error.message);
    return { error: "The subscription could not be cancelled. Try again." };
  }

  revalidatePath("/billing");
  return { ok: true };
}
