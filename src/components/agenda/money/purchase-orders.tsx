"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Link2, Loader2, ShoppingCart } from "lucide-react";
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
import {
  BOQ_UNITS,
  MONEY_STATUSES,
  moneyStatusLabel,
  moneyStatusTone,
} from "@/lib/agenda/money";
import type { Commitment, PurchaseOrder } from "@/lib/data/agenda-money";
import type { Submittal } from "@/lib/data/agenda-site";
import {
  raisePurchaseOrder,
  recordDelivery,
  setMoneyStatus,
} from "@/app/(dashboard)/agenda/projects/[projectId]/money-actions";
import { cn } from "@/lib/utils";

/** How many blank lines the form offers. More are added by filling these. */
const LINE_SLOTS = 5;

/**
 * Purchase orders, and what has actually turned up.
 *
 * An order can name the submittal its material was approved on — the brief's
 * third chain: submittal, material approval, purchase order, delivery, daily
 * log. Ordering against the revision that was approved is what stops the wrong
 * thing arriving on site, and it is only possible because both records are in
 * the same system.
 *
 * Delivered quantity sits on each line beside what was ordered, so a part
 * delivery is visible as a part delivery rather than as an order that looks
 * complete.
 */
export function PurchaseOrders({
  projectId,
  orders,
  commitments,
  submittals,
}: {
  projectId: string;
  orders: PurchaseOrder[];
  commitments: Commitment[];
  submittals: Submittal[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);

  const currency = orders[0]?.currency ?? "ETB";
  const ordered = orders.reduce(
    (sum, order) =>
      sum + order.lines.reduce((lineSum, line) => lineSum + line.amount, 0),
    0,
  );

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Purchase orders"
        count={orders.length}
        action="Raise an order"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {orders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4">
          <Figure label="Ordered" amount={ordered} currency={currency} />
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Awaiting delivery</p>
            <p className="text-sm font-medium tabular-nums">
              {
                orders.filter((order) =>
                  order.lines.some(
                    (line) => line.deliveredQuantity < line.quantity,
                  ),
                ).length
              }{" "}
              of {orders.length}
            </p>
          </div>
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await raisePurchaseOrder(projectId, formData);
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
            <Field label="Supplier">
              <input
                name="supplierName"
                required
                maxLength={200}
                className={inputClass}
              />
            </Field>
            <Field label="Approved on submittal">
              <select name="submittalId" className={inputClass} defaultValue="">
                <option value="">Not against one</option>
                {submittals.map((submittal) => (
                  <option key={submittal.id} value={submittal.id}>
                    {submittal.number} — {submittal.title}
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
            <Field label="Wanted on site">
              <input type="date" name="deliveryDate" className={inputClass} />
            </Field>
            <Field label="Deliver to">
              <input
                name="deliveryLocation"
                maxLength={200}
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

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">
              What is being ordered
            </legend>
            {Array.from({ length: LINE_SLOTS }, (_, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem_7rem]">
                <input
                  name={`line.${index}.description`}
                  maxLength={500}
                  className={inputClass}
                  placeholder={index === 0 ? "Ø12 rebar, 12 m lengths" : ""}
                  aria-label={`Line ${index + 1} description`}
                />
                <select
                  name={`line.${index}.unit`}
                  className={inputClass}
                  defaultValue="pcs"
                  aria-label={`Line ${index + 1} unit`}
                >
                  {BOQ_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <input
                  name={`line.${index}.quantity`}
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="Qty"
                  aria-label={`Line ${index + 1} quantity`}
                />
                <input
                  name={`line.${index}.unitPrice`}
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="Rate"
                  aria-label={`Line ${index + 1} rate`}
                />
              </div>
            ))}
          </fieldset>

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
        <Empty>No orders have been raised on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => {
            const expanded = open === order.id;
            const total = order.lines.reduce(
              (sum, line) => sum + line.amount,
              0,
            );
            const outstanding = order.lines.filter(
              (line) => line.deliveredQuantity < line.quantity,
            ).length;

            return (
              <li key={order.id} className="rounded-2xl border">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : order.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <ShoppingCart className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {order.number}
                      </span>
                      <span className="text-sm font-medium">
                        {order.supplierName}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        `${order.lines.length} line${order.lines.length === 1 ? "" : "s"}`,
                        outstanding > 0
                          ? `${outstanding} not yet delivered`
                          : "all delivered",
                        order.deliveryDate
                          ? `wanted ${when(order.deliveryDate)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {order.submittalNumber && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Link2 className="size-3" />
                        Approved on {order.submittalNumber}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip
                      label={moneyStatusLabel(order.status)}
                      tone={moneyStatusTone(order.status)}
                    />
                    <Amount
                      value={total}
                      currency={order.currency}
                      className="text-sm font-medium"
                    />
                  </div>
                </button>

                {expanded && (
                  <div className="space-y-3 border-t p-4">
                    <ul className="space-y-1.5">
                      {order.lines.map((line) => (
                        <li
                          key={line.id}
                          className={cn(
                            "rounded-xl border p-3",
                            line.deliveredQuantity >= line.quantity &&
                              "border-emerald-500/30 bg-emerald-500/5",
                          )}
                        >
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="min-w-0 flex-1 text-sm">
                              {line.description}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {line.quantity} {line.unit} ×{" "}
                              <Amount
                                value={line.unitPrice}
                                currency={order.currency}
                              />
                            </span>
                            <Amount
                              value={line.amount}
                              currency={order.currency}
                              className="text-sm font-medium"
                            />
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              Delivered {line.deliveredQuantity} of{" "}
                              {line.quantity}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              defaultValue={line.deliveredQuantity}
                              disabled={pending}
                              aria-label={`Delivered quantity for ${line.description}`}
                              onBlur={(event) => {
                                const next = Number(event.currentTarget.value);
                                if (
                                  !Number.isFinite(next) ||
                                  next === line.deliveredQuantity
                                ) {
                                  return;
                                }
                                start(async () => {
                                  const result = await recordDelivery(
                                    projectId,
                                    line.id,
                                    next,
                                  );
                                  if (result.error) {
                                    toast.error(result.error);
                                    return;
                                  }
                                  router.refresh();
                                });
                              }}
                              className="h-8 w-24 rounded-lg border bg-transparent px-2 text-xs"
                            />
                          </div>
                        </li>
                      ))}
                    </ul>

                    <select
                      defaultValue={order.status}
                      disabled={pending}
                      aria-label={`Status of ${order.number}`}
                      onChange={(event) => {
                        const next = event.currentTarget.value;
                        start(async () => {
                          const result = await setMoneyStatus(
                            projectId,
                            "agenda_purchase_orders",
                            order.id,
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
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
