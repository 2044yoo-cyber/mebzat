"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileText, Loader2 } from "lucide-react";
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
import { StatusChip } from "@/components/agenda/shell/status-chip";
import { reviewStatusLabel, reviewStatusTone } from "@/lib/agenda/records";
import type { FormField } from "@/lib/agenda/quality";
import type { FormSubmission, FormTemplate } from "@/lib/data/agenda-site";
import {
  saveFormTemplate,
  submitForm,
} from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";

/**
 * Forms: permits, site instructions, method statements, handovers.
 *
 * A company defines its own, which is why `fields` is jsonb and why the
 * template is written as one question per line — the people who write a
 * permit-to-dig are writing it on a phone on site, and a drag-and-drop builder
 * that takes eleven taps per question is one nobody finishes.
 */
export function FormRunner({
  projectId,
  templates,
  submissions,
}: {
  projectId: string;
  templates: FormTemplate[];
  submissions: FormSubmission[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [filling, setFilling] = useState<FormTemplate | null>(null);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Forms"
        count={templates.length}
        action="New form"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await saveFormTemplate(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Saved");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <Field label="Name">
            <input
              name="name"
              required
              maxLength={160}
              className={inputClass}
              placeholder="Permit to dig"
            />
          </Field>

          <Field label="What it is for">
            <input
              name="description"
              maxLength={500}
              className={inputClass}
              placeholder="Raised before any excavation deeper than 300 mm."
            />
          </Field>

          <Field label="The questions, one per line">
            <textarea
              name="questions"
              required
              className={`${textareaClass} min-h-40 font-mono text-xs`}
              placeholder={
                "Permit number*\nServices checked [yes/no]\nDepth in metres [number]\nDate of dig [date]\nMethod [hand dig | machine | both]\nWhat was found [long]"
              }
            />
          </Field>

          <p className="text-xs text-muted-foreground">
            A trailing <code>*</code> makes an answer compulsory. A trailing
            bracket says what kind of answer it takes — <code>[number]</code>,{" "}
            <code>[date]</code>, <code>[yes/no]</code>, <code>[long]</code>, or
            a list separated by <code>|</code>. Anything else is a short answer.
          </p>

          <Field label="Where this form lives">
            <select name="scope" className={inputClass} defaultValue="project">
              <option value="project">This project only</option>
              <option value="everywhere">Every project of mine</option>
            </select>
          </Field>

          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save it
          </button>
        </form>
      )}

      {templates.length === 0 ? (
        <Empty>
          No forms yet. A permit, a site instruction or a handover sheet starts
          here.
        </Empty>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates.map((template) => (
            <li key={template.id} className="rounded-2xl border p-4">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{template.name}</p>
                  {template.description && (
                    <p className="text-xs text-muted-foreground">
                      {template.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {template.fields.length} question
                    {template.fields.length === 1 ? "" : "s"}
                    {template.projectId === null ? " · reused everywhere" : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFilling(template)}
                className="mt-3 h-8 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
              >
                Fill it in
              </button>
            </li>
          ))}
        </ul>
      )}

      {filling && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await submitForm(
                projectId,
                filling.id,
                filling.fields,
                formData,
              );
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Submitted");
              setFilling(null);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <h3 className="text-sm font-medium">{filling.name}</h3>
          {filling.fields.map((field) => (
            <Answer key={field.id} field={field} />
          ))}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Submit
            </button>
            <button
              type="button"
              onClick={() => setFilling(null)}
              className="h-9 rounded-xl border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          Submitted
          <span className="ml-1.5 font-normal text-muted-foreground">
            {submissions.length}
          </span>
        </h3>
        {submissions.length === 0 ? (
          <Empty>Nothing has been submitted on this project yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {submissions.map((submission) => (
              <li
                key={submission.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl border p-3"
              >
                {submission.number && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {submission.number}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {submission.templateName ?? "Form"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {submission.submittedBy?.fullName ??
                    submission.submittedBy?.username ??
                    "Somebody"}
                  {" · "}
                  {whenTime(submission.submittedAt ?? submission.createdAt)}
                </span>
                <StatusChip
                  label={reviewStatusLabel(submission.status)}
                  tone={reviewStatusTone(submission.status)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One question, drawn the way its kind asks to be drawn. */
function Answer({ field }: { field: FormField }) {
  const name = `field.${field.id}`;
  const label = field.required ? `${field.label} *` : field.label;

  if (field.kind === "yes_no") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={name} className="size-4 rounded border" />
        {label}
      </label>
    );
  }

  if (field.kind === "long_text") {
    return (
      <Field label={label}>
        <textarea name={name} maxLength={2000} className={textareaClass} />
      </Field>
    );
  }

  if (field.kind === "choice") {
    return (
      <Field label={label}>
        <select name={name} className={inputClass} defaultValue="">
          <option value="">Choose</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  return (
    <Field label={label}>
      <input
        name={name}
        type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
        inputMode={field.kind === "number" ? "decimal" : undefined}
        maxLength={field.kind === "number" ? undefined : 2000}
        className={inputClass}
      />
    </Field>
  );
}
