"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  textareaClass,
  usePanel,
  when,
} from "@/components/agenda/shared";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import { Figure } from "@/components/agenda/money/money-bits";
import {
  CONTRACT_PARTIES,
  MONEY_STATUSES,
  contractPartyLabel,
  moneyStatusLabel,
  moneyStatusTone,
} from "@/lib/agenda/money";
import type { Contract } from "@/lib/data/agenda-money";
import {
  addContract,
  setMoneyStatus,
} from "@/app/(dashboard)/agenda/projects/[projectId]/money-actions";

/**
 * Contracts, and what they are worth now.
 *
 * `currentValue` is a generated column — original plus approved changes — and
 * `approvedChanges` is maintained by 0091's trigger from the change orders on
 * the contract. So the figure here is the database's, not a sum this screen
 * made: approving a change order on the Change Orders screen moves this one.
 */
export function ContractList({
  projectId,
  contracts,
}: {
  projectId: string;
  contracts: Contract[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();

  const currency = contracts[0]?.currency ?? "ETB";
  const committed = contracts.reduce(
    (sum, contract) => sum + contract.currentValue,
    0,
  );

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Contracts"
        count={contracts.length}
        action="Add a contract"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {contracts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4">
          <Figure
            label="Original value"
            amount={contracts.reduce((sum, c) => sum + c.originalValue, 0)}
            currency={currency}
            tone="muted"
          />
          <Figure
            label="Current value"
            amount={committed}
            currency={currency}
          />
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await addContract(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Saved");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
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
            <Field label="Company">
              <input
                name="companyName"
                required
                maxLength={200}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Scope">
            <textarea
              name="scope"
              maxLength={2000}
              className={textareaClass}
              placeholder="Structural works to first floor slab."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contract value">
              <input
                name="originalValue"
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
            <Field label="Starts">
              <input type="date" name="startDate" className={inputClass} />
            </Field>
            <Field label="Ends">
              <input type="date" name="endDate" className={inputClass} />
            </Field>
            <Field label="Number">
              <input
                name="number"
                maxLength={40}
                className={inputClass}
                placeholder="Left blank, one is issued"
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
            Save it
          </button>
        </form>
      )}

      {contracts.length === 0 ? (
        <Empty>No contracts have been recorded on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {contracts.map((contract) => (
            <li key={contract.id} className="space-y-2 rounded-2xl border p-4">
              <div className="flex items-start gap-3">
                <FileSignature className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {contract.number}
                    </span>
                    <span className="text-sm font-medium">
                      {contract.companyName}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[
                      contractPartyLabel(contract.party),
                      contract.startDate ? when(contract.startDate) : null,
                      contract.endDate ? when(contract.endDate) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {contract.scope && (
                    <p className="text-xs text-muted-foreground">
                      {contract.scope}
                    </p>
                  )}
                </div>
                <StatusChip
                  label={moneyStatusLabel(contract.status)}
                  tone={moneyStatusTone(contract.status)}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Figure
                  label="Original"
                  amount={contract.originalValue}
                  currency={contract.currency}
                  tone="muted"
                />
                <Figure
                  label="Approved changes"
                  amount={contract.approvedChanges}
                  currency={contract.currency}
                  tone="muted"
                />
                <Figure
                  label="Current"
                  amount={contract.currentValue}
                  currency={contract.currency}
                />
              </div>

              <select
                defaultValue={contract.status}
                disabled={pending}
                aria-label={`Status of ${contract.number}`}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  start(async () => {
                    const result = await setMoneyStatus(
                      projectId,
                      "agenda_contracts",
                      contract.id,
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
