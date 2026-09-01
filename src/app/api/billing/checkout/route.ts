import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  isPubliclyReachable,
  splitName,
} from "@/lib/billing/payments/chapa-protocol";
import { paymentService } from "@/lib/billing/payments/service";
import { PaymentProviderError } from "@/lib/billing/payments/provider";
import { siteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Starts a purchase.
 *
 * The request body carries one thing: a product id. Not an amount, not a plan,
 * not a credit count. Everything that decides what is charged and what is
 * granted is read from `billing_products` on the server, so a browser posting
 * `{ productId: "pro-monthly", amount: 1 }` is charged 1,200 birr and the extra
 * field is ignored, because it was never read.
 *
 * That is the whole reason this route exists rather than the browser talking to
 * Chapa directly. A client-side integration has to know the price, and anything
 * the client knows the client can change.
 *
 * ## What gets written
 *
 * A `pending` payment row, before the provider is called, with the price copied
 * onto it. Copied rather than joined so that a price change next month cannot
 * retroactively alter what somebody paid — and written first so that a provider
 * that succeeds while our response is lost still has a row to match its webhook
 * against.
 *
 * The insert uses the service role because `payments` has no insert policy. A
 * member who could write their own payment row could write a succeeded one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to buy credits or a plan." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const productId = typeof body.productId === "string" ? body.productId : "";
  if (!productId) {
    return NextResponse.json({ error: "No product was chosen." }, { status: 400 });
  }

  // A missing key is a deployment problem, and the person seeing it should be
  // told which variable to set rather than watching a checkout hang.
  const provider = paymentService();
  const misconfigured = provider.configurationError();
  if (misconfigured) {
    console.error(`\n[billing] PAYMENTS ARE NOT CONFIGURED\n  ${misconfigured}\n`);
    return NextResponse.json(
      {
        // Named in development so the fix is obvious; generic in production,
        // where a member cannot set an environment variable and the name of one
        // tells an attacker about the stack.
        error:
          process.env.NODE_ENV !== "production"
            ? `Payment initialization failed: ${misconfigured}`
            : "Payments are not available on this deployment yet. Please contact support.",
      },
      { status: 503 },
    );
  }

  const { data: product } = await supabase
    .from("billing_products")
    .select("*")
    .eq("id", productId)
    .eq("active", true)
    .maybeSingle();

  if (!product) {
    return NextResponse.json(
      { error: "That plan is no longer available." },
      { status: 404 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, company_name, email, phone")
    .eq("id", user.id)
    .maybeSingle();

  const email = profile?.email ?? user.email;
  if (!email) {
    return NextResponse.json(
      { error: "Add an email address to your profile before paying." },
      { status: 400 },
    );
  }

  // `tx_ref` has to be unique per provider and is the key the webhook matches
  // on. Time first so a support conversation about "the payment at 4pm" can be
  // narrowed by eye, random after so two clicks in the same millisecond differ.
  const reference = `medosha-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const [firstName, lastName] = splitName(
    profile?.full_name ?? profile?.company_name ?? email,
  );

  const service = createServiceClient();
  const { data: payment, error: writeFailed } = await service
    .from("payments")
    .insert({
      user_id: user.id,
      product_id: product.id,
      provider: provider.name,
      provider_reference: reference,
      purpose: product.purpose,
      amount: product.price,
      currency: product.currency,
      plan: product.plan,
      credits: product.credits,
      months: product.months,
      status: "pending",
    })
    .select("id")
    .single();

  if (writeFailed || !payment) {
    console.error("[billing] could not record the payment:", writeFailed?.message);
    return NextResponse.json(
      { error: "Checkout could not be started. Try again shortly." },
      { status: 503 },
    );
  }

  const base = siteUrl();
  const reachable = isPubliclyReachable(base);

  if (!reachable) {
    // Not fatal, and worth one line so nobody spends an afternoon wondering why
    // the plan does not activate on their laptop. The return page verifies too,
    // so the flow still completes — it just completes when the member comes
    // back rather than when Chapa calls.
    console.warn(
      `[billing] ${base} is not reachable from the internet, so no callback URL is being sent. Activation will happen on the return page instead. Set NEXT_PUBLIC_SITE_URL to a public URL (or use a tunnel) to receive webhooks.`,
    );
  }

  try {
    const session = await provider.checkout({
      reference,
      amount: Number(product.price),
      currency: product.currency,
      email,
      firstName,
      lastName,
      phone: profile?.phone ?? null,
      title: "Medosha",
      description: product.label,
      returnUrl: `${base}/billing/return?ref=${encodeURIComponent(reference)}`,
      callbackUrl: reachable
        ? `${base}/api/billing/webhook/${provider.name}`
        : null,
    });

    if (session.providerTransactionId) {
      await service
        .from("payments")
        .update({
          provider_transaction_id: session.providerTransactionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
    }

    return NextResponse.json({
      checkoutUrl: session.checkoutUrl,
      reference,
    });
  } catch (error) {
    const failure =
      error instanceof PaymentProviderError
        ? error
        : new PaymentProviderError(String(error), provider.name);

    /**
     * Everything needed to diagnose this, in one block.
     *
     * The previous version logged a single line and returned "The payment page
     * could not be opened", which is how a specific complaint from Chapa
     * reached nobody. Nothing here is secret: the key is not printed, only
     * whether one is set and which mode it is in.
     */
    console.error(
      [
        "",
        "[billing] CHECKOUT FAILED",
        `  provider     ${provider.name} (${provider.live ? "LIVE" : "test"} mode)`,
        `  user         ${user.id}`,
        `  product      ${product.id} — ${product.label}`,
        `  amount       ${Number(product.price).toFixed(2)} ${product.currency}`,
        `  plan/months  ${product.plan ?? "—"} / ${product.months}`,
        `  tx_ref       ${reference}`,
        `  return_url   ${base}/billing/return?ref=${reference}`,
        `  callback_url ${reachable ? `${base}/api/billing/webhook/${provider.name}` : "(omitted — origin is not publicly reachable)"}`,
        `  http status  ${failure.info.status ?? "—"}`,
        `  provider says ${failure.info.detail ?? failure.message}`,
        failure.info.body ? `  raw body     ${failure.info.body}` : null,
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    // The row is marked failed rather than deleted. A payment that could not be
    // started is a thing that happened, and a member asking why their card page
    // never opened deserves an answer that survives the request. Retrying makes
    // a fresh row with a fresh reference; this one is never reused.
    await service
      .from("payments")
      .update({
        status: "failed",
        failure_reason: (failure.info.detail ?? failure.message).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    /**
     * In development the provider's complaint goes back to the browser.
     *
     * `detail` is the provider's description of what was wrong with our
     * request — a field name and a reason. It never contains a key, a token or
     * a stack, and having it on screen is the difference between fixing this in
     * a minute and reading server logs. In production it is dropped, because a
     * member has no use for "first_name: The first name format is invalid".
     */
    const inDevelopment = process.env.NODE_ENV !== "production";

    return NextResponse.json(
      {
        error: inDevelopment
          ? `Payment initialization failed: ${failure.info.detail ?? failure.message}`
          : "We couldn't start the payment. Please try again.",
        retryable: true,
        ...(inDevelopment
          ? { detail: failure.info.detail, status: failure.info.status }
          : {}),
      },
      { status: 502 },
    );
  }
}
