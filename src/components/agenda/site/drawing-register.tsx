"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Loader2, PencilRuler } from "lucide-react";
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
import { FileDrop } from "@/components/agenda/site/file-drop";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import {
  DISCIPLINES,
  disciplineLabel,
  reviewStatusLabel,
  reviewStatusTone,
} from "@/lib/agenda/records";
import type { Drawing } from "@/lib/data/agenda-site";
import { issueDrawingRevision } from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";
import { cn } from "@/lib/utils";

type Uploaded = { path: string; name: string; type: string; size: number };

/**
 * The drawing register.
 *
 * A drawing is a series of files with one of them current, so the register
 * lists sheets and the sheet opens to its revisions. Nothing is ever replaced:
 * issuing Rev 03 makes Rev 03 current and leaves Rev 02 exactly where it was,
 * which is what makes "what did the contractor build to in March" answerable.
 *
 * Which revision is current is the database's decision —
 * `agenda_drawing_set_current` in 0090 — not this screen's.
 */
export function DrawingRegister({
  projectId,
  drawings,
  urls,
}: {
  projectId: string;
  drawings: Drawing[];
  /** Signed URLs by storage path. A path missing from it cannot be opened. */
  urls: Record<string, string>;
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [staged, setStaged] = useState<Uploaded | null>(null);
  const [against, setAgainst] = useState<string>("");

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Drawings"
        count={drawings.length}
        action="Issue a revision"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <div className="space-y-3 rounded-2xl border p-4">
          {!staged ? (
            <>
              <p className="text-sm text-muted-foreground">
                Upload the sheet first. Nothing is recorded until the file is
                in the project&rsquo;s store.
              </p>
              <FileDrop
                projectId={projectId}
                folder="drawings"
                label="Choose the drawing"
                onUploaded={setStaged}
              />
            </>
          ) : (
            <form
              action={(formData) =>
                start(async () => {
                  const result = await issueDrawingRevision(
                    projectId,
                    staged.path,
                    formData,
                  );
                  if (result.error) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Issued");
                  setStaged(null);
                  setAgainst("");
                  panel.setOpen(false);
                  router.refresh();
                })
              }
              className="space-y-3"
            >
              <p className="text-xs text-muted-foreground">{staged.name}</p>
              <input type="hidden" name="fileName" value={staged.name} />
              <input type="hidden" name="mimeType" value={staged.type} />

              <Field label="Which sheet">
                <select
                  name="drawingId"
                  value={against}
                  onChange={(event) => setAgainst(event.target.value)}
                  className={inputClass}
                >
                  <option value="">A new sheet</option>
                  {drawings.map((drawing) => (
                    <option key={drawing.id} value={drawing.id}>
                      {drawing.drawingNumber} — {drawing.title}
                    </option>
                  ))}
                </select>
              </Field>

              {against === "" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Sheet number">
                    <input
                      name="drawingNumber"
                      maxLength={60}
                      className={inputClass}
                      placeholder="A-102"
                    />
                  </Field>
                  <Field label="Title">
                    <input
                      name="title"
                      maxLength={200}
                      className={inputClass}
                      placeholder="First floor plan"
                    />
                  </Field>
                  <Field label="Discipline">
                    <select
                      name="discipline"
                      className={inputClass}
                      defaultValue="architectural"
                    >
                      {DISCIPLINES.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Revision">
                  <input
                    name="revision"
                    required
                    maxLength={20}
                    className={inputClass}
                    placeholder="Rev 01, Rev A, P2"
                  />
                </Field>
                <Field label="Issued on">
                  <input type="date" name="issuedOn" className={inputClass} />
                </Field>
              </div>

              <Field label="What changed">
                <textarea
                  name="notes"
                  maxLength={2000}
                  className={textareaClass}
                />
              </Field>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  Issue it
                </button>
                <button
                  type="button"
                  onClick={() => setStaged(null)}
                  className="h-9 rounded-xl border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Discard
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {drawings.length === 0 ? (
        <Empty>No drawings have been issued on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {drawings.map((drawing) => {
            const expanded = open === drawing.id;
            const current =
              drawing.revisions.find(
                (revision) => revision.id === drawing.currentRevisionId,
              ) ?? drawing.revisions[0];

            return (
              <li key={drawing.id} className="rounded-2xl border">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : drawing.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <PencilRuler className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {drawing.drawingNumber}
                      </span>
                      <span className="text-sm font-medium">
                        {drawing.title}
                      </span>
                      {current && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {current.revision}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        disciplineLabel(drawing.discipline),
                        `${drawing.revisions.length} revision${drawing.revisions.length === 1 ? "" : "s"}`,
                        current?.issuedOn
                          ? `issued ${when(current.issuedOn)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {current && (
                    <StatusChip
                      label={reviewStatusLabel(current.status)}
                      tone={reviewStatusTone(current.status)}
                    />
                  )}
                </button>

                {expanded && (
                  <ul className="space-y-1.5 border-t p-4">
                    {drawing.revisions.map((revision) => (
                      <li
                        key={revision.id}
                        className={cn(
                          "flex flex-wrap items-center gap-2 rounded-xl border p-3",
                          revision.id === drawing.currentRevisionId &&
                            "border-brand/40 bg-brand/5",
                        )}
                      >
                        <span className="font-mono text-xs">
                          {revision.revision}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            {revision.fileName ?? "Drawing"}
                          </p>
                          {revision.notes && (
                            <p className="truncate text-xs text-muted-foreground">
                              {revision.notes}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {[
                              revision.issuedOn
                                ? when(revision.issuedOn)
                                : null,
                              revision.uploadedBy?.fullName ??
                                revision.uploadedBy?.username,
                              revision.id === drawing.currentRevisionId
                                ? "current"
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        {urls[revision.storagePath] ? (
                          <a
                            href={urls[revision.storagePath]}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                          >
                            <Download className="size-3" />
                            Open
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Unavailable
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
