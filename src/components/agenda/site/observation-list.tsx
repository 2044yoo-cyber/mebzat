"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClipboardCheck, Link2, Loader2, TriangleAlert } from "lucide-react";
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
  OBSERVATION_KINDS,
  byUrgency,
  isIssueOpen,
  issueStatusLabel,
  issueStatusTone,
  observationKindLabel,
} from "@/lib/agenda/quality";
import type { Observation, Person } from "@/lib/data/agenda-site";
import {
  addPunchItem,
  raiseObservation,
  setIssueStatus,
} from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";

/**
 * Observations: what somebody saw that is not right.
 *
 * Open first and worst first, because an observations list is a list of work
 * outstanding, not a diary. An observation raised from a failed inspection
 * check says so, and offers to become a punch item — the second link in the
 * chain, made where somebody is already looking at the problem.
 */
export function ObservationList({
  projectId,
  observations,
  people,
}: {
  projectId: string;
  observations: Observation[];
  people: Person[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [promoting, setPromoting] = useState<string | null>(null);

  const ordered = byUrgency(observations);
  const openCount = observations.filter((item) =>
    isIssueOpen(item.status),
  ).length;

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Observations"
        count={observations.length}
        action="Raise an observation"
        open={panel.open}
        onToggle={panel.toggle}
      />

      <p className="text-xs text-muted-foreground">
        {openCount === 0
          ? "Nothing outstanding."
          : `${openCount} still to be put right.`}
      </p>

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await raiseObservation(projectId, formData);
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
          <Field label="What was observed">
            <textarea
              name="description"
              required
              maxLength={2000}
              className={textareaClass}
              placeholder="Scaffold tie missing at the third lift, east elevation."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind">
              <select name="kind" className={inputClass} defaultValue="general">
                {OBSERVATION_KINDS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
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
            <Field label="Put right by">
              <input type="date" name="dueDate" className={inputClass} />
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

      {ordered.length === 0 ? (
        <Empty>Nothing has been observed on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {ordered.map((observation) => {
            // `isOverdue` takes a review status; an issue's openness is the
            // same question asked of a different vocabulary, so it is asked
            // here rather than bent into that function.
            const late =
              isIssueOpen(observation.status) &&
              isOverdue(observation.dueDate, "open");

            return (
              <li key={observation.id} className="space-y-2 rounded-2xl border p-4">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm">{observation.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        observationKindLabel(observation.kind),
                        observation.location,
                        observation.responsibleCompany,
                        observation.assignedTo
                          ? (observation.assignedTo.fullName ??
                            observation.assignedTo.username)
                          : null,
                        observation.dueDate
                          ? `Due ${when(observation.dueDate)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {observation.inspectionItemId && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Link2 className="size-3" />
                        Raised from a failed inspection check
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip
                      label={issueStatusLabel(observation.status)}
                      tone={issueStatusTone(observation.status)}
                    />
                    {late && (
                      <span className="text-xs text-destructive">Overdue</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    defaultValue={observation.status}
                    disabled={pending}
                    aria-label="Status"
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      start(async () => {
                        const result = await setIssueStatus(
                          projectId,
                          "agenda_observations",
                          observation.id,
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

                  {isIssueOpen(observation.status) &&
                    promoting !== observation.id && (
                      <button
                        type="button"
                        onClick={() => setPromoting(observation.id)}
                        className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
                      >
                        <ClipboardCheck className="size-3" />
                        Add to the punch list
                      </button>
                    )}
                </div>

                {promoting === observation.id && (
                  <form
                    action={(formData) =>
                      start(async () => {
                        const result = await addPunchItem(
                          projectId,
                          formData,
                          observation.id,
                        );
                        if (result.error) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success("Added to the punch list");
                        setPromoting(null);
                        router.refresh();
                      })
                    }
                    className="space-y-2 rounded-xl border p-3"
                  >
                    <Field label="What has to be put right">
                      <textarea
                        name="description"
                        required
                        defaultValue={observation.description}
                        maxLength={2000}
                        className={textareaClass}
                      />
                    </Field>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Priority">
                        <select
                          name="priority"
                          className={inputClass}
                          defaultValue="normal"
                        >
                          {TASK_PRIORITIES.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Done by">
                        <input
                          type="date"
                          name="dueDate"
                          defaultValue={observation.dueDate ?? ""}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <input
                      type="hidden"
                      name="location"
                      value={observation.location ?? ""}
                    />
                    <input
                      type="hidden"
                      name="company"
                      value={observation.responsibleCompany ?? ""}
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={pending}
                        className="h-8 rounded-lg bg-brand px-3 text-xs font-medium text-brand-foreground disabled:opacity-50"
                      >
                        Add it
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromoting(null)}
                        className="h-8 rounded-lg border px-3 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
