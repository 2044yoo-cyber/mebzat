import "server-only";

import { paymentService } from "./payments/service";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Turning a payment into what it bought.
 *
 * One function, called from two places — the webhook, and the page the member
 * lands on when they come back from Chapa. Both of them ask the provider what
 * happened before doing anything, and both of them go through
 * `fulfil_payment()`, which is idempotent on `fulfilled_at`. So the two paths
 * racing each other is a normal Tuesday rather than a double grant.
 *
 * The return page is included on purpose. A webhook that is delayed, blocked by
 * a firewall, or misconfigured leaves somebody staring at a page saying their
 * plan has not arrived when their money has left. Verifying on return costs one
 * API call and closes that gap — and it is safe precisely because it does not
 * believe the browser: the browser supplies a reference, and everything else
 * comes from Chapa and from our own row.
 */

export type Settlement =
  | { state: "granted"; credits: number; plan: string | null }
  | { state: "already"; credits: number; plan: string | null }
  | { state: "pending" }
  | { state: "failed"; reason: string }
  | { state: "unknown" };

export async function settlePayment(
  reference: string,
  source: "webhook" | "return",
): Promise<Settlement> {
  const provider = paymentService();
  const service = createServiceClient();

  const { data: payment } = await service
    .from("payments")
    .select("*")
    .eq("provider", provider.name)
    .eq("provider_reference", reference)
    .maybeSingle();

  if (!payment) {
    // Not an error worth detail. A reference nobody recognises is either a typo
    // or somebody trying references to see what happens; neither gets told
    // which.
    console.warn(`[billing] ${source}: no payment for reference ${reference}`);
    return { state: "unknown" };
  }

  if (payment.fulfilled_at) {
    return {
      state: "already",
      credits: payment.credits,
      plan: payment.plan,
    };
  }

  // The only statement about money this system acts on.
  let verified;
  try {
    verified = await provider.verify(reference);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[billing] ${source}: verify failed for ${reference}: ${message}`);
    // Deliberately not marked failed. The provider being unreachable says
    // nothing about whether the money moved, and writing "failed" here would
    // strand a real payment on the strength of a network blip.
    return { state: "pending" };
  }

  const stamp = new Date().toISOString();

  if (verified.status === "pending") {
    return { state: "pending" };
  }

  if (verified.status === "failed") {
    await service
      .from("payments")
      .update({
        status: "failed",
        failure_reason: "The provider reported the transaction as unsuccessful.",
        provider_payload: verified.raw,
        provider_transaction_id: verified.providerTransactionId,
        updated_at: stamp,
      })
      .eq("id", payment.id);

    return { state: "failed", reason: "The payment did not go through." };
  }

  // Succeeded, according to the provider. Three things are compared before
  // anything is granted, and all three are between *our row* and *Chapa's
  // answer* — never against anything a browser sent.
  //
  // The user and the plan need no comparison: they are columns on the row this
  // reference selected, so they are correct by construction. What has to be
  // checked is that the transaction Chapa described is the transaction we
  // created, for the money we asked for.
  const paid = verified.amount;
  const owed = Number(payment.amount);

  const problems: string[] = [];

  // A tenth of a birr of slack, because the provider rounds and we do not want
  // a rounding difference to strand a real payment. Anything larger is a real
  // shortfall.
  if (paid !== null && paid + 0.1 < owed) {
    problems.push(`paid ${paid}, expected ${owed}`);
  }
  if (
    verified.currency !== null &&
    verified.currency.toUpperCase() !== payment.currency.toUpperCase()
  ) {
    problems.push(`currency ${verified.currency}, expected ${payment.currency}`);
  }
  if (verified.reference !== reference) {
    // Chapa answering about a different transaction than the one asked for.
    // It should never happen, which is exactly why it is worth catching.
    problems.push(`reference ${verified.reference}, expected ${reference}`);
  }

  if (problems.length > 0) {
    // Marked for a person to look at rather than quietly failed. The money may
    // well have moved; what did not happen is us being able to prove it bought
    // what this row says it bought.
    console.error(
      `[billing] ${source}: REVIEW — ${reference} did not match its payment row: ${problems.join("; ")}. Nothing granted.`,
    );
    await service
      .from("payments")
      .update({
        status: "failed",
        failure_reason: `REVIEW: ${problems.join("; ")}`,
        provider_payload: verified.raw,
        updated_at: stamp,
      })
      .eq("id", payment.id);

    return {
      state: "failed",
      reason: "The payment did not match what was ordered. Support has been notified.",
    };
  }

  await service
    .from("payments")
    .update({
      status: "succeeded",
      provider_transaction_id: verified.providerTransactionId,
      provider_payload: verified.raw,
      updated_at: stamp,
    })
    .eq("id", payment.id);

  const { data: outcome, error } = await service.rpc("fulfil_payment", {
    p_payment: payment.id,
  });

  if (error) {
    // The money is taken and the grant did not happen — the one failure here
    // that costs a member something real. It is logged loudly and left
    // recoverable: the payment row is `succeeded` with `fulfilled_at` still
    // null, so re-running fulfilment (another webhook delivery, or the return
    // page) completes it, and a query for that pair finds every stuck one.
    console.error(
      `[billing] ${source}: PAID BUT NOT FULFILLED — payment ${payment.id}, reference ${reference}: ${error.message}`,
    );
    return { state: "pending" };
  }

  return {
    state: outcome === "already fulfilled" ? "already" : "granted",
    credits: payment.credits,
    plan: payment.plan,
  };
}
