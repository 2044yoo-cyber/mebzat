"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Gavel, Loader2 } from "lucide-react";
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
  BID_STATUSES,
  bidStatusLabel,
  bidStatusTone,
  compareBids,
} from "@/lib/agenda/billing";
import { moneyStatusLabel, moneyStatusTone } from "@/lib/agenda/money";
import type { BidPackage } from "@/lib/data/agenda-billing";
import {
  awardBid,
  openBidPackage,
  saveBid,
} from "@/app/(dashboard)/agenda/projects/[projectId]/billing-actions";
import { cn } from "@/lib/utils";

/**
 * Bid packages and what came back.
 *
 * Only priced bids are compared. An invitation nobody answered has no amount,
 * and counting it as zero would make the lowest bid free — the kind of number
 * somebody circles in a meeting.
 *
 * The spread is shown because it is what the comparison is for: three bids
 * within 2% say the scope is clear, three that are 40% apart say it is not,
 * and that is worth knowing before awarding anything.
 */
export function BidBoard({
  projectId,
  packages,
}: {
  projectId: string;
  packages: BidPackage[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Bidding"
        count={packages.length}
        action="Open a package"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await openBidPackage(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Opened");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <Field label="What is being tendered">
            <input
              name="title"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Aluminium windows and curtain walling"
            />
          </Field>

          <Field label="Scope">
            <textarea name="scope" maxLength={4000} className={textareaClass} />
          </Field>

          <Field label="Bids in by">
            <input type="date" name="dueAt" className={inputClass} />
          </Field>

          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Open it
          </button>
        </form>
      )}

      {packages.length === 0 ? (
        <Empty>Nothing has been put out to tender on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {packages.map((pack) => {
            const expanded = open === pack.id;
            const comparison = compareBids(pack.bids);
            const currency = pack.bids[0]?.currency ?? "ETB";
            const awarded = pack.bids.find((bid) => bid.status === "awarded");

            return (
              <li key={pack.id} className="rounded-2xl border">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : pack.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <Gavel className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {pack.number}
                      </span>
                      <span className="text-sm font-medium">{pack.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        `${pack.bids.length} invited`,
                        `${comparison.priced} priced`,
                        pack.dueAt ? `in by ${whenTime(pack.dueAt)}` : null,
                        awarded ? `awarded to ${awarded.bidderName}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <StatusChip
                    label={moneyStatusLabel(pack.status)}
                    tone={moneyStatusTone(pack.status)}
                  />
                </button>

                {expanded && (
                  <div className="space-y-3 border-t p-4">
                    {pack.scope && (
                      <p className="text-sm whitespace-pre-wrap">{pack.scope}</p>
                    )}

                    {comparison.priced > 0 && (
                      <div className="grid grid-cols-2 gap-3 rounded-xl border p-3 sm:grid-cols-4">
                        <Figure
                          label="Lowest"
                          amount={comparison.lowest}
                          currency={currency}
                        />
                        <Figure
                          label="Average"
                          amount={comparison.average}
                          currency={currency}
                          tone="muted"
                        />
                        <Figure
                          label="Highest"
                          amount={comparison.highest}
                          currency={currency}
                          tone="muted"
                        />
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">Spread</p>
                          <p
                            className={cn(
                              "text-sm font-medium tabular-nums",
                              comparison.spreadPercent !== null &&
                                comparison.spreadPercent > 25 &&
                                "text-amber-600 dark:text-amber-400",
                            )}
                          >
                            {comparison.spreadPercent === null
                              ? "—"
                              : `${comparison.spreadPercent}%`}
                          </p>
                        </div>
                      </div>
                    )}

                    {comparison.spreadPercent !== null &&
                      comparison.spreadPercent > 25 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          The bids are far apart. That usually means the scope
                          is being read differently, not that one firm is
                          cheap.
                        </p>
                      )}

                    <ul className="space-y-1.5">
                      {pack.bids.map((bid) => (
                        <li
                          key={bid.id}
                          className={cn(
                            "rounded-xl border p-3",
                            bid.status === "awarded" &&
                              "border-emerald-500/40 bg-emerald-500/5",
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1 text-sm font-medium">
                              {bid.bidderName}
                            </span>
                            <Amount
                              value={bid.amount}
                              currency={bid.currency}
                              className="text-sm"
                            />
                            <StatusChip
                              label={bidStatusLabel(bid.status)}
                              tone={bidStatusTone(bid.status)}
                            />
                          </div>
                          {bid.notes && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {bid.notes}
                            </p>
                          )}
                          {!awarded && bid.amount !== null && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                start(async () => {
                                  const result = await awardBid(
                                    projectId,
                                    pack.id,
                                    bid.id,
                                  );
                                  if (result.error) {
                                    toast.error(result.error);
                                    return;
                                  }
                                  toast.success(`Awarded to ${bid.bidderName}`);
                                  router.refresh();
                                })
                              }
                              className="mt-2 h-7 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                            >
                              Award it to them
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    {inviting === pack.id ? (
                      <form
                        action={(formData) =>
                          start(async () => {
                            const result = await saveBid(
                              projectId,
                              pack.id,
                              formData,
                            );
                            if (result.error) {
                              toast.error(result.error);
                              return;
                            }
                            toast.success("Saved");
                            setInviting(null);
                            router.refresh();
                          })
                        }
                        className="space-y-2 rounded-xl border p-3"
                      >
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field label="Bidder">
                            <input
                              name="bidderName"
                              required
                              maxLength={200}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Their price, if they have given one">
                            <input
                              name="amount"
                              inputMode="decimal"
                              className={inputClass}
                              placeholder="Leave blank until they answer"
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
                          <Field label="Where they are">
                            <select
                              name="status"
                              className={inputClass}
                              defaultValue="invited"
                            >
                              {BID_STATUSES.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                  {entry.label}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <textarea
                          name="notes"
                          maxLength={2000}
                          className={textareaClass}
                          placeholder="Qualifications, exclusions, anything said on the phone."
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={pending}
                            className="h-8 rounded-lg bg-brand px-3 text-xs font-medium text-brand-foreground disabled:opacity-50"
                          >
                            Save it
                          </button>
                          <button
                            type="button"
                            onClick={() => setInviting(null)}
                            className="h-8 rounded-lg border px-3 text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setInviting(pack.id)}
                        className="h-8 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
                      >
                        Add a bidder
                      </button>
                    )}
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
