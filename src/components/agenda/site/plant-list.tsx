"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Package, Wrench } from "lucide-react";
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
import {
  EQUIPMENT_STATUSES,
  equipmentStatusLabel,
  equipmentStatusTone,
  plantInUsePercent,
  serviceDue,
} from "@/lib/agenda/billing";
import type { Equipment } from "@/lib/data/agenda-billing";
import {
  saveEquipment,
  updateEquipment,
} from "@/app/(dashboard)/agenda/projects/[projectId]/billing-actions";
import { cn } from "@/lib/utils";

/**
 * The plant on site.
 *
 * A site record, like timesheets: knowing a crane is here is not knowing what
 * it cost, so any member may keep this.
 *
 * Utilisation excludes off-hire machines from both halves. They have gone
 * back, and leaving them in the denominator makes a site look idle for
 * machines it no longer has.
 */
export function PlantList({
  projectId,
  items,
}: {
  projectId: string;
  items: Equipment[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  const utilisation = plantInUsePercent(items);
  const dueService = items.filter((item) => serviceDue(item.nextServiceOn));

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Equipment"
        count={items.length}
        action="Add a machine"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">In use</p>
            <p className="text-sm font-medium tabular-nums">
              {utilisation === null ? "—" : `${utilisation}%`}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Service due</p>
            <p
              className={cn(
                "text-sm font-medium tabular-nums",
                dueService.length > 0 && "text-amber-600 dark:text-amber-400",
              )}
            >
              {dueService.length}
            </p>
          </div>
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await saveEquipment(projectId, formData);
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
            <Field label="Machine">
              <input
                name="name"
                required
                maxLength={200}
                className={inputClass}
                placeholder="Tower crane, Potain MDT 219"
              />
            </Field>
            <Field label="Kind">
              <input
                name="category"
                maxLength={80}
                className={inputClass}
                placeholder="Lifting"
              />
            </Field>
            <Field label="Whose it is">
              <input name="ownerCompany" maxLength={200} className={inputClass} />
            </Field>
            <Field label="Operator">
              <input name="operatorName" maxLength={200} className={inputClass} />
            </Field>
            <Field label="State">
              <select name="status" className={inputClass} defaultValue="available">
                {EQUIPMENT_STATUSES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hours on the clock">
              <input name="hoursUsed" inputMode="decimal" className={inputClass} />
            </Field>
            <Field label="Last serviced">
              <input type="date" name="lastServiceOn" className={inputClass} />
            </Field>
            <Field label="Next service">
              <input type="date" name="nextServiceOn" className={inputClass} />
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
        <Empty>No plant has been recorded on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const due = serviceDue(item.nextServiceOn);
            return (
              <li key={item.id} className="space-y-2 rounded-2xl border p-4">
                <div className="flex items-start gap-3">
                  <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        item.category,
                        item.ownerCompany,
                        item.operatorName,
                        `${item.hoursUsed} h`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {item.nextServiceOn && (
                      <p
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          due
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        <Wrench className="size-3" />
                        {due ? "Service due " : "Next service "}
                        {when(item.nextServiceOn)}
                      </p>
                    )}
                  </div>
                  <StatusChip
                    label={equipmentStatusLabel(item.status)}
                    tone={equipmentStatusTone(item.status)}
                  />
                </div>

                {editing === item.id ? (
                  <form
                    action={(formData) =>
                      start(async () => {
                        const result = await updateEquipment(
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
                    <Field label="State">
                      <select
                        name="status"
                        className={inputClass}
                        defaultValue={item.status}
                      >
                        {EQUIPMENT_STATUSES.map((entry) => (
                          <option key={entry.value} value={entry.value}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Hours">
                      <input
                        name="hoursUsed"
                        inputMode="decimal"
                        defaultValue={item.hoursUsed}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Next service">
                      <input
                        type="date"
                        name="nextServiceOn"
                        defaultValue={item.nextServiceOn ?? ""}
                        className={inputClass}
                      />
                    </Field>
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
                    Update it
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
