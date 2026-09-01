import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { VerificationQueue } from "@/components/pricing/verification-queue";
import { pendingVerification } from "@/lib/data/price-book";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Price verification" };
export const dynamic = "force-dynamic";

/**
 * The queue of prices waiting for somebody to stand behind them.
 *
 * Verifying a row promotes it above the marketplace average in the resolver,
 * so it starts appearing on estimates and bills of quantities that people quote
 * from. That is the whole weight of this page: it is where an anonymous figure
 * becomes Medosha's own word.
 *
 * `notFound` rather than a redirect for a non-admin. A redirect to the login
 * page tells somebody probing the URL that the page exists and is worth coming
 * back to; a 404 tells them nothing.
 */
export default async function AdminPricesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) notFound();

  const pending = await pendingVerification(50);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <ShieldCheck className="size-5 text-brand" aria-hidden />
        Price verification
      </h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-muted-foreground">
        Prices waiting for review. Verifying one puts it above the marketplace
        average wherever Medosha quotes a rate — on estimates, on bills of
        quantities, and in what the AI is allowed to say a material costs.
      </p>

      {pending.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing is waiting. Supplier submissions appear here as they arrive.
        </p>
      ) : (
        <VerificationQueue prices={pending} />
      )}
    </div>
  );
}
