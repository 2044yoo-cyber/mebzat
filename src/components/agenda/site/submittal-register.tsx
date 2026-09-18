"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  textareaClass,
  usePanel,
  when,
  whenTime,
} from "@/components/agenda/shared";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import {
  DISCIPLINES,
  disciplineLabel,
  isAwaitingAnswer,
  isOverdue,
  reviewStatusLabel,
  reviewStatusTone,
  revisionLabel,
} from "@/lib/agenda/records";
import type { Person, Submittal } from "@/lib/data/agenda-site";
import {
  openSubmittal,
  resubmit,
  reviewRevision,
} from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";
import { cn } from "@/lib/utils";

/** What a reviewer can decide, in the order a reviewer decides it. */
const OUTCOMES = [
  { value: "approved", label: "Approved" },
  { value: "approved_with_comments", label: "Approved with comments" },
  { value: "revise_resubmit", label: "Revise and resubmit" },
  { value: "rejected", label: "Rejected" },
] as const;

/**
 * The submittal register: what has gone to the consultant, and what came back.
 *
 * A submittal is a series of revisions with one of them current, the same
 * shape a drawing has. The register shows the current one because "what is
 * with the consultant now" is the question it is opened to answer; the whole
 * series is a click away because "what did they say in March" is the question
 * a dispute turns on.
 */
export function SubmittalRegister({
  projectId,
  submittals,
  people,
}: {
  projectId: string;
  submittals: Submittal[];
  people: Person[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  const waiting = submittals.filter((item) => isAwaitingAnswer(item.status));

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Submittals"
        count={submittals.length}
        action="Open a submittal"
        open={panel.open}
        onToggle={panel.toggle}
      />

      <p className="text-xs text-muted-foreground">
        {waiting.length === 0
          ? "Nothing is with a reviewer."
          : `${waiting.length} with a reviewer.`}
      </p>

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await openSubmittal(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Opened, Rev 01 issued");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <Field label="Title">
            <input
              name="title"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Reinforcement shop drawings, ground floor slab"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Specification section">
              <input
                name="specSection"
                maxLength={60}
                className={inputClass}
                placeholder="03 20 00"
              />
            </Field>

            <Field label="Discipline">
              <select name="discipline" className={inputClass} defaultValue="">
                <option value="">Not stated</option>
                {DISCIPLINES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Submitted by (firm)">
              <input
                name="contractor"
                maxLength={160}
                className={inputClass}
                placeholder="The subcontractor's name"
              />
            </Field>

            <Field label="Reviewer">
              <select name="reviewer" className={inputClass} defaultValue="">
                <option value="">Not assigned yet</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName ?? person.username ?? "Unnamed"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Needed back by">
              <input type="date" name="requiredBy" className={inputClass} />
            </Field>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Open it and issue Rev 01
          </button>
        </form>
      )}

      {submittals.length === 0 ? (
        <Empty>Nothing has been submitted for review on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {submittals.map((submittal) => {
            const current =
              submittal.revisions.find(
                (revision) => revision.id === submittal.currentRevisionId,
              ) ?? submittal.revisions[0];
            const open = expanded === submittal.id;
            const late = isOverdue(submittal.requiredBy, submittal.status);

            return (
              <li key={submittal.id} className="rounded-2xl border">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : submittal.id)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {submittal.number}
                      </span>
                      <span className="text-sm font-medium">
                        {submittal.title}
                      </span>
                      {current && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {revisionLabel(current.revision)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        submittal.specSection,
                        disciplineLabel(submittal.discipline),
                        submittal.contractor,
                        submittal.reviewer
                          ? `Reviewer: ${submittal.reviewer.fullName ?? submittal.reviewer.username}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip
                      label={reviewStatusLabel(submittal.status)}
                      tone={reviewStatusTone(submittal.status)}
                    />
                    {late && submittal.requiredBy && (
                      <span className="text-xs text-destructive">
                        Was due {when(submittal.requiredBy)}
                      </span>
                    )}
                  </div>
                </button>

                {open && (
                  <div className="space-y-3 border-t p-4">
                    <ul className="space-y-2">
                      {submittal.revisions.map((revision) => (
                        <li
                          key={revision.id}
                          className={cn(
                            "rounded-xl border p-3",
                            revision.id === submittal.currentRevisionId &&
                              "border-brand/40 bg-brand/5",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs">
                              {revisionLabel(revision.revision)}
                            </span>
                            <StatusChip
                              label={reviewStatusLabel(revision.status)}
                              tone={reviewStatusTone(revision.status)}
                            />
                          </div>
                          {revision.reviewerComment && (
                            <p className="mt-2 text-sm whitespace-pre-wrap">
                              {revision.reviewerComment}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            Issued {whenTime(revision.createdAt)}
                            {revision.reviewedAt
                              ? ` · reviewed ${whenTime(revision.reviewedAt)} by ${
                                  revision.reviewedBy?.fullName ??
                                  revision.reviewedBy?.username ??
                                  "somebody"
                                }`
                              : ""}
                          </p>
                        </li>
                      ))}
                    </ul>

                    {current && isAwaitingAnswer(current.status) ? (
                      <form
                        action={(formData) =>
                          start(async () => {
                            const result = await reviewRevision(
                              projectId,
                              submittal.id,
                              current.id,
                              formData,
                            );
                            if (result.error) {
                              toast.error(result.error);
                              return;
                            }
                            toast.success("Review recorded");
                            router.refresh();
                          })
                        }
                        className="space-y-2 rounded-xl border p-3"
                      >
                        <Field label={`Review ${revisionLabel(current.revision)}`}>
                          <select
                            name="outcome"
                            required
                            className={inputClass}
                            defaultValue=""
                          >
                            <option value="" disabled>
                              Choose an outcome
                            </option>
                            {OUTCOMES.map((entry) => (
                              <option key={entry.value} value={entry.value}>
                                {entry.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <textarea
                          name="comment"
                          maxLength={2000}
                          className={textareaClass}
                          placeholder="What the contractor has to change, if anything."
                        />
                        <button
                          type="submit"
                          disabled={pending}
                          className="flex h-8 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {pending && <Loader2 className="size-3 animate-spin" />}
                          Record the review
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const result = await resubmit(
                              projectId,
                              submittal.id,
                            );
                            if (result.error) {
                              toast.error(result.error);
                              return;
                            }
                            toast.success("Next revision issued");
                            router.refresh();
                          })
                        }
                        className="flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {pending && <Loader2 className="size-3 animate-spin" />}
                        Issue the next revision
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
