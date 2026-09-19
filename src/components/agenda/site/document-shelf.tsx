"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, FileStack, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  textareaClass,
  usePanel,
  whenTime,
} from "@/components/agenda/shared";
import { FileDrop } from "@/components/agenda/site/file-drop";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import { FILE_KIND_LABEL, type FileKind } from "@/lib/agenda/constants";
import type { ProjectDocument } from "@/lib/data/agenda-site";
import { fileDocument } from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";
import { cn } from "@/lib/utils";

type Uploaded = { path: string; name: string; type: string; size: number };

/**
 * How confidential a document is, in the words 0024 already chose.
 *
 * Three levels, not four. `finance` and `meetings` map onto the per-member
 * permissions that already exist, so filing a contract as `finance` keeps it
 * off the screen of everybody on site without inventing a second permission
 * system to maintain.
 */
const LEVELS = [
  { value: "members", label: "Everybody on the project" },
  { value: "finance", label: "Only those who see the money" },
  { value: "meetings", label: "Only those who see the meetings" },
] as const;

/**
 * The document shelf.
 *
 * A document not on this list is one the reader is not entitled to — 0090
 * replaced the read policy rather than adding one, so confidential filings are
 * gated a second time. There is no "you may not see this" row, because a row
 * saying a contract exists is itself the leak.
 */
export function DocumentShelf({
  projectId,
  documents,
  urls,
}: {
  projectId: string;
  documents: ProjectDocument[];
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
        title="Documents"
        count={documents.length}
        action="File a document"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <div className="space-y-3 rounded-2xl border p-4">
          {!staged ? (
            <>
              <p className="text-sm text-muted-foreground">
                Upload the file first. Nothing is recorded until it is in the
                project&rsquo;s store.
              </p>
              <FileDrop
                projectId={projectId}
                folder="documents"
                label="Choose the file"
                onUploaded={setStaged}
              />
            </>
          ) : (
            <form
              action={(formData) =>
                start(async () => {
                  const result = await fileDocument(
                    projectId,
                    staged.path,
                    formData,
                  );
                  if (result.error) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Filed");
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

              <Field label="Which document">
                <select
                  name="documentId"
                  value={against}
                  onChange={(event) => setAgainst(event.target.value)}
                  className={inputClass}
                >
                  <option value="">A new document</option>
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </select>
              </Field>

              {against === "" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title">
                    <input
                      name="title"
                      maxLength={200}
                      className={inputClass}
                      placeholder="Main contract, signed"
                    />
                  </Field>
                  <Field label="Who may read it">
                    <select
                      name="confidentiality"
                      className={inputClass}
                      defaultValue="members"
                    >
                      {LEVELS.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              <Field label="What this version is">
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
                  File it
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

      {documents.length === 0 ? (
        <Empty>Nothing has been filed on this project yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {documents.map((document) => {
            const expanded = open === document.id;
            const current =
              document.versions.find(
                (version) => version.id === document.currentVersionId,
              ) ?? document.versions[0];

            return (
              <li key={document.id} className="rounded-2xl border">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : document.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <FileStack className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium">{document.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        FILE_KIND_LABEL[document.kind as FileKind] ??
                          document.kind,
                        `${document.versions.length} version${document.versions.length === 1 ? "" : "s"}`,
                        current ? whenTime(current.createdAt) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {document.confidentiality !== "members" && (
                    <StatusChip
                      label={
                        document.confidentiality === "finance"
                          ? "Finance only"
                          : "Meetings only"
                      }
                      tone="warning"
                    />
                  )}
                </button>

                {expanded && (
                  <ul className="space-y-1.5 border-t p-4">
                    {document.versions.map((version) => (
                      <li
                        key={version.id}
                        className={cn(
                          "flex flex-wrap items-center gap-2 rounded-xl border p-3",
                          version.id === document.currentVersionId &&
                            "border-brand/40 bg-brand/5",
                        )}
                      >
                        <span className="font-mono text-xs">
                          v{version.version}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            {version.fileName ?? "File"}
                          </p>
                          {version.notes && (
                            <p className="truncate text-xs text-muted-foreground">
                              {version.notes}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {[
                              whenTime(version.createdAt),
                              version.uploadedBy?.fullName ??
                                version.uploadedBy?.username,
                              version.id === document.currentVersionId
                                ? "current"
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        {urls[version.storagePath] ? (
                          <a
                            href={urls[version.storagePath]}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                          >
                            <Download className="size-3" />
                            Open
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="size-3" />
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
