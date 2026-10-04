"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  usePanel,
  when,
} from "@/components/agenda/shared";
import { Amount, Figure } from "@/components/agenda/money/money-bits";
import { outstanding } from "@/lib/agenda/billing";
import type { Invoice, Payment } from "@/lib/data/agenda-billing";
import { recordPayment } from "@/app/(dashboard)/agenda/projects/[projectId]/billing-actions";

/** How money actually leaves a site office here. Free text; these are hints. */
const METHODS = ["Bank transfer", "Cash", "Cheque", "Telebirr", "CBE Birr"];

/**
 * Payments made.
 *
 * Recorded, not processed. Nothing in Medosha moves money, and a screen that
 * implied it did would be a promise the system cannot keep — so this writes
 * the fact and the invoice's status follows by trigger, which is why there is
 * no "mark as paid" button anywhere.
 */
export function PaymentList({
  projectId,
  payments,
  invoices,
}: {
  projectId: string;
  payments: Payment[];
  invoices: Invoice[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();

  const currency = payments[0]?.currency ?? invoices[0]?.currency ?? "ETB";
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const owing = invoices.filter((invoice) => outstanding(invoice) > 0);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Payments"
        count={payments.length}
        action="Record a payment"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {payments.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4">
          <Figure label="Paid out" amount={total} currency={currency} />
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Invoices still owing</p>
            <p className="text-sm font-medium tabular-nums">{owing.length}</p>
          </div>
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await recordPayment(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Recorded");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <p className="text-xs text-muted-foreground">
            This records that a payment was made. It does not make one.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Against which invoice">
              <select name="invoiceId" className={inputClass} defaultValue="">
                <option value="">Not against one</option>
                {owing.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number} — {invoice.companyName} (
                    {outstanding(invoice).toLocaleString()} outstanding)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Paid to">
              <input
                name="payeeName"
                required
                maxLength={200}
                className={inputClass}
              />
            </Field>
            <Field label="Amount">
              <input
                name="amount"
                required
                inputMode="decimal"
                className={inputClass}
              />
            </Field>
            <Field label="Currency">
              <input
                name="currency"
                maxLength={3}
                defaultValue={currency}
                className={inputClass}
              />
            </Field>
            <Field label="Paid on">
              <input
                type="date"
                name="paidOn"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputClass}
              />
            </Field>
            <Field label="How">
              <input
                name="method"
                maxLength={60}
                list="payment-methods"
                className={inputClass}
              />
              <datalist id="payment-methods">
                {METHODS.map((method) => (
                  <option key={method} value={method} />
                ))}
              </datalist>
            </Field>
            <Field label="Reference">
              <input
                name="reference"
                maxLength={120}
                className={inputClass}
                placeholder="Transfer or cheque number"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Record it
          </button>
        </form>
      )}

      {payments.length === 0 ? (
        <Empty>No payments have been recorded on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center gap-2 rounded-2xl border p-4"
            >
              <Banknote className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{payment.payeeName}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    when(payment.paidOn),
                    payment.method,
                    payment.invoiceNumber
                      ? `against ${payment.invoiceNumber}`
                      : null,
                    payment.reference,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Amount
                value={payment.amount}
                currency={payment.currency}
                className="text-sm font-medium"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
