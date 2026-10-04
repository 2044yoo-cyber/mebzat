"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClipboardList, Loader2, TriangleAlert } from "lucide-react";
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
import { DISCIPLINES, disciplineLabel } from "@/lib/agenda/records";
import {
  INSPECTION_RESULTS,
  OBSERVATION_KINDS,
  inspectionResultLabel,
  inspectionResultTone,
  rollUpInspection,
} from "@/lib/agenda/quality";
import type { Inspection, Person } from "@/lib/data/agenda-site";
import {
  bookInspection,
  raiseObservation,
  recordInspectionItem,
} from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";
import { cn } from "@/lib/utils";

/**
 * Inspections, and the checklist each one is walked against.
 *
 * The header result is derived from the items rather than typed — one failed
 * check fails the inspection — so the row cannot say "pass" while a check
 * underneath it says otherwise. Where there is no checklist the recorded
 * result stands, because an inspection can be a single judgement.
 *
 * A failed check offers to raise an observation there and then. That is the
 * first link in the chain the section exists for, and asking somebody to
 * remember to go to another screen is how the link never gets made.
 */
export function InspectionRegister({
  projectId,
  inspections,
  people,
}: {
  projectId: string;
  inspections: Inspection[];
  people: Person[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [raisingFrom, setRaisingFrom] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Inspections"
        count={inspections.length}
        action="Book an inspection"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await bookInspection(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Booked");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <Field label="What is being inspected">
            <input
              name="title"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Rebar, ground floor slab, grid C to E"
            />
          </Field>

          <Field label="The checks, one per line">
            <textarea
              name="checklist"
              className={textareaClass}
              placeholder={
                "Bar diameter as drawing\nSpacing as drawing\nCover to soffit\nLaps and anchorage\nChairs and spacers"
              }
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
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
            <Field label="Where on site">
              <input name="location" maxLength={120} className={inputClass} />
            </Field>
            <Field label="Scheduled for">
              <input type="date" name="scheduledFor" className={inputClass} />
            </Field>
            <Field label="Inspector">
              <select name="inspector" className={inputClass} defaultValue="">
                <option value="">Me</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName ?? person.username ?? "Unnamed"}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Book it
          </button>
        </form>
      )}

      {inspections.length === 0 ? (
        <Empty>No inspections have been booked on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {inspections.map((inspection) => {
            // The items decide, and the recorded result is the fallback for an
            // inspection with no checklist behind it.
            const rolled = rollUpInspection(inspection.items) ?? inspection.result;
            const expanded = open === inspection.id;
            const failed = inspection.items.filter(
              (item) => item.result === "fail",
            ).length;

            return (
              <li key={inspection.id} className="rounded-2xl border">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : inspection.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <ClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {inspection.number && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {inspection.number}
                        </span>
                      )}
                      <span className="text-sm font-medium">
                        {inspection.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        disciplineLabel(inspection.discipline),
                        inspection.location,
                        inspection.scheduledFor
                          ? `Scheduled ${when(inspection.scheduledFor)}`
                          : null,
                        inspection.items.length > 0
                          ? `${inspection.items.length} checks`
                          : null,
                        failed > 0 ? `${failed} failed` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <StatusChip
                    label={inspectionResultLabel(rolled)}
                    tone={inspectionResultTone(rolled)}
                  />
                </button>

                {expanded && (
                  <div className="space-y-3 border-t p-4">
                    {inspection.notes && (
                      <p className="text-sm whitespace-pre-wrap">
                        {inspection.notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {inspection.inspector
                        ? `Inspector: ${inspection.inspector.fullName ?? inspection.inspector.username}`
                        : "No inspector named"}
                      {inspection.inspectedAt
                        ? ` · inspected ${whenTime(inspection.inspectedAt)}`
                        : ""}
                    </p>

                    {inspection.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No checklist — this inspection is one judgement.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {inspection.items.map((item) => (
                          <li
                            key={item.id}
                            className={cn(
                              "rounded-xl border p-3",
                              item.result === "fail" &&
                                "border-destructive/40 bg-destructive/5",
                            )}
                          >
                            <p className="text-sm">{item.description}</p>
                            {item.comment && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {item.comment}
                              </p>
                            )}

                            <form
                              action={(formData) =>
                                start(async () => {
                                  const result = await recordInspectionItem(
                                    projectId,
                                    inspection.id,
                                    item.id,
                                    formData,
                                  );
                                  if (result.error) {
                                    toast.error(result.error);
                                    return;
                                  }
                                  router.refresh();
                                })
                              }
                              className="mt-2 flex flex-wrap items-center gap-2"
                            >
                              <select
                                name="result"
                                defaultValue={item.result}
                                className="h-8 rounded-lg border bg-transparent px-2 text-xs"
                                aria-label={`Result for ${item.description}`}
                              >
                                {INSPECTION_RESULTS.map((entry) => (
                                  <option key={entry.value} value={entry.value}>
                                    {entry.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                name="comment"
                                defaultValue={item.comment ?? ""}
                                maxLength={1000}
                                placeholder="Comment"
                                className="h-8 min-w-40 flex-1 rounded-lg border bg-transparent px-2 text-xs"
                                aria-label={`Comment on ${item.description}`}
                              />
                              <button
                                type="submit"
                                disabled={pending}
                                className="h-8 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                              >
                                Record
                              </button>
                            </form>

                            {item.result === "fail" && (
                              <div className="mt-2">
                                {raisingFrom === item.id ? (
                                  <form
                                    action={(formData) =>
                                      start(async () => {
                                        const result = await raiseObservation(
                                          projectId,
                                          formData,
                                          item.id,
                                        );
                                        if (result.error) {
                                          toast.error(result.error);
                                          return;
                                        }
                                        toast.success("Observation raised");
                                        setRaisingFrom(null);
                                        router.refresh();
                                      })
                                    }
                                    className="space-y-2 rounded-xl border p-3"
                                  >
                                    <Field label="What is wrong">
                                      <textarea
                                        name="description"
                                        required
                                        defaultValue={item.description}
                                        maxLength={2000}
                                        className={textareaClass}
                                      />
                                    </Field>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <Field label="Kind">
                                        <select
                                          name="kind"
                                          className={inputClass}
                                          defaultValue="quality"
                                        >
                                          {OBSERVATION_KINDS.map((entry) => (
                                            <option
                                              key={entry.value}
                                              value={entry.value}
                                            >
                                              {entry.label}
                                            </option>
                                          ))}
                                        </select>
                                      </Field>
                                      <Field label="Responsible">
                                        <select
                                          name="assignedTo"
                                          className={inputClass}
                                          defaultValue=""
                                        >
                                          <option value="">Nobody yet</option>
                                          {people.map((person) => (
                                            <option
                                              key={person.id}
                                              value={person.id}
                                            >
                                              {person.fullName ??
                                                person.username ??
                                                "Unnamed"}
                                            </option>
                                          ))}
                                        </select>
                                      </Field>
                                      <Field label="Put right by">
                                        <input
                                          type="date"
                                          name="dueDate"
                                          className={inputClass}
                                        />
                                      </Field>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="submit"
                                        disabled={pending}
                                        className="h-8 rounded-lg bg-brand px-3 text-xs font-medium text-brand-foreground disabled:opacity-50"
                                      >
                                        Raise it
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setRaisingFrom(null)}
                                        className="h-8 rounded-lg border px-3 text-xs font-medium"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setRaisingFrom(item.id)}
                                    className="flex h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                                  >
                                    <TriangleAlert className="size-3" />
                                    Raise an observation
                                  </button>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
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
