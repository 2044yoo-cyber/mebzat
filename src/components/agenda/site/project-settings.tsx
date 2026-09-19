"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Field, inputClass, textareaClass } from "@/components/agenda/shared";
import {
  AGENDA_PROJECT_STATUSES,
  AGENDA_PROJECT_TYPES,
} from "@/lib/agenda/projects";
import type { AgendaProjectSummary } from "@/lib/data/agenda-projects";
import {
  archiveProject,
  updateProject,
} from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";

/**
 * The project's own record.
 *
 * Only the owner and administrators may save — 0089's update policy decides
 * that, and this screen does not check it a second time. A member who is not
 * one is shown the form and told plainly when the database refuses, which is
 * better than a screen that hides the values they are entitled to read.
 *
 * Progress is reported, never derived. A percentage computed from tasks or
 * from spend is a number the site did not agree to, and the first argument
 * about it destroys trust in every other figure in Agenda.
 */
export function ProjectSettings({
  project,
}: {
  project: AgendaProjectSummary;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-sm font-medium">Project settings</h2>
        <p className="text-xs text-muted-foreground">
          Changes here are saved only for the client and administrators.
        </p>
      </header>

      <form
        action={(formData) =>
          start(async () => {
            const result = await updateProject(project.id, formData);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Saved");
            router.refresh();
          })
        }
        className="space-y-3 rounded-2xl border p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              name="name"
              required
              maxLength={160}
              defaultValue={project.name}
              className={inputClass}
            />
          </Field>
          <Field label="Project number">
            <input
              name="projectNumber"
              maxLength={40}
              defaultValue={project.projectNumber ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Kind">
            <select
              name="projectType"
              className={inputClass}
              defaultValue={project.type}
            >
              {AGENDA_PROJECT_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              name="status"
              className={inputClass}
              defaultValue={project.status}
            >
              {AGENDA_PROJECT_STATUSES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Where">
            <input
              name="location"
              maxLength={120}
              defaultValue={project.location ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Reported built (%)">
            <input
              name="progressPercent"
              inputMode="numeric"
              defaultValue={project.progressPercent}
              className={inputClass}
            />
          </Field>
        </div>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="pb-1 text-xs font-medium text-muted-foreground">
            The parties
          </legend>
          <Field label="Client">
            <input
              name="clientName"
              maxLength={200}
              defaultValue={project.clientName ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Main contractor">
            <input
              name="mainContractor"
              maxLength={200}
              defaultValue={project.mainContractor ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Consultant">
            <input name="consultant" maxLength={200} className={inputClass} />
          </Field>
          <Field label="Architect">
            <input name="architect" maxLength={200} className={inputClass} />
          </Field>
          <Field label="Structural engineer">
            <input
              name="structuralEngineer"
              maxLength={200}
              className={inputClass}
            />
          </Field>
          <Field label="MEP engineer">
            <input name="mepEngineer" maxLength={200} className={inputClass} />
          </Field>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Started">
            <input
              type="date"
              name="startDate"
              defaultValue={project.startDate ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Due">
            <input
              type="date"
              name="targetDate"
              defaultValue={project.targetCompletionDate ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Finished">
            <input type="date" name="actualDate" className={inputClass} />
          </Field>
        </div>

        <Field label="What it is">
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={project.description ?? ""}
            className={textareaClass}
          />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save
        </button>
      </form>

      <section className="space-y-2 rounded-2xl border border-dashed p-4">
        <h3 className="text-sm font-medium">Archiving</h3>
        <p className="text-xs text-muted-foreground">
          An archived project drops off the dashboard and stays readable to
          everybody on it. Nothing in Agenda is deleted, and there is no way
          to delete this — the database has no permission to.
        </p>
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await archiveProject(project.id);
                  if (result.error) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Archived");
                  router.push("/agenda/projects");
                })
              }
              className="h-9 rounded-xl bg-destructive px-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Yes, archive it
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-9 rounded-xl border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Archive className="size-3.5" />
            Archive this project
          </button>
        )}
      </section>
    </div>
  );
}
