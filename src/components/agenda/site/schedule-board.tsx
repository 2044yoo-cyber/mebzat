"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Diamond, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  usePanel,
  when,
} from "@/components/agenda/shared";
import { TASK_PRIORITIES } from "@/lib/agenda/constants";
import {
  buildScheduleTree,
  elapsedPercent,
  scheduleVariance,
} from "@/lib/agenda/records";
import type { Person, ScheduleItem } from "@/lib/data/agenda-site";
import {
  addScheduleItem,
  setScheduleProgress,
} from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";
import { cn } from "@/lib/utils";

/**
 * The programme.
 *
 * Progress and elapsed time are drawn as two bars, not one. An activity 20%
 * built and 80% elapsed is the one the programme meeting is about, and a
 * single bar — whichever of the two it showed — would hide exactly that.
 * Progress is what somebody reported; elapsed is what the calendar says.
 */
export function ScheduleBoard({
  projectId,
  items,
  people,
}: {
  projectId: string;
  items: ScheduleItem[];
  people: Person[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();

  const tree = buildScheduleTree(items);

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Schedule"
        count={items.length}
        action="Add an activity"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await addScheduleItem(projectId, formData);
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
          <Field label="Activity">
            <input
              name="name"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Ground floor slab pour"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts">
              <input type="date" name="startDate" className={inputClass} />
            </Field>
            <Field label="Finishes">
              <input type="date" name="finishDate" className={inputClass} />
            </Field>
            <Field label="Working days">
              <input
                type="number"
                name="durationDays"
                min={0}
                max={3650}
                inputMode="numeric"
                className={inputClass}
                placeholder="5"
              />
            </Field>
            <Field label="Priority">
              <select name="priority" className={inputClass} defaultValue="normal">
                {TASK_PRIORITIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Under">
              <select name="parentId" className={inputClass} defaultValue="">
                <option value="">Top level</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Responsible">
              <select name="assignedTo" className={inputClass} defaultValue="">
                <option value="">Nobody yet</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName ?? person.username ?? "Unnamed"}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="milestone"
                className="size-4 rounded border"
              />
              This is a milestone
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="critical"
                className="size-4 rounded border"
              />
              On the critical path
            </label>
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

      {tree.length === 0 ? (
        <Empty>Nothing has been programmed for this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {tree.map((node) => (
            <Row
              key={node.id}
              node={node}
              depth={0}
              pending={pending}
              onProgress={(itemId, percent) =>
                start(async () => {
                  const result = await setScheduleProgress(
                    projectId,
                    itemId,
                    percent,
                  );
                  if (result.error) {
                    toast.error(result.error);
                    return;
                  }
                  router.refresh();
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type Node = ReturnType<typeof buildScheduleTree<ScheduleItem>>[number];

function Row({
  node,
  depth,
  pending,
  onProgress,
}: {
  node: Node;
  depth: number;
  pending: boolean;
  onProgress: (itemId: string, percent: number) => void;
}) {
  const elapsed = elapsedPercent(node.startDate, node.finishDate);
  const variance = scheduleVariance(
    node.startDate,
    node.finishDate,
    node.progressPercent,
  );

  return (
    <>
      <li
        className={cn(
          "rounded-2xl border p-3",
          node.isCritical && "border-destructive/40",
        )}
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {node.isMilestone && (
            <Diamond className="size-3.5 shrink-0 fill-current text-brand" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {node.name}
          </span>
          {variance !== null && (
            <span
              className={cn(
                "text-xs font-medium",
                variance < -10
                  ? "text-destructive"
                  : variance < 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {variance > 0 ? "+" : ""}
              {variance} pts
            </span>
          )}
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          {[
            node.startDate ? when(node.startDate) : null,
            node.finishDate ? when(node.finishDate) : null,
          ]
            .filter(Boolean)
            .join(" → ") || "No dates set"}
          {node.durationDays !== null ? ` · ${node.durationDays} working days` : ""}
          {node.assignedTo
            ? ` · ${node.assignedTo.fullName ?? node.assignedTo.username}`
            : ""}
        </p>

        <div className="mt-2 space-y-1">
          <Bar
            label="Built"
            percent={node.progressPercent}
            className="bg-brand"
          />
          <Bar
            label="Elapsed"
            percent={elapsed}
            className="bg-muted-foreground/40"
          />
        </div>

        <label className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Report progress</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            defaultValue={node.progressPercent}
            disabled={pending}
            // `onBlur` rather than `onChange`: a range input fires on every
            // pixel of a drag, and one write per pixel is a hundred writes
            // per adjustment.
            onBlur={(event) => {
              const next = Number(event.currentTarget.value);
              if (next !== node.progressPercent) onProgress(node.id, next);
            }}
            className="h-1.5 flex-1 accent-[var(--brand)]"
            aria-label={`Progress on ${node.name}`}
          />
        </label>
      </li>

      {node.children.map((child) => (
        <Row
          key={child.id}
          node={child}
          depth={depth + 1}
          pending={pending}
          onProgress={onProgress}
        />
      ))}
    </>
  );
}

function Bar({
  label,
  percent,
  className,
}: {
  label: string;
  percent: number | null;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", className)}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {percent === null ? "—" : `${percent}%`}
      </span>
    </div>
  );
}
