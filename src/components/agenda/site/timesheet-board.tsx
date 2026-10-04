"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Timer } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  usePanel,
  when,
} from "@/components/agenda/shared";
import { hoursByDay } from "@/lib/agenda/billing";
import type { ScheduleItem } from "@/lib/data/agenda-site";
import type { Timesheet } from "@/lib/data/agenda-billing";
import { recordHours } from "@/app/(dashboard)/agenda/projects/[projectId]/billing-actions";

/**
 * Who was on site, and for how long.
 *
 * A site record rather than a money one — 0091 chose that deliberately, and it
 * is why any member may write here. The person who knows who turned up is the
 * supervisor, and requiring finance access to say so is how the record stops
 * being kept.
 *
 * Grouped by day, because a site is managed by the day and "how many were on
 * site on the twelfth" is a question a dispute turns on. The crew size counts
 * distinct people: two entries for one person on one day is a split shift, not
 * two people.
 */
export function TimesheetBoard({
  projectId,
  rows,
  activities,
}: {
  projectId: string;
  rows: Timesheet[];
  activities: ScheduleItem[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();

  const days = hoursByDay(rows);
  const totalHours = rows.reduce(
    (sum, row) => sum + row.hours + row.overtimeHours,
    0,
  );

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Timesheets"
        count={rows.length}
        action="Record hours"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Hours recorded</p>
            <p className="text-sm font-medium tabular-nums">
              {totalHours.toLocaleString()}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Days worked</p>
            <p className="text-sm font-medium tabular-nums">{days.length}</p>
          </div>
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await recordHours(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Recorded");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Who">
              <input
                name="workerName"
                required
                maxLength={200}
                className={inputClass}
              />
            </Field>
            <Field label="Which firm">
              <input name="companyName" maxLength={200} className={inputClass} />
            </Field>
            <Field label="Day">
              <input
                type="date"
                name="workedOn"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputClass}
              />
            </Field>
            <Field label="Hours">
              <input
                name="hours"
                inputMode="decimal"
                className={inputClass}
                placeholder="8"
              />
            </Field>
            <Field label="Overtime">
              <input name="overtimeHours" inputMode="decimal" className={inputClass} />
            </Field>
            <Field label="On which activity">
              <select name="scheduleItemId" className={inputClass} defaultValue="">
                <option value="">Not against one</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="What they did">
            <input name="activity" maxLength={300} className={inputClass} />
          </Field>

          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Record it
          </button>
        </form>
      )}

      {days.length === 0 ? (
        <Empty>No hours have been recorded on this project yet.</Empty>
      ) : (
        days.map((day) => (
          <section key={day.day} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{when(day.day)}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {day.workers} on site · {day.hours} h
                {day.overtime > 0 ? ` + ${day.overtime} h overtime` : ""}
              </span>
            </div>
            <ul className="space-y-1.5">
              {day.rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
                >
                  <Timer className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 text-sm">
                    {row.workerName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      row.companyName,
                      row.scheduleItemName ?? row.activity,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="text-xs tabular-nums">
                    {row.hours} h
                    {row.overtimeHours > 0 ? ` + ${row.overtimeHours}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
