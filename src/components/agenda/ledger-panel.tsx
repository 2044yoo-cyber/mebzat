"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock, TrendingDown, TrendingUp } from "lucide-react";

import { recordLedgerEntry } from "@/app/(dashboard)/projects/[id]/agenda/actions";
import {
  ActionForm,
  Empty,
  Field,
  PanelHeader,
  inputClass,
  usePanel,
  when,
} from "@/components/agenda/shared";
import {
  LEDGER_KINDS,
  birr,
  directionFor,
  ledgerKindLabel,
  type LedgerKind,
} from "@/lib/agenda/constants";
import type { LedgerEntry } from "@/lib/data/agenda";
import { cn } from "@/lib/utils";

/**
 * The private ledger.
 *
 * `canView` comes from the database, not from a role guess in the browser, and
 * the entries array is already empty when it is false — this component could
 * not leak the figures if it tried, because it was never sent them.
 *
 * The panel is still rendered for people without access, saying so. Hiding it
 * entirely would leave a quantity surveyor wondering whether the project has
 * no ledger or whether they simply cannot see it.
 */
export function LedgerPanel({
  projectId,
  entries,
  canView,
  totals,
}: {
  projectId: string;
  entries: LedgerEntry[];
  canView: boolean;
  totals: {
    spent: number | null;
    received: number | null;
    outstanding: number | null;
  };
}) {
  const router = useRouter();
  const panel = usePanel();

  const [kind, setKind] = useState<LedgerKind>("material_purchase");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<"paid" | "outstanding">("paid");
  const [occurred, setOccurred] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  if (!canView) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-6 text-center">
        <Lock className="mx-auto size-6 text-muted-foreground" />
        <div>
          <p className="font-medium">The ledger is not shared with you</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Material purchases, labour payments and client payments on this
            project are visible only to members the client has given finance
            access. Ask them to grant it from the Team tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Total
          label="Spent"
          value={totals.spent}
          icon={<TrendingDown className="size-3.5" />}
        />
        <Total
          label="Received"
          value={totals.received}
          icon={<TrendingUp className="size-3.5" />}
          tone="good"
        />
        <Total
          label="Outstanding"
          value={totals.outstanding}
          tone={totals.outstanding ? "warn" : "plain"}
        />
      </div>

      <PanelHeader
        title="Entries"
        count={entries.length}
        action="Record money"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <ActionForm
          submitLabel="Record it"
          onSubmit={() =>
            recordLedgerEntry({
              projectId,
              kind,
              amount: Number(amount),
              description,
              counterparty,
              reference,
              status,
              occurredOn: occurred,
            })
          }
          onDone={() => {
            panel.setOpen(false);
            setAmount("");
            setDescription("");
            setCounterparty("");
            setReference("");
            router.refresh();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What kind">
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as LedgerKind)}
                className={inputClass}
              >
                {LEDGER_KINDS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (ETB)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={inputClass}
                required
              />
            </Field>
          </div>

          <Field label="What for">
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Cement, 200 bags"
              className={inputClass}
              required
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paid to / received from">
              <input
                value={counterparty}
                onChange={(event) => setCounterparty(event.target.value)}
                placeholder="Derba Cement"
                className={inputClass}
              />
            </Field>
            <Field label="Receipt or reference">
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={occurred}
                onChange={(event) => setOccurred(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "paid" | "outstanding")
                }
                className={inputClass}
              >
                <option value="paid">Paid</option>
                <option value="outstanding">Outstanding</option>
              </select>
            </Field>
          </div>

          <p className="text-xs text-muted-foreground">
            {directionFor(kind) === 1
              ? "Money coming in to the project."
              : "Money going out of the project."}{" "}
            Entries cannot be deleted — a mistake is corrected by another entry,
            and both stay on the record.
          </p>
        </ActionForm>
      )}

      {entries.length === 0 ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {when(entry.occurred_on)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{entry.description}</span>
                    {entry.counterparty && (
                      <span className="block text-xs text-muted-foreground">
                        {entry.counterparty}
                        {entry.reference && ` · ${entry.reference}`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {ledgerKindLabel(entry.kind)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap",
                      entry.direction === 1
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "",
                    )}
                  >
                    {entry.direction === 1 ? "+" : "−"}
                    {birr(entry.amount, entry.currency)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px]",
                        entry.status === "outstanding" &&
                          "border-amber-500/40 text-amber-600 dark:text-amber-400",
                        entry.status === "void" && "text-muted-foreground line-through",
                      )}
                    >
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Total({
  label,
  value,
  icon,
  tone = "plain",
}: {
  label: string;
  value: number | null;
  icon?: React.ReactNode;
  tone?: "plain" | "good" | "warn";
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value === null ? "—" : birr(value)}
      </p>
    </div>
  );
}
