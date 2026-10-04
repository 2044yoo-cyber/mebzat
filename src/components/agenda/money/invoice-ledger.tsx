"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  usePanel,
  when,
} from "@/components/agenda/shared";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import { Amount, Figure } from "@/components/agenda/money/money-bits";
import { ageInvoices, invoiceTotals, outstanding } from "@/lib/agenda/billing";
import {
  CONTRACT_PARTIES,
  MONEY_STATUSES,
  contractPartyLabel,
  moneyStatusLabel,
  moneyStatusTone,
} from "@/lib/agenda/money";
import type { Commitment, Contract } from "@/lib/data/agenda-money";
import type { Invoice } from "@/lib/data/agenda-billing";
import {
  raiseInvoice,
  setInvoiceStatus,
} from "@/app/(dashboard)/agenda/projects/[projectId]/billing-actions";

/**
 * The invoice ledger.
 *
 * Retention is shown as its own figure, never folded into what is unpaid. It
 * is money earned and deliberately withheld until handover, and a screen that
 * merges the two cannot tell a subcontractor why they are short — which is the
 * argument this section exists to settle.
 *
 * The aging is read top to bottom and ends on what is worst, because the last
 * line of a list is the one somebody acts on.
 */
export function InvoiceLedger({
  projectId,
  invoices,
  contracts,
  commitments,
}: {
  projectId: string;
  invoices: Invoice[];
  contracts: Contract[];
  commitments: Commitment[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();

  const currency = invoices[0]?.currency ?? "ETB";
  const totals = invoiceTotals(invoices);
  const aging = ageInvoices(invoices);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Invoices"
        count={invoices.length}
        action="Raise an invoice"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {invoices.length > 0 && (
        <div className="space-y-3 rounded-2xl border p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure
              label="Invoiced"
              amount={totals.invoiced}
              currency={currency}
              tone="muted"
            />
            <Figure label="Paid" amount={totals.paid} currency={currency} tone="muted" />
            <Figure
              label="Outstanding"
              amount={totals.outstanding}
              currency={currency}
            />
            <Figure
              label="Retention held"
              amount={totals.retentionHeld}
              currency={currency}
              tone="muted"
            />
          </div>

          {aging.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {aging.map((bucket) => (
                <li key={bucket.bucket}>
                  <StatusChip
                    label={`${bucket.label}: ${bucket.count}`}
                    tone={bucket.tone}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await raiseInvoice(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Raised");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Whose invoice">
              <input
                name="companyName"
                required
                maxLength={200}
                className={inputClass}
              />
            </Field>
            <Field label="Party">
              <select
                name="party"
                className={inputClass}
                defaultValue="subcontractor"
              >
                {CONTRACT_PARTIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Against a contract">
              <select name="contractId" className={inputClass} defaultValue="">
                <option value="">Not against one</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.number} — {contract.companyName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Against a commitment">
              <select name="commitmentId" className={inputClass} defaultValue="">
                <option value="">Not against one</option>
                {commitments.map((commitment) => (
                  <option key={commitment.id} value={commitment.id}>
                    {commitment.number} — {commitment.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount">
              <input name="amount" inputMode="decimal" className={inputClass} />
            </Field>
            <Field label="Tax">
              <input name="taxAmount" inputMode="decimal" className={inputClass} />
            </Field>
            <Field label="Retention held back">
              <input
                name="retentionAmount"
                inputMode="decimal"
                className={inputClass}
                placeholder="Released at handover"
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
            <Field label="Issued">
              <input type="date" name="issuedOn" className={inputClass} />
            </Field>
            <Field label="Due">
              <input type="date" name="dueOn" className={inputClass} />
            </Field>
            <Field label="Status">
              <select name="status" className={inputClass} defaultValue="submitted">
                {MONEY_STATUSES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Raise it
          </button>
        </form>
      )}

      {invoices.length === 0 ? (
        <Empty>No invoices have been raised on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {invoices.map((invoice) => {
            const owed = outstanding(invoice);
            return (
              <li key={invoice.id} className="space-y-2 rounded-2xl border p-4">
                <div className="flex items-start gap-3">
                  <Receipt className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {invoice.number}
                      </span>
                      <span className="text-sm font-medium">
                        {invoice.companyName}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        contractPartyLabel(invoice.party),
                        invoice.contractNumber
                          ? `Under ${invoice.contractNumber}`
                          : null,
                        invoice.issuedOn
                          ? `issued ${when(invoice.issuedOn)}`
                          : null,
                        invoice.dueOn ? `due ${when(invoice.dueOn)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip
                      label={moneyStatusLabel(invoice.status)}
                      tone={moneyStatusTone(invoice.status)}
                    />
                    <Amount
                      value={invoice.totalAmount}
                      currency={invoice.currency}
                      className="text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Figure
                    label="Claim"
                    amount={invoice.amount}
                    currency={invoice.currency}
                    tone="muted"
                  />
                  <Figure
                    label="Retention"
                    amount={invoice.retentionAmount}
                    currency={invoice.currency}
                    tone="muted"
                  />
                  <Figure
                    label="Paid"
                    amount={invoice.paidAmount}
                    currency={invoice.currency}
                    tone="muted"
                  />
                  <Figure
                    label="Outstanding"
                    amount={owed}
                    currency={invoice.currency}
                  />
                </div>

                <select
                  defaultValue={invoice.status}
                  disabled={pending}
                  aria-label={`Status of ${invoice.number}`}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    start(async () => {
                      const result = await setInvoiceStatus(
                        projectId,
                        invoice.id,
                        next,
                      );
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                  className="h-8 rounded-lg border bg-transparent px-2 text-xs"
                >
                  {MONEY_STATUSES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
