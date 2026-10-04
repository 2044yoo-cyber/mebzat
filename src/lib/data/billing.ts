import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  AccountPlan,
  AiOperationCost,
  BillingProduct,
  CreditLedgerEntry,
  CreditWallet,
  Payment,
  Subscription,
} from "@/types/database.types";

/**
 * Reads for the billing page.
 *
 * Every query here goes through the member's own client, not the service role,
 * and none of them filters by user id. That is not an oversight — `credit_
 * wallets`, `credit_ledger`, `payments` and `subscriptions` each have a select
 * policy of `user_id = auth.uid()` and nothing else, so the filter is already
 * applied underneath. Adding `.eq("user_id", …)` on top would be a second copy
 * of the rule, and a second copy is a second thing to get wrong.
 *
 * The one exception is deliberate: `getWallet` reports a zero balance rather
 * than throwing when there is no row. A member whose wallet has not been
 * created yet should see "0 credits", not an error page.
 */

export type BillingOverview = {
  plan: AccountPlan;
  isAdmin: boolean;
  wallet: CreditWallet;
  subscription: Subscription | null;
  costs: AiOperationCost[];
};

const EMPTY_WALLET = (userId: string): CreditWallet => ({
  user_id: userId,
  balance: 0,
  reserved: 0,
  lifetime_granted: 0,
  lifetime_spent: 0,
  updated_at: new Date().toISOString(),
});

export async function getBillingOverview(): Promise<BillingOverview | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Four independent reads, so they go together. Sequential would be four
  // round trips to answer one page.
  const [profile, wallet, subscription, costs] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, is_admin")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("credit_wallets").select("*").maybeSingle(),
    supabase
      .from("subscriptions")
      .select("*")
      // The current one is the one that ends last. A member who upgraded
      // mid-month has an expired row alongside the live one, and ordering by
      // creation date would sometimes pick the wrong one.
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ai_operation_costs")
      .select("*")
      .eq("active", true)
      .order("credits", { ascending: true }),
  ]);

  return {
    plan: profile.data?.plan ?? "free",
    isAdmin: profile.data?.is_admin ?? false,
    wallet: wallet.data ?? EMPTY_WALLET(user.id),
    // An expired subscription is not a current one. It stays in the table for
    // the history, but the page should not offer to cancel something that has
    // already ended.
    subscription:
      subscription.data && subscription.data.status !== "expired"
        ? subscription.data
        : null,
    costs: costs.data ?? [],
  };
}

/** The price list, in the order it should be shown. */
export async function getBillingProducts(): Promise<{
  plans: BillingProduct[];
  bundles: BillingProduct[];
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("billing_products")
    .select("*")
    .eq("active", true)
    .order("sort", { ascending: true });

  const products = data ?? [];
  return {
    plans: products.filter((p) => p.purpose === "subscription"),
    bundles: products.filter((p) => p.purpose === "credits"),
  };
}

/**
 * What the credits went on.
 *
 * Reserve entries are excluded and their settlements are not. A reservation
 * that was committed shows once, as a spend; one that was refunded shows once,
 * as a refund. Showing all three would list every operation two or three times
 * and make a balance look like it moved further than it did.
 */
export async function getCreditHistory(
  limit = 50,
): Promise<CreditLedgerEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_ledger")
    .select("*")
    .neq("kind", "reserve")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

/** Receipts. Pending rows are included — an unfinished payment is a question. */
export async function getPaymentHistory(limit = 25): Promise<Payment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

/**
 * What the member has spent credits on lately, by operation.
 *
 * Summed here rather than in SQL because the numbers are small — fifty rows at
 * most — and a view for this would be a migration to change every time somebody
 * wants a different window.
 */
export type UsageLine = { operation: string; credits: number; count: number };

export async function getCreditUsage(days = 30): Promise<UsageLine[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("credit_ledger")
    .select("operation, amount, kind")
    .eq("kind", "spend")
    .gte("created_at", since)
    .limit(500);

  const totals = new Map<string, UsageLine>();
  for (const row of data ?? []) {
    const key = row.operation ?? "other";
    const line = totals.get(key) ?? { operation: key, credits: 0, count: 0 };
    // Spends are stored negative, because the ledger is a ledger.
    line.credits += Math.abs(row.amount);
    line.count += 1;
    totals.set(key, line);
  }

  return [...totals.values()].sort((a, b) => b.credits - a.credits);
}
