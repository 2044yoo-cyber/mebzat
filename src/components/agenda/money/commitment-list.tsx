"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  usePanel,
} from "@/components/agenda/shared";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import { Figure } from "@/components/agenda/money/money-bits";
import {
  MONEY_STATUSES,
  isLiveMoney,
  moneyStatusLabel,
  moneyStatusTone,
} from "@/lib/agenda/money";
import type {
  BudgetItem,
  Commitment,
  Contract,
} from "@/lib/data/agenda-money";
import {
  addCommitment,
  setMoneyStatus,
} from "@/app/(dashboard)/agenda/projects/[projectId]/money-actions";

/**
 * Commitments: money promised but not yet spent.
 *
 * The figure at the top counts live commitments only. A cancelled or rejected
 * one is not money owed, and leaving it in the total is how a project appears
 * to have committed twice what it has.
 *
 * A commitment can hang off a contract and off a budget line. Both are
 * optional because the site commits to things before the paperwork catches up,
 * and refusing the record until it does means the record never gets made.
 */
export function CommitmentList({
  projectId,
  commitments,
  contracts,
  budgetItems,
}: {
  projectId: string;
  commitments: Commitment[];
  contracts: Contract[];
  budgetItems: BudgetItem[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();

  const currency = commitments[0]?.currency ?? "ETB";
  const live = commitments.filter((item) => isLiveMoney(item.status));
  const outstanding = live.reduce(
    (sum, item) => sum + item.originalAmount + item.approvedChanges,
    0,
  );

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Commitments"
        count={commitments.length}
        action="Add a commitment"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {commitments.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4">
          <Figure
            label="Committed and live"
            amount={outstanding}
            currency={currency}
          />
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Still open</p>
            <p className="text-sm font-medium tabular-nums">
              {live.length} of {commitments.length}
            </p>
          </div>
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await addCommitment(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Added");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <Field label="What is committed">
            <input
              name="title"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Reinforcement supply, ground floor"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company">
              <input name="companyName" maxLength={200} className={inputClass} />
            </Field>
            <Field label="Amount">
              <input
                name="originalAmount"
                inputMode="decimal"
                className={inputClass}
              />
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
            <Field label="Against a cost code">
              <select name="budgetItemId" className={inputClass} defaultValue="">
                <option value="">Not against one</option>
                {budgetItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.costCode} — {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <input
                name="currency"
                maxLength={3}
                defaultValue={currency}
                className={inputClass}
              />
            </Field>
            <Field label="Status">
              <select name="status" className={inputClass} defaultValue="draft">
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
            Add it
          </button>
        </form>
      )}

      {commitments.length === 0 ? (
        <Empty>Nothing has been committed on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {commitments.map((commitment) => (
            <li key={commitment.id} className="space-y-2 rounded-2xl border p-4">
              <div className="flex items-start gap-3">
                <Coins className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {commitment.number}
                    </span>
                    <span className="text-sm font-medium">
                      {commitment.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[
                      commitment.companyName,
                      commitment.contractNumber
                        ? `Under ${commitment.contractNumber}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No company named"}
                  </p>
                </div>
                <StatusChip
                  label={moneyStatusLabel(commitment.status)}
                  tone={moneyStatusTone(commitment.status)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Figure
                  label="Original"
                  amount={commitment.originalAmount}
                  currency={commitment.currency}
                  tone="muted"
                />
                <Figure
                  label="With changes"
                  amount={
                    commitment.originalAmount + commitment.approvedChanges
                  }
                  currency={commitment.currency}
                />
              </div>

              <select
                defaultValue={commitment.status}
                disabled={pending}
                aria-label={`Status of ${commitment.number}`}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  start(async () => {
                    const result = await setMoneyStatus(
                      projectId,
                      "agenda_commitments",
                      commitment.id,
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
          ))}
        </ul>
      )}
    </div>
  );
}
