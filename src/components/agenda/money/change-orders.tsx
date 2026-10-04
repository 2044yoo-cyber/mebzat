"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FileSignature, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  textareaClass,
  usePanel,
  whenTime,
} from "@/components/agenda/shared";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import { Amount, Figure } from "@/components/agenda/money/money-bits";
import {
  changeImpact,
  isAgreed,
  moneyStatusLabel,
  moneyStatusTone,
} from "@/lib/agenda/money";
import type {
  ChangeEvent,
  ChangeOrder,
  Contract,
} from "@/lib/data/agenda-money";
import {
  decideChangeOrder,
  raiseChangeOrder,
} from "@/app/(dashboard)/agenda/projects/[projectId]/money-actions";

/**
 * Change orders: the changes that were agreed, and what they did.
 *
 * Approving one here moves the contract's sum, and it does so in the database
 * — `agenda_sync_contract_changes` in 0091 recomputes a contract's
 * `approved_changes` from every approved order against it. So this screen does
 * not add anything up and write it anywhere: it records a decision, and the
 * contract follows.
 *
 * Approved and pending are shown apart. "The contract is up by four million"
 * and "up by four million with another six being argued about" are different
 * sentences, and one total says the first while meaning the second.
 */
export function ChangeOrders({
  projectId,
  orders,
  contracts,
  events,
}: {
  projectId: string;
  orders: ChangeOrder[];
  contracts: Contract[];
  events: ChangeEvent[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();

  const currency = orders[0]?.currency ?? "ETB";
  const impact = changeImpact(orders);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Change orders"
        count={orders.length}
        action="Raise an order"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {orders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4 sm:grid-cols-4">
          <Figure
            label="Approved"
            amount={impact.approvedCost}
            currency={currency}
          />
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Approved days</p>
            <p className="text-sm font-medium tabular-nums">
              {impact.approvedDays}
            </p>
          </div>
          <Figure
            label="Still being argued"
            amount={impact.pendingCost}
            currency={currency}
            tone="muted"
          />
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Days at stake</p>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">
              {impact.pendingDays}
            </p>
          </div>
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await raiseChangeOrder(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Raised as a draft");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <Field label="What is being ordered">
            <input
              name="title"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Additional excavation and rock breaking, grid D"
            />
          </Field>

          <Field label="Detail">
            <textarea
              name="description"
              maxLength={4000}
              className={textareaClass}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Against which contract">
              <select name="contractId" className={inputClass} defaultValue="">
                <option value="">Not against one</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.number} — {contract.companyName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From which change event">
              <select
                name="changeEventId"
                className={inputClass}
                defaultValue=""
              >
                <option value="">Not from one</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.number} — {event.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cost impact">
              <input
                name="costImpact"
                inputMode="decimal"
                className={inputClass}
                placeholder="A reduction is a negative number"
              />
            </Field>
            <Field label="Days added">
              <input
                name="scheduleImpactDays"
                inputMode="numeric"
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
          </div>

          <p className="text-xs text-muted-foreground">
            It is saved as a draft. Approving it is a separate act, because
            approval is what moves the contract sum.
          </p>

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

      {orders.length === 0 ? (
        <Empty>No change orders have been raised on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => (
            <li key={order.id} className="space-y-2 rounded-2xl border p-4">
              <div className="flex items-start gap-3">
                <FileSignature className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {order.number}
                    </span>
                    <span className="text-sm font-medium">{order.title}</span>
                  </div>
                  {order.description && (
                    <p className="text-xs text-muted-foreground">
                      {order.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {[
                      order.contractNumber
                        ? `Against ${order.contractNumber}`
                        : "Not against a contract",
                      order.scheduleImpactDays !== 0
                        ? `${order.scheduleImpactDays} days`
                        : null,
                      order.decidedAt
                        ? `decided ${whenTime(order.decidedAt)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {order.changeEventNumber && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="size-3" />
                      From {order.changeEventNumber}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusChip
                    label={moneyStatusLabel(order.status)}
                    tone={moneyStatusTone(order.status)}
                  />
                  <Amount
                    value={order.costImpact}
                    currency={order.currency}
                    className="text-sm font-medium"
                  />
                </div>
              </div>

              {isAgreed(order.status) ? (
                <p className="text-xs text-muted-foreground">
                  {order.contractNumber
                    ? `Counted in ${order.contractNumber}'s current value.`
                    : "Approved. It is against no contract, so no contract sum moved."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await decideChangeOrder(
                          projectId,
                          order.id,
                          "approved",
                        );
                        if (result.error) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success("Approved");
                        router.refresh();
                      })
                    }
                    className="h-8 rounded-lg bg-brand px-3 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Approve it
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await decideChangeOrder(
                          projectId,
                          order.id,
                          "rejected",
                        );
                        if (result.error) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success("Rejected");
                        router.refresh();
                      })
                    }
                    className="h-8 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Reject it
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
