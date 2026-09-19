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
import { Amount, Figure } from "@/components/agenda/money/money-bits";
import { BOQ_UNITS, groupBySection } from "@/lib/agenda/money";
import type { BoqItem } from "@/lib/data/agenda-money";
import {
  addBoqItem,
  recordBoqActual,
} from "@/app/(dashboard)/agenda/projects/[projectId]/money-actions";

/**
 * The bill of quantities.
 *
 * Grouped into sections in the order they were written rather than
 * alphabetically: a bill runs substructure, superstructure, finishes, because
 * that is the order the work happens, and sorting it puts Finishes first.
 *
 * Priced and actual sit side by side on every line, which is why 0091 put both
 * on one row — the variance between them is the whole point, and it is only
 * visible when they are adjacent.
 */
export function BoqTable({
  projectId,
  items,
}: {
  projectId: string;
  items: BoqItem[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [measuring, setMeasuring] = useState<string | null>(null);

  const currency = items[0]?.currency ?? "ETB";
  const sections = groupBySection(items);
  const priced = sections.reduce((sum, section) => sum + section.priced, 0);
  const actual = sections.reduce((sum, section) => sum + section.actual, 0);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Bill of quantities"
        count={items.length}
        action="Add a line"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 rounded-2xl border p-4">
          <Figure label="Priced" amount={priced} currency={currency} />
          <Figure
            label="Actual so far"
            amount={actual}
            currency={currency}
            tone="muted"
          />
          <Figure
            label="Under by"
            amount={actual === 0 ? null : priced - actual}
            currency={currency}
            tone="signed"
          />
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await addBoqItem(projectId, formData);
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
            <Field label="Section">
              <input
                name="section"
                required
                maxLength={120}
                list="boq-sections"
                className={inputClass}
                placeholder="Substructure"
              />
              <datalist id="boq-sections">
                {sections.map((section) => (
                  <option key={section.section} value={section.section} />
                ))}
              </datalist>
            </Field>
            <Field label="Item code">
              <input name="code" maxLength={40} className={inputClass} />
            </Field>
          </div>

          <Field label="Description">
            <input
              name="description"
              required
              maxLength={500}
              className={inputClass}
              placeholder="Mass concrete C-15 to blinding"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Unit">
              <select name="unit" className={inputClass} defaultValue="m3">
                {BOQ_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity">
              <input
                name="quantity"
                inputMode="decimal"
                className={inputClass}
                placeholder="120"
              />
            </Field>
            <Field label="Rate">
              <input
                name="unitPrice"
                inputMode="decimal"
                className={inputClass}
                placeholder="3400"
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

      {sections.length === 0 ? (
        <Empty>No bill has been entered for this project yet.</Empty>
      ) : (
        sections.map((section) => (
          <section key={section.section} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{section.section}</h3>
              <span className="text-xs text-muted-foreground">
                <Amount value={section.priced} currency={currency} />
                {section.actual > 0 && (
                  <>
                    {" priced · "}
                    <Amount value={section.actual} currency={currency} />
                    {" actual"}
                  </>
                )}
              </span>
            </div>

            <ul className="space-y-1.5">
              {section.rows.map((item) => (
                <li key={item.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    {item.code && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.code}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 text-sm">
                      {item.description}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {item.quantity} {item.unit} ×{" "}
                      <Amount value={item.unitPrice} currency={item.currency} />
                    </span>
                    <Amount
                      value={item.amount}
                      currency={item.currency}
                      className="text-sm font-medium"
                    />
                  </div>

                  {(item.actualQuantity !== null || item.actualCost !== null) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Built: {item.actualQuantity ?? "—"} {item.unit} ·{" "}
                      <Amount value={item.actualCost} currency={item.currency} />
                    </p>
                  )}

                  {measuring === item.id ? (
                    <form
                      action={(formData) =>
                        start(async () => {
                          const result = await recordBoqActual(
                            projectId,
                            item.id,
                            formData,
                          );
                          if (result.error) {
                            toast.error(result.error);
                            return;
                          }
                          setMeasuring(null);
                          router.refresh();
                        })
                      }
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <Field label="Built" className="w-28">
                        <input
                          name="actualQuantity"
                          inputMode="decimal"
                          defaultValue={item.actualQuantity ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Cost" className="w-32">
                        <input
                          name="actualCost"
                          inputMode="decimal"
                          defaultValue={item.actualCost ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <button
                        type="submit"
                        disabled={pending}
                        className="h-9 rounded-lg bg-brand px-3 text-xs font-medium text-brand-foreground disabled:opacity-50"
                      >
                        Record
                      </button>
                      <button
                        type="button"
                        onClick={() => setMeasuring(null)}
                        className="h-9 rounded-lg border px-3 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMeasuring(item.id)}
                      className="mt-2 h-7 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      Record what was built
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
