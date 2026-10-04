import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Coins,
  CreditCard,
  Receipt,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { CancelSubscriptionButton } from "@/components/billing/cancel-subscription-button";
import { PurchaseButton } from "@/components/billing/purchase-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { planLabel, planRank, type AccountPlan } from "@/lib/billing/operations";
import {
  getBillingOverview,
  getBillingProducts,
  getCreditHistory,
  getCreditUsage,
  getPaymentHistory,
} from "@/lib/data/billing";
import { cn } from "@/lib/utils";
import type { CreditLedgerEntry, Payment } from "@/types/database.types";

export const metadata: Metadata = { title: "Billing" };

/**
 * Account → Billing.
 *
 * Everything about what this member is paying for, on one page: the plan and
 * when it renews, credits left and where they went, what is for sale, and every
 * payment they have made. Splitting these across tabs would mean somebody
 * checking "why am I out of credits" has to find the page that says so.
 *
 * Nothing here decides anything. The plan shown is the plan the server enforces
 * and the balance shown is the balance the reservation checks — this page is a
 * window onto those, not a second opinion about them. Hiding a button on it has
 * never been what stops an operation running.
 */
export default async function BillingPage() {
  const overview = await getBillingOverview();
  if (!overview) redirect("/login?redirect=/billing");

  const [{ plans, bundles }, history, payments, usage] = await Promise.all([
    getBillingProducts(),
    getCreditHistory(),
    getPaymentHistory(),
    getCreditUsage(),
  ]);

  const { plan, wallet, subscription, costs, isAdmin } = overview;
  const rank = planRank(plan);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <CreditCard className="size-5 text-brand" />
          Billing
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your plan, your credits, and everything you have paid for.
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Where you stand                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-brand" />
              Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{planLabel(plan)}</span>
              {isAdmin ? <Badge variant="secondary">Admin</Badge> : null}
            </div>

            {subscription ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {subscription.auto_renew
                    ? `Renews on ${formatDate(subscription.current_period_end)}.`
                    : `Ends on ${formatDate(subscription.current_period_end)} and will not renew.`}
                </p>
                {subscription.auto_renew ? (
                  <CancelSubscriptionButton
                    endsOn={formatDate(subscription.current_period_end)}
                  />
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {plan === "free"
                  ? "The free plan covers the studio basics. Upgrade for image to 3D, takeoff and BOQ."
                  : "No active subscription — this plan was set directly."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="size-4 text-brand" />
              Credits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-semibold tabular-nums">
              {wallet.balance.toLocaleString()}
            </p>
            {wallet.reserved > 0 ? (
              // Worth showing rather than folding into the balance. Somebody
              // watching the number drop while an operation runs should be able
              // to see that the credits are held, not gone.
              <p className="text-sm text-muted-foreground tabular-nums">
                {wallet.reserved.toLocaleString()} held by operations running now
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground tabular-nums">
              {wallet.lifetime_spent.toLocaleString()} used of{" "}
              {wallet.lifetime_granted.toLocaleString()} received
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Plans                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Sparkles className="size-4 text-brand" />
          Plans
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((product) => {
            const productPlan = (product.plan ?? "free") as AccountPlan;
            const current = productPlan === plan;
            const isUpgrade = planRank(productPlan) > rank;

            return (
              <Card
                key={product.id}
                className={cn(current && "border-brand ring-1 ring-brand/30")}
              >
                <CardHeader>
                  <CardTitle className="text-base">{product.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xl font-semibold tabular-nums">
                    {formatMoney(product.price, product.currency)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {product.months === 12
                        ? "/ year"
                        : product.months === 1
                          ? "/ month"
                          : ""}
                    </span>
                  </p>
                  {product.description ? (
                    <p className="text-sm text-muted-foreground">
                      {product.description}
                    </p>
                  ) : null}

                  {current ? (
                    <Badge variant="secondary">Your plan</Badge>
                  ) : (
                    <PurchaseButton
                      productId={product.id}
                      label={isUpgrade ? "Upgrade" : "Switch to this"}
                      variant={isUpgrade ? "default" : "outline"}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Paying while a plan is still running adds to it rather than restarting
          it — you keep the days you have already paid for.
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Credit bundles                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Top up credits</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {bundles.map((product) => (
            <Card key={product.id}>
              <CardContent className="space-y-3 pt-6">
                <p className="text-lg font-semibold tabular-nums">
                  {product.credits.toLocaleString()} credits
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {formatMoney(product.price, product.currency)} —{" "}
                  {(Number(product.price) / product.credits).toFixed(2)} per credit
                </p>
                <PurchaseButton
                  productId={product.id}
                  label="Buy"
                  variant="outline"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* What things cost                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">What each operation costs</h2>
        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Operation</th>
                <th className="px-4 py-2 font-medium">Needs</th>
                <th className="px-4 py-2 text-right font-medium">Credits</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((cost) => (
                <tr key={cost.operation} className="border-t">
                  <td className="px-4 py-2">
                    {cost.label}
                    {cost.notes ? (
                      <span className="block text-xs text-muted-foreground">
                        {cost.notes}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    {planRank(cost.min_plan) > rank ? (
                      <Badge variant="outline">
                        {planLabel(cost.min_plan)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Included</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {cost.credits}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Usage                                                               */}
      {/* ------------------------------------------------------------------ */}
      {usage.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Last 30 days</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {usage.map((line) => (
              <div
                key={line.operation}
                className="rounded-xl border px-4 py-3 text-sm"
              >
                <p className="font-medium">
                  {costs.find((c) => c.operation === line.operation)?.label ??
                    line.operation}
                </p>
                <p className="text-muted-foreground tabular-nums">
                  {line.credits.toLocaleString()} credits over {line.count}{" "}
                  {line.count === 1 ? "run" : "runs"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* History                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Receipt className="size-4 text-brand" />
            Payments
          </h2>
          {payments.length > 0 ? (
            <ul className="divide-y rounded-2xl border">
              {payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              No payments yet.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">Credit history</h2>
          {history.length > 0 ? (
            <ul className="divide-y rounded-2xl border">
              {history.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              Nothing spent yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function PaymentRow({ payment }: { payment: Payment }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {payment.purpose === "subscription"
            ? `${planLabel((payment.plan ?? "free") as AccountPlan)} plan${
                payment.months > 1 ? `, ${payment.months} months` : ""
              }`
            : `${payment.credits.toLocaleString()} credits`}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(payment.created_at)} · {payment.provider_reference}
        </p>
      </div>
      <div className="text-right">
        <p className="tabular-nums">
          {formatMoney(payment.amount, payment.currency)}
        </p>
        <PaymentStatusBadge payment={payment} />
      </div>
    </li>
  );
}

/**
 * The status a member cares about, which is not quite the column.
 *
 * A payment that succeeded but has not been fulfilled is shown as processing
 * rather than paid. It is the rare case — a webhook that arrived while the
 * grant failed — and telling somebody "paid" while their credits are missing is
 * the worst of the available answers.
 */
function PaymentStatusBadge({ payment }: { payment: Payment }) {
  if (payment.fulfilled_at) {
    return (
      <Badge variant="secondary" className="mt-0.5">
        Paid
      </Badge>
    );
  }

  if (payment.status === "succeeded") {
    return (
      <Badge variant="outline" className="mt-0.5">
        Processing
      </Badge>
    );
  }

  if (payment.status === "pending") {
    return (
      <Badge variant="outline" className="mt-0.5">
        Not completed
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="mt-0.5">
      {payment.status === "failed" ? "Failed" : payment.status}
    </Badge>
  );
}

function LedgerRow({ entry }: { entry: CreditLedgerEntry }) {
  const positive = entry.amount > 0;

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate">{entry.description ?? entry.operation ?? "—"}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(entry.created_at)}
        </p>
      </div>
      <p
        className={cn(
          "shrink-0 tabular-nums",
          positive ? "text-brand" : "text-muted-foreground",
        )}
      >
        {positive ? "+" : ""}
        {entry.amount.toLocaleString()}
      </p>
    </li>
  );
}

function formatMoney(amount: number | string, currency: string): string {
  const value = Number(amount);
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
