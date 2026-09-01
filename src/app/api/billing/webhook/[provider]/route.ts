import { NextResponse } from "next/server";

import { settlePayment } from "@/lib/billing/fulfilment";
import { paymentService } from "@/lib/billing/payments/service";
import { createServiceClient } from "@/lib/supabase/service";
import { asJson } from "@/lib/billing/payments/provider";

/**
 * Where the provider tells us what happened.
 *
 * Four things happen here, in this order, and the order is the security:
 *
 * 1. **The raw body is read as text**, before anything parses it. A signature
 *    is over bytes, and `await request.json()` throws those bytes away — you
 *    cannot re-serialise an object and get the same string back.
 * 2. **The signature is checked, when there is one.** Chapa signs its dashboard
 *    webhook and does *not* sign the `callback_url` it posts to after a
 *    payment. A signature that is present and wrong is refused; an absent one
 *    is noted and the delivery goes on, because step 4 does not believe it
 *    either way.
 * 3. **The event is inserted**, keyed on `(provider, event_reference)`. A
 *    second delivery of the same event violates the unique constraint, the
 *    handler sees the conflict, and it stops. This is the idempotency, and it
 *    is an insert rather than a "have we done this yet?" check because the
 *    check and the work are not atomic and the insert is.
 * 4. **Only then is the transaction verified and fulfilled** — by asking Chapa
 *    directly, over the API, with our secret key. The webhook body says a
 *    payment succeeded; the webhook body is also the thing an attacker
 *    controls. What Chapa says when we ask it is the only version acted on.
 *
 * ## What the status code means
 *
 * Providers retry on a non-2xx, so the code answers one question: *would
 * another delivery help?* A wrong signature and an unparseable body are
 * answered without asking for a retry — the next delivery would be identical. An
 * event that could not even be recorded is answered with a 503, because that
 * one is ours and a retry is exactly what fixes it. Everything else is a 200:
 * the work is done, or it is recorded with `processed_at` null and can be
 * queried for.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: requested } = await params;
  const provider = paymentService();

  if (requested !== provider.name) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  }

  // 1. Bytes first.
  const raw = await request.text();
  const parsed = provider.parseWebhook(raw, request.headers);

  if ("error" in parsed) {
    console.warn(`[billing] webhook rejected: ${parsed.error}`);
    return NextResponse.json({ received: true });
  }

  // 2. Signature — required only when one was offered.
  //
  //    Chapa uses this URL two different ways. The dashboard webhook is signed;
  //    the `callback_url` given at checkout is posted **unsigned**. Demanding a
  //    signature on both answered every callback with a 401 and dropped it,
  //    which on a deployment without a dashboard webhook meant no payment ever
  //    activated anything.
  //
  //    Accepting an unsigned delivery is safe here, and only here, because
  //    nothing downstream believes it: the reference is used to look up a
  //    payment we created, and the outcome comes from asking Chapa directly. A
  //    forged POST can at most make us re-verify a payment of our own, which
  //    returns whatever the truth is. A signature that is *present and wrong*
  //    is a different matter — that is a forgery or a rotated secret — and is
  //    refused.
  if (parsed.signaturePresent && !parsed.signatureValid) {
    console.error(
      `[billing] webhook signature did not verify for ${parsed.reference}. Check CHAPA_WEBHOOK_SECRET matches the Secret Hash in the Chapa dashboard.`,
    );
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  if (!parsed.signaturePresent) {
    console.warn(
      `[billing] unsigned delivery for ${parsed.reference} — treating it as a Chapa callback. The transaction is still verified against Chapa before anything is granted.`,
    );
  }

  const service = createServiceClient();

  // 3. Claim the event. `payment_events` has RLS on and no policy at all, so
  //    this only works with the service role — the log cannot be written or
  //    read by anybody signed in, which is right for a table that decides
  //    whether money is granted.
  const { error: alreadySeen } = await service.from("payment_events").insert({
    provider: provider.name,
    event_reference: parsed.eventReference,
    event_type: parsed.eventType,
    payload: asJson(parsed.payload),
  });

  if (alreadySeen) {
    // 23505 is the unique violation — a retry of an event already handled.
    // Answering 200 stops the provider redelivering it, which is what we want.
    if (alreadySeen.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Anything else means the log could not be written *at all* — the database
    // was unreachable, most likely — and nothing has been handled. This must
    // not be reported as a duplicate: a 200 tells the provider to stop
    // retrying, and a transient outage would silently lose the payment. Found
    // by pointing a signed delivery at a build whose database was blocked; the
    // first version of this route answered "duplicate: true" and dropped it.
    console.error(`[billing] could not log webhook event: ${alreadySeen.message}`);
    return NextResponse.json(
      { error: "Could not record the event. Please retry." },
      { status: 503 },
    );
  }

  if (!parsed.reference) {
    await markProcessed(service, provider.name, parsed.eventReference, "no reference");
    return NextResponse.json({ received: true });
  }

  // 4. Ask the provider, then grant.
  const settlement = await settlePayment(parsed.reference, "webhook");

  await markProcessed(
    service,
    provider.name,
    parsed.eventReference,
    `${settlement.state}${parsed.signaturePresent ? "" : " (unsigned callback)"}`,
  );

  return NextResponse.json({ received: true, outcome: settlement.state });
}

async function markProcessed(
  service: ReturnType<typeof createServiceClient>,
  provider: string,
  eventReference: string,
  outcome: string,
): Promise<void> {
  await service
    .from("payment_events")
    .update({ processed_at: new Date().toISOString(), outcome })
    .eq("provider", provider)
    .eq("event_reference", eventReference);
}
