import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { settlePayment } from "@/lib/billing/fulfilment";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

/**
 * Where Chapa sends the member back to.
 *
 * The reference in the URL is the only thing this page takes from the browser,
 * and it is used as a *lookup key*, never as a claim. Everything that follows —
 * did it succeed, how much was paid, has it already been granted — comes from
 * asking Chapa and from our own rows. Somebody who types a colleague's
 * reference into this URL causes exactly one thing to happen: that colleague's
 * payment gets verified and fulfilled, which is what was going to happen
 * anyway, and they are shown nothing about it, because the page reads the
 * result back through their own session and RLS gives them nothing.
 *
 * ## Why verify here at all
 *
 * The webhook is the primary path and this is the backstop. Webhooks are
 * delivered to a public URL, and a local development machine, a firewall, or a
 * misconfigured secret all break that delivery in ways nobody notices until a
 * member has paid and received nothing. One verify call on return closes it.
 */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; trx_ref?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/billing");

  const params = await searchParams;
  // Chapa appends its own `trx_ref` to the return URL; ours is `ref`. Either
  // is the same string, and accepting both means a changed provider default
  // does not silently stop the backstop working.
  const reference = params.ref ?? params.trx_ref ?? "";

  const settlement = reference
    ? await settlePayment(reference, "return")
    : ({ state: "unknown" } as const);

  const view = describe(settlement.state);

  return (
    <div className="mx-auto max-w-md space-y-6 py-12 text-center">
      <view.Icon className={cn("mx-auto size-10", view.tone)} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{view.title}</h1>
        <p className="text-sm text-muted-foreground">{view.body}</p>
      </div>

      <div className="flex justify-center gap-3">
        <Link href="/billing" className={cn(buttonVariants())}>
          Go to Billing
        </Link>
        <Link
          href="/studio"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Open Berchuma Studio
        </Link>
      </div>
    </div>
  );
}

function describe(state: string) {
  switch (state) {
    case "granted":
    case "already":
      return {
        Icon: CheckCircle2,
        tone: "text-brand",
        title: "Payment received",
        body: "Your plan and credits are on your account. Billing has the receipt.",
      };
    case "pending":
      return {
        Icon: Clock,
        tone: "text-muted-foreground",
        title: "Still processing",
        body:
          "The payment has not been confirmed yet. This usually takes a moment — check Billing shortly, and nothing is charged twice if you try again.",
      };
    case "failed":
      return {
        Icon: XCircle,
        tone: "text-destructive",
        title: "Payment did not go through",
        body: "Nothing was charged. You can try again from Billing.",
      };
    default:
      return {
        Icon: Clock,
        tone: "text-muted-foreground",
        title: "Nothing to show",
        body: "We could not find that payment. Billing lists everything on your account.",
      };
  }
}
