"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  usePanel,
} from "@/components/agenda/shared";
import {
  Amount,
  Figure,
  SpendBar,
} from "@/components/agenda/money/money-bits";
import { budgetTotals, committedPercent } from "@/lib/agenda/money";
import type { BudgetItem } from "@/lib/data/agenda-money";
import {
  saveBudgetItem,
  updateBudgetCosts,
} from "@/app/(dashboard)/agenda/projects/[projectId]/money-actions";

/**
 * The budget, by cost code.
 *
 * Committed money counts against the budget alongside what has actually been
 * paid. A purchase order placed and not yet invoiced is money that has left,
 * whatever the bank says, and a screen that ignores it tells a project manager
 * they have room they do not have.
 *
 * `revisedBudget` and `remainingBudget` are read, not computed: 0091 generates
 * both in the database, so the row on the screen is the row the database holds.
 * The totals across rows are summed here, because no column holds a total.
 */
export function BudgetTable({
  projectId,
  items,
}: {
  projectId: string;
  items: BudgetItem[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  const currency = items[0]?.currency ?? "ETB";
  const totals = budgetTotals(items);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Budget"
        count={items.length}
        action="Add a cost code"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {items.length > 0 && (
        <div className="space-y-3 rounded-2xl border p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure
              label="Original"
              amount={totals.originalBudget}
              currency={currency}
              tone="muted"
            />
            <Figure
              label="Revised"
              amount={totals.revisedBudget}
              currency={currency}
            />
            <Figure
              label="Spent and committed"
              amount={totals.actualCost + totals.committedCost}
              currency={currency}
              tone="muted"
            />
            <Figure
              label="Remaining"
              amount={totals.remainingBudget}
              currency={currency}
              tone="signed"
            />
          </div>
          <SpendBar percent={committedPercent(totals)} />
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await saveBudgetItem(projectId, formData);
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cost code">
              <input
                name="costCode"
                required
                maxLength={40}
                className={inputClass}
                placeholder="02-100"
              />
            </Field>
            <Field label="Name">
              <input
                name="name"
                required
                maxLength={200}
                className={inputClass}
                placeholder="Substructure"
              />
            </Field>
            <Field label="Original budget">
              <input
                name="originalBudget"
                inputMode="decimal"
                className={inputClass}
                placeholder="4,200,000"
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

      {items.length === 0 ? (
        <Empty>No budget has been set for this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="space-y-2 rounded-2xl border p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {item.costCode}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {item.name}
                </span>
                <Amount
                  value={item.remainingBudget}
                  currency={item.currency}
                  className={
                    item.remainingBudget < 0
                      ? "text-sm font-medium text-destructive"
                      : "text-sm font-medium"
                  }
                />
              </div>

              <SpendBar percent={committedPercent(item)} />

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Figure
                  label="Revised"
                  amount={item.revisedBudget}
                  currency={item.currency}
                  tone="muted"
                />
                <Figure
                  label="Committed"
                  amount={item.committedCost}
                  currency={item.currency}
                  tone="muted"
                />
                <Figure
                  label="Actual"
                  amount={item.actualCost}
                  currency={item.currency}
                  tone="muted"
                />
                <Figure
                  label="Forecast"
                  amount={item.forecastCost}
                  currency={item.currency}
                  tone="muted"
                />
              </div>

              {editing === item.id ? (
                <form
                  action={(formData) =>
                    start(async () => {
                      const result = await updateBudgetCosts(
                        projectId,
                        item.id,
                        formData,
                      );
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Saved");
                      setEditing(null);
                      router.refresh();
                    })
                  }
                  className="grid gap-2 rounded-xl border p-3 sm:grid-cols-3"
                >
                  {(
                    [
                      ["approvedChanges", "Approved changes", item.approvedChanges],
                      ["committedCost", "Committed", item.committedCost],
                      ["actualCost", "Actual", item.actualCost],
                      ["pendingCost", "Pending", item.pendingCost],
                      ["forecastCost", "Forecast", item.forecastCost],
                    ] as const
                  ).map(([name, label, value]) => (
                    <Field key={name} label={label}>
                      <input
                        name={name}
                        inputMode="decimal"
                        defaultValue={value}
                        className={inputClass}
                      />
                    </Field>
                  ))}
                  <div className="flex items-end gap-2">
                    <button
                      type="submit"
                      disabled={pending}
                      className="h-9 rounded-lg bg-brand px-3 text-xs font-medium text-brand-foreground disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="h-9 rounded-lg border px-3 text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(item.id)}
                  className="h-7 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  Update the figures
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
