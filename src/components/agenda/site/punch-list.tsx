"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Link2, Loader2 } from "lucide-react";
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
import { TASK_PRIORITIES } from "@/lib/agenda/constants";
import { isOverdue } from "@/lib/agenda/records";
import {
  ISSUE_STATUSES,
  byUrgency,
  isIssueOpen,
  issueStatusLabel,
  issueStatusTone,
  punchProgress,
} from "@/lib/agenda/quality";
import type { Person, PunchItem } from "@/lib/data/agenda-site";
import {
  addPunchItem,
  setIssueStatus,
} from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";
import { cn } from "@/lib/utils";

/**
 * The punch list: what stands between the job and handover.
 *
 * Numbered, because it is read out on site — "PL-035 is done" — and a uuid is
 * not something anybody says. The progress bar counts resolved and closed
 * items only: a rejected fix is an item the inspector sent back, and counting
 * it as done is how a punch list reaches zero with snags still on site.
 */
export function PunchList({
  projectId,
  items,
  people,
}: {
  projectId: string;
  items: PunchItem[];
  people: Person[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();

  const ordered = byUrgency(items);
  const progress = punchProgress(items);
  const openCount = items.filter((item) => isIssueOpen(item.status)).length;

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Punch list"
        count={items.length}
        action="Add an item"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {progress === null ? (
        <p className="text-xs text-muted-foreground">
          Nothing on the list yet.
        </p>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {openCount} outstanding of {items.length}
            </span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await addPunchItem(projectId, formData);
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
          <Field label="What has to be put right">
            <textarea
              name="description"
              required
              maxLength={2000}
              className={textareaClass}
              placeholder="Paint finish on the stair core, second landing."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Where on site">
              <input name="location" maxLength={120} className={inputClass} />
            </Field>
            <Field label="Responsible firm">
              <input name="company" maxLength={160} className={inputClass} />
            </Field>
            <Field label="Responsible person">
              <select name="assignedTo" className={inputClass} defaultValue="">
                <option value="">Nobody yet</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName ?? person.username ?? "Unnamed"}
                  </option>
                ))}
              </select>
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
            <Field label="Done by">
              <input type="date" name="dueDate" className={inputClass} />
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

      {ordered.length === 0 ? (
        <Empty>Nothing is on the punch list for this project.</Empty>
      ) : (
        <ul className="space-y-2">
          {ordered.map((item) => {
            const late =
              isIssueOpen(item.status) && isOverdue(item.dueDate, "open");

            return (
              <li
                key={item.id}
                className={cn(
                  "space-y-2 rounded-2xl border p-4",
                  !isIssueOpen(item.status) && "opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.number && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.number}
                        </span>
                      )}
                      <span className="text-sm">{item.description}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        item.location,
                        item.assignedCompany,
                        item.assignedTo
                          ? (item.assignedTo.fullName ?? item.assignedTo.username)
                          : null,
                        item.dueDate ? `Due ${when(item.dueDate)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {item.observationId && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Link2 className="size-3" />
                        From an observation
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip
                      label={issueStatusLabel(item.status)}
                      tone={issueStatusTone(item.status)}
                    />
                    {late && (
                      <span className="text-xs text-destructive">Overdue</span>
                    )}
                  </div>
                </div>

                <select
                  defaultValue={item.status}
                  disabled={pending}
                  aria-label={`Status of ${item.number ?? "this item"}`}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    start(async () => {
                      const result = await setIssueStatus(
                        projectId,
                        "agenda_punch_items",
                        item.id,
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
                  {ISSUE_STATUSES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
