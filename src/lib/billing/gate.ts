import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import { planLabel, type AccountPlan, type AiOperation } from "./operations";

/**
 * The gate every paid operation goes through.
 *
 * The order is fixed and it matters: **authenticate, check the plan, check the
 * permission, take the credits, then do the work.** Anything that runs before
 * the credits are held is work somebody can get for free by disconnecting, and
 * anything that checks the plan after the provider call is a check that has
 * already cost money.
 *
 * Server-side, always. The brief said "do not rely on hiding frontend buttons"
 * and that is the whole design here — the browser never sends a price, never
 * sends a plan, and never sends a credit count. It sends an operation *name*,
 * and everything else is looked up.
 *
 * ## Reserve, then settle
 *
 * Credits leave the balance before the work starts and are settled after. This
 * is not bookkeeping neatness; it is the only arrangement that survives two
 * requests arriving at once. Deducting after a successful call means a member
 * with 40 credits can start three 40-credit takeoffs in the time it takes the
 * first to answer, and the provider bills for all three.
 *
 * The cost of reserving first is that a crash between reserve and settle leaves
 * a hold nobody released. That is what `credits_expire_stale()` is for: holds
 * older than two hours are returned. A stuck hold is recoverable; a race that
 * gives away three takeoffs is not.
 */

type Client = SupabaseClient<Database>;

/** Why the gate said no, in a shape a route can turn into a response. */
export type GateRefusal = {
  ok: false;
  /** What the route should return. */
  status: number;
  /** Safe to show a member. Never a raw database message. */
  error: string;
  reason:
    | "unauthenticated"
    | "plan"
    | "credits"
    | "unknown-operation"
    | "unavailable";
  /** Set when the refusal was about money or plan, so the UI can offer a fix. */
  credits?: number;
  balance?: number;
  plan?: AccountPlan;
  minPlan?: AccountPlan;
};

/** Credits are held. Exactly one of `commit` or `refund` should follow. */
export type CreditHold = {
  ok: true;
  reservationId: string;
  /** What is being held. Zero for an admin, who runs everything free. */
  credits: number;
  /**
   * Spends the hold, at what it actually cost.
   *
   * `actual` is the metered figure — tokens for an answer, images produced for
   * a render. Anything held above it goes straight back to the balance. Omit it
   * and the whole hold is spent, which is right for an operation whose price is
   * a flat rate rather than an estimate.
   *
   * The database clamps `actual` to the hold in both directions, so a caller
   * that meters badly cannot overcharge and cannot pay somebody out.
   */
  commit: (actual?: number) => Promise<void>;
  refund: (reason: string) => Promise<void>;
};

export type CreditContext = {
  projectId?: string | null;
  designId?: string | null;
  /** Shown in the member's credit history, so make it read like a receipt. */
  description?: string | null;
  /** Reuses an existing client rather than making a second one. */
  client?: Client;
  /**
   * Hold more than the list price, for a job already known to be large.
   *
   * Four images rather than one. The database raises the hold to this but will
   * never lower it below the operation's price.
   */
  estimate?: number;
};

/**
 * Holds the credits for one operation, or explains why it cannot.
 *
 * Prefer {@link withCredits}, which cannot forget to settle. Use this directly
 * only when the work outlives the request — a queued job, say — and the
 * reservation has to be settled somewhere else.
 */
export async function holdCredits(
  operation: AiOperation,
  context: CreditContext = {},
): Promise<CreditHold | GateRefusal> {
  const supabase = context.client ?? ((await createClient()) as Client);

  // 1. Authenticate. `getUser()` and not `getSession()`: a session read from a
  //    cookie is whatever the cookie says, and this one decides who is charged.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Sign in to use this.",
      reason: "unauthenticated",
    };
  }

  // 2–4. Plan, permission and balance are all checked inside `credits_reserve`,
  //      under a row lock, in one statement. Checking them out here first and
  //      reserving afterwards would reintroduce exactly the race the lock
  //      exists to close.
  const { data, error } = await supabase.rpc("credits_reserve", {
    p_operation: operation,
    p_project: context.projectId ?? null,
    p_design: context.designId ?? null,
    p_description: context.description ?? null,
    p_estimate: context.estimate ?? null,
  });

  if (error || typeof data !== "string") {
    return await explainRefusal(supabase, operation, error);
  }

  const reservationId = data;
  let settled = false;

  return {
    ok: true,
    reservationId,
    credits: await reservedAmount(supabase, reservationId),

    async commit(actual?: number) {
      if (settled) return;
      settled = true;
      const { error: failure } = await supabase.rpc("credits_commit", {
        p_reservation: reservationId,
        p_actual: Number.isFinite(actual) ? (actual as number) : null,
      });
      // A failed commit must not fail the operation the member already
      // received. It leaves an open hold, which expiry will return — the member
      // is out nothing, and the log says what happened.
      if (failure) {
        console.error(`[billing] commit failed for ${reservationId}:`, failure.message);
      }
    },

    async refund(reason: string) {
      if (settled) return;
      settled = true;
      const { error: failure } = await supabase.rpc("credits_refund", {
        p_reservation: reservationId,
        p_reason: reason.slice(0, 500),
      });
      if (failure) {
        console.error(`[billing] refund failed for ${reservationId}:`, failure.message);
      }
    },
  };
}

/** What the run did, and whether it should be paid for. */
export type CreditOutcome<T> =
  | {
      charge: true;
      value: T;
      /**
       * What it actually cost, if the caller measured it.
       *
       * Omitted, the whole hold is spent. Supplied, the difference is returned
       * — which is how a question that used four hundred tokens costs less than
       * one that used four thousand, without either of them being guessed at
       * before the model answered.
       */
      actual?: number;
    }
  | { charge: false; reason: string; value: T };

export type CreditResult<T> =
  | { ok: true; value: T; credits: number; charged: boolean }
  | GateRefusal;

/**
 * Runs something on credit and settles it either way.
 *
 * The run returns `{ charge: false, reason }` for a failure the member should
 * not pay for — a provider timeout, a malformed reply, a 502 — and the credits
 * go back. This is the brief's "if an AI operation fails, credits must be
 * refunded", and it is deliberately the *caller's* judgement rather than an
 * exception check, because the routes here turn provider failures into ordinary
 * return values and an automatic rule would charge for every one of them.
 *
 * A thrown error refunds and rethrows.
 */
export async function withCredits<T>(
  operation: AiOperation,
  context: CreditContext,
  run: (hold: CreditHold) => Promise<CreditOutcome<T>>,
): Promise<CreditResult<T>> {
  const hold = await holdCredits(operation, context);
  if (!hold.ok) return hold;

  let outcome: CreditOutcome<T>;
  try {
    outcome = await run(hold);
  } catch (error) {
    await hold.refund(
      error instanceof Error ? error.message : "the operation failed",
    );
    throw error;
  }

  if (outcome.charge) {
    await hold.commit(outcome.actual);
  } else {
    await hold.refund(outcome.reason);
  }

  return {
    ok: true,
    value: outcome.value,
    credits: outcome.charge ? (outcome.actual ?? hold.credits) : 0,
    charged: outcome.charge,
  };
}

/**
 * What an operation would cost this member, and whether they may run it.
 *
 * For showing a price before somebody commits to spending it. Never used to
 * decide anything — the decision is `credits_reserve`, atomically, at the
 * moment of spending. A preflight that passed and a reserve that failed is a
 * normal outcome when two tabs are open.
 */
export type Preflight = {
  allowed: boolean;
  reason: string | null;
  credits: number;
  balance: number;
  plan: AccountPlan;
  minPlan: AccountPlan;
};

export async function preflight(
  operation: AiOperation,
  client?: Client,
): Promise<Preflight | null> {
  const supabase = client ?? ((await createClient()) as Client);
  const { data, error } = await supabase.rpc("credit_preflight", {
    p_operation: operation,
  });

  if (error || !data || data.length === 0) return null;
  const row = data[0];
  if (!row) return null;

  return {
    allowed: row.allowed,
    reason: row.reason,
    credits: row.credits,
    balance: row.balance,
    plan: row.plan,
    minPlan: row.min_plan,
  };
}

/**
 * Turns a reservation failure into something worth reading.
 *
 * The raw message from Postgres names functions and columns, so it never goes
 * to the browser. Instead the SQLSTATE says which of the four refusals it was,
 * and a preflight supplies the numbers — "40 credits, you have 12" tells
 * somebody what to do, where "not allowed" leaves them guessing.
 *
 * The extra round trip is on the failure path only.
 */
async function explainRefusal(
  supabase: Client,
  operation: AiOperation,
  error: { code?: string; message?: string } | null,
): Promise<GateRefusal> {
  const code = error?.code ?? "";
  const check = await preflight(operation, supabase);

  if (code === "28000") {
    return {
      ok: false,
      status: 401,
      error: "Sign in to use this.",
      reason: "unauthenticated",
    };
  }

  if (code === "22023") {
    console.error(`[billing] unknown operation: ${operation}`);
    return {
      ok: false,
      status: 500,
      error: "That feature is not available right now.",
      reason: "unknown-operation",
    };
  }

  if (code === "42501") {
    const needed = check?.minPlan ?? "pro";
    return {
      ok: false,
      status: 402,
      error: `This needs a ${planLabel(needed)} plan. Upgrade in Billing to use it.`,
      reason: "plan",
      credits: check?.credits,
      balance: check?.balance,
      plan: check?.plan,
      minPlan: needed,
    };
  }

  if (code === "53000") {
    const needed = check?.credits ?? 0;
    const balance = check?.balance ?? 0;
    return {
      ok: false,
      status: 402,
      error: `This costs ${needed} credits and you have ${balance}. Top up in Billing to carry on.`,
      reason: "credits",
      credits: needed,
      balance,
      plan: check?.plan,
      minPlan: check?.minPlan,
    };
  }

  // Anything else is ours, not theirs.
  console.error(`[billing] reserve failed for ${operation}:`, error?.message);
  return {
    ok: false,
    status: 503,
    error: "Credits are unavailable at the moment. Try again shortly.",
    reason: "unavailable",
  };
}

/**
 * What the reservation actually took.
 *
 * Read back rather than assumed, because an admin is charged nothing and the
 * receipt should say so. A failed read reports zero, which understates the
 * charge — the wrong direction to be wrong in for a bill, but this number is
 * only ever displayed, and the ledger is the record.
 */
async function reservedAmount(
  supabase: Client,
  reservationId: string,
): Promise<number> {
  const { data } = await supabase
    .from("credit_reservations")
    .select("credits")
    .eq("id", reservationId)
    .maybeSingle();

  return data?.credits ?? 0;
}
