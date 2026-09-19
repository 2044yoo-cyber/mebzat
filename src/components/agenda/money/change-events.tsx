"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Boxes, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  textareaClass,
  usePanel,
} from "@/components/agenda/shared";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import { Amount, Figure } from "@/components/agenda/money/money-bits";
import {
  CHANGE_REASONS,
  MONEY_STATUSES,
  changeReasonLabel,
  isLiveMoney,
  moneyStatusLabel,
  moneyStatusTone,
} from "@/lib/agenda/money";
import type { ChangeEvent } from "@/lib/data/agenda-money";
import type { Rfi } from "@/lib/data/agenda-site";
import {
  raiseChangeEvent,
  setMoneyStatus,
} from "@/app/(dashboard)/agenda/projects/[projectId]/money-actions";

/**
 * Change events: things that might cost money.
 *
 * 0091's own words — an event exists so the cost is visible while it is still
 * an argument, rather than appearing fully formed as a change order nobody saw
 * coming. So the potential cost is optional here: "we do not know yet" is a
 * real answer, and zero is not the same as unknown.
 *
 * The exposure at the top counts live events only. An event that was rejected
 * or withdrawn is not exposure, and leaving it in the figure is how a project
 * carries a number nobody is going to resolve.
 */
export function ChangeEvents({
  projectId,
  events,
  rfis,
}: {
  projectId: string;
  events: ChangeEvent[];
  rfis: Rfi[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();

  const currency = events[0]?.currency ?? "ETB";
  const live = events.filter((event) => isLiveMoney(event.status));
  const exposure = live.reduce(
    (sum, event) => sum + (event.potentialCost ?? 0),
    0,
  );
  const days = live.reduce(
    (sum, event) => sum + (event.potentialScheduleDays ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Change events"
        count={events.length}
        action="Raise a change"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {events.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4">
          <Figure
            label="Exposure being argued"
            amount={exposure}
            currency={currency}
          />
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Programme at risk</p>
            <p className="text-sm font-medium tabular-nums">
              {days} day{days === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await raiseChangeEvent(projectId, formData);
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
          <Field label="What changed">
            <input
              name="title"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Rock encountered at foundation level, grid D"
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
            <Field label="Why">
              <select name="reason" className={inputClass} defaultValue="other">
                {CHANGE_REASONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Arising from an RFI">
              <select name="rfiId" className={inputClass} defaultValue="">
                <option value="">Not from one</option>
                {rfis.map((rfi) => (
                  <option key={rfi.id} value={rfi.id}>
                    {rfi.number} — {rfi.subject}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cost, if known">
              <input
                name="potentialCost"
                inputMode="decimal"
                className={inputClass}
                placeholder="Leave blank if unknown"
              />
            </Field>
            <Field label="Days, if known">
              <input
                name="potentialScheduleDays"
                inputMode="numeric"
                className={inputClass}
                placeholder="Leave blank if unknown"
              />
            </Field>
            <Field label="Who is responsible">
              <input
                name="responsibleParty"
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

      {events.length === 0 ? (
        <Empty>Nothing has changed on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id} className="space-y-2 rounded-2xl border p-4">
              <div className="flex items-start gap-3">
                <Boxes className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {event.number}
                    </span>
                    <span className="text-sm font-medium">{event.title}</span>
                  </div>
                  {event.description && (
                    <p className="text-xs text-muted-foreground">
                      {event.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {[
                      changeReasonLabel(event.reason),
                      event.responsibleParty,
                      event.potentialCost === null
                        ? "cost not yet known"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {event.rfiNumber && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="size-3" />
                      From {event.rfiNumber}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusChip
                    label={moneyStatusLabel(event.status)}
                    tone={moneyStatusTone(event.status)}
                  />
                  <Amount
                    value={event.potentialCost}
                    currency={event.currency}
                    className="text-sm font-medium"
                  />
                  {event.potentialScheduleDays !== null && (
                    <span className="text-xs text-muted-foreground">
                      {event.potentialScheduleDays} day
                      {event.potentialScheduleDays === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>

              <select
                defaultValue={event.status}
                disabled={pending}
                aria-label={`Status of ${event.number}`}
                onChange={(changeEvent) => {
                  const next = changeEvent.currentTarget.value;
                  start(async () => {
                    const result = await setMoneyStatus(
                      projectId,
                      "agenda_change_events",
                      event.id,
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
