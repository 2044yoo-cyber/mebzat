"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, EyeOff, Lock, Send, X } from "lucide-react";
import { toast } from "sonner";

import { AiField } from "@/components/ai/writing/ai-field";
import { createJob, publishJob, updateJob } from "@/app/jobs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXPERIENCE_LEVEL,
  JOB_TYPE,
  WORK_MODE,
} from "@/lib/constants/community";
import {
  JOB_CATEGORIES,
  JOB_CATEGORY_GROUPS,
  SALARY_PERIODS,
} from "@/lib/constants/jobs";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "@/lib/validations/job";
import type {
  ExperienceLevel,
  Job,
  JobType,
  WorkMode,
} from "@/types/database.types";

/**
 * Posts a job, or edits one.
 *
 * One form for both, because a job being edited is the same job with different
 * words in it, and two forms would be two places for the salary rules to
 * disagree. What changes between the modes is only which buttons appear at the
 * bottom.
 *
 * Nothing here is a construction-industry assumption dressed as a default. The
 * currency starts at ETB and the country at Ethiopia because that is where the
 * platform operates; every one of them is editable.
 */

export type JobFormProps = {
  /** Absent for a new job. */
  job?: Job | null;
  companies: { id: string; name: string; slug: string }[];
  defaultCity?: string | null;
};

function initialValues(job: Job | null | undefined, city: string | null): JobFormValues {
  return {
    title: job?.title ?? "",
    category: job?.category ?? "",
    description: job?.description ?? "",
    responsibilities: job?.responsibilities ?? "",
    requirements: job?.requirements ?? "",
    jobType: job?.job_type ?? "full_time",
    workMode: job?.work_mode ?? "on_site",
    experienceLevel: job?.experience_level ?? "mid",
    profession: job?.profession ?? "",
    skills: job?.skills ?? [],
    city: job?.location_city ?? city ?? "",
    country: job?.location_country ?? "Ethiopia",
    salaryMin: job?.salary_min ?? null,
    salaryMax: job?.salary_max ?? null,
    currency: job?.currency ?? "ETB",
    salaryPeriod: job?.salary_period ?? "month",
    salaryVisible: job?.salary_visible ?? true,
    openings: job?.openings ?? 1,
    closesOn: job?.closes_on ?? "",
    visibility: job?.visibility ?? "public",
    companyId: job?.company_id ?? null,
  };
}

export function JobForm({ job, companies, defaultCity }: JobFormProps) {
  const router = useRouter();

  const [values, setValues] = useState<JobFormValues>(() =>
    initialValues(job, defaultCity ?? null),
  );
  const [skillDraft, setSkillDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isDraft = !job || job.status === "draft";
  const today = new Date().toISOString().slice(0, 10);

  function set<K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function addSkill() {
    const skill = skillDraft.trim().slice(0, 40);
    if (!skill) return;
    if (values.skills.includes(skill)) {
      setSkillDraft("");
      return;
    }
    if (values.skills.length >= 20) {
      setError("Twenty skills is plenty.");
      return;
    }
    set("skills", [...values.skills, skill]);
    setSkillDraft("");
  }

  function numberOrNull(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** Save, then publish if asked. Both paths land somewhere sensible. */
  function save(publish: boolean) {
    setError(null);

    startTransition(async () => {
      if (job) {
        const result = await updateJob(job.id, values);
        if (result.error) {
          setError(result.error);
          return;
        }

        if (publish && job.status === "draft") {
          const published = await publishJob(job.id);
          if (published.error) {
            setError(published.error);
            return;
          }
          toast.success("Job published");
        } else {
          toast.success("Changes saved");
        }

        router.push(`/jobs/${job.id}`);
        router.refresh();
        return;
      }

      const result = await createJob(values, { publish });
      if (result.error) {
        setError(result.error);
        return;
      }

      toast.success(publish ? "Job published" : "Draft saved");
      // A published job goes to its own page; a draft goes back to editing,
      // which is where the attachments live and where publishing happens.
      router.push(
        publish ? `/jobs/${result.id}` : `/jobs/${result.id}/edit`,
      );
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(true);
      }}
      className="space-y-6"
    >
      <Section title="The role">
        <Field label="Job title" htmlFor="j-title">
          <Input
            id="j-title"
            required
            maxLength={160}
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="e.g. Site Engineer for a G+8 residential build"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="j-category">
            <select
              id="j-category"
              required
              value={values.category}
              onChange={(event) => set("category", event.target.value)}
              className="h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm"
            >
              <option value="">Choose a category…</option>
              {JOB_CATEGORY_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {JOB_CATEGORIES.filter(
                    (category) => category.group === group,
                  ).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="Job title in the trade" htmlFor="j-profession">
            <Input
              id="j-profession"
              maxLength={120}
              value={values.profession}
              onChange={(event) => set("profession", event.target.value)}
              placeholder="Optional — e.g. Formwork Foreman"
            />
          </Field>
        </div>

        <Field label="Describe the work" htmlFor="j-description">
          <AiField
            id="j-description"
            required
            surface="job"
            context={values.title}
            value={values.description}
            maxLength={8000}
            onValueChange={(next) => set("description", next)}
            placeholder="The project, the team, what the person will actually be doing day to day."
            className="min-h-32"
          />
        </Field>

        <Field label="Responsibilities" htmlFor="j-responsibilities">
          <AiField
            id="j-responsibilities"
            surface="job"
            context={values.title}
            value={values.responsibilities ?? ""}
            maxLength={4000}
            onValueChange={(next) => set("responsibilities", next)}
            placeholder="Optional. One per line reads best."
            className="min-h-24"
          />
        </Field>

        <Field label="Requirements" htmlFor="j-requirements">
          <AiField
            id="j-requirements"
            surface="job"
            context={values.title}
            value={values.requirements ?? ""}
            maxLength={4000}
            onValueChange={(next) => set("requirements", next)}
            placeholder="Optional. Qualifications, licences, years on site."
            className="min-h-24"
          />
        </Field>
      </Section>

      <Section title="Who you are looking for">
        <ChipRow
          label="Contract"
          entries={JOB_TYPE}
          value={values.jobType}
          onSelect={(next) => set("jobType", next as JobType)}
        />
        <ChipRow
          label="Work mode"
          entries={WORK_MODE}
          value={values.workMode}
          onSelect={(next) => set("workMode", next as WorkMode)}
        />
        <ChipRow
          label="Experience"
          entries={EXPERIENCE_LEVEL}
          value={values.experienceLevel}
          onSelect={(next) => set("experienceLevel", next as ExperienceLevel)}
        />

        <div className="space-y-1.5">
          <Label htmlFor="j-skill">Skills</Label>
          <div className="flex gap-2">
            <Input
              id="j-skill"
              value={skillDraft}
              maxLength={40}
              onChange={(event) => setSkillDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter inside a form submits it. Here it means "add this
                // skill", and publishing a job because somebody finished
                // typing "AutoCAD" would be a bad surprise.
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addSkill();
                }
              }}
              placeholder="AutoCAD, rebar detailing, ES EN codes…"
            />
            <Button type="button" variant="outline" onClick={addSkill}>
              Add
            </Button>
          </div>
          {values.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {values.skills.map((skill) => (
                <span
                  key={skill}
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm"
                >
                  {skill}
                  <button
                    type="button"
                    aria-label={`Remove ${skill}`}
                    onClick={() =>
                      set(
                        "skills",
                        values.skills.filter((entry) => entry !== skill),
                      )
                    }
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Where and when">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City" htmlFor="j-city">
            <Input
              id="j-city"
              value={values.city}
              onChange={(event) => set("city", event.target.value)}
              placeholder={
                values.workMode === "remote" ? "Optional for remote" : "Addis Ababa, Adama, Hawassa…"
              }
            />
          </Field>
          <Field label="Country" htmlFor="j-country">
            <Input
              id="j-country"
              value={values.country}
              onChange={(event) => set("country", event.target.value)}
            />
          </Field>
          <Field label="Openings" htmlFor="j-openings">
            <Input
              id="j-openings"
              type="number"
              min={1}
              max={500}
              value={values.openings}
              onChange={(event) =>
                set("openings", Math.max(1, Number(event.target.value) || 1))
              }
            />
          </Field>
          <Field label="Applications close" htmlFor="j-closes">
            <Input
              id="j-closes"
              type="date"
              min={today}
              value={values.closesOn ?? ""}
              onChange={(event) => set("closesOn", event.target.value)}
            />
          </Field>
        </div>

        {values.openings > 1 && (
          <p className="text-sm text-muted-foreground">
            The posting stays open until {values.openings} people have been
            hired, then closes itself.
          </p>
        )}
      </Section>

      <Section title="Pay">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="From" htmlFor="j-salary-min">
            <Input
              id="j-salary-min"
              type="number"
              min={0}
              step="any"
              value={values.salaryMin ?? ""}
              onChange={(event) =>
                set("salaryMin", numberOrNull(event.target.value))
              }
            />
          </Field>
          <Field label="To" htmlFor="j-salary-max">
            <Input
              id="j-salary-max"
              type="number"
              min={0}
              step="any"
              value={values.salaryMax ?? ""}
              onChange={(event) =>
                set("salaryMax", numberOrNull(event.target.value))
              }
            />
          </Field>
          <Field label="Currency" htmlFor="j-currency">
            <Input
              id="j-currency"
              maxLength={8}
              value={values.currency}
              onChange={(event) => set("currency", event.target.value)}
            />
          </Field>
          <Field label="Period" htmlFor="j-period">
            <select
              id="j-period"
              value={values.salaryPeriod}
              onChange={(event) => set("salaryPeriod", event.target.value)}
              className="h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm"
            >
              {SALARY_PERIODS.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {values.salaryPeriod === "project" && (
          <p className="text-sm text-muted-foreground">
            A fixed fee for the whole job. Put the same figure in both boxes if
            it is not a range.
          </p>
        )}

        <button
          type="button"
          onClick={() => set("salaryVisible", !values.salaryVisible)}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {values.salaryVisible ? (
            <Eye className="size-4" />
          ) : (
            <EyeOff className="size-4" />
          )}
          {values.salaryVisible
            ? "Shown on the posting"
            : "Hidden — applicants see “Not disclosed”"}
        </button>
      </Section>

      <Section title="Who can see it">
        <div className="grid gap-2 sm:grid-cols-2">
          <VisibilityCard
            active={values.visibility === "public"}
            onSelect={() => set("visibility", "public")}
            icon={<Eye className="size-4" />}
            title="Public"
            hint="Listed on Medosha, in search and on your profile."
          />
          <VisibilityCard
            active={values.visibility === "private"}
            onSelect={() => set("visibility", "private")}
            icon={<Lock className="size-4" />}
            title="Private"
            hint="Reachable only by the link. Never listed, never searchable."
          />
        </div>

        {companies.length > 0 && (
          <Field label="Post as" htmlFor="j-company">
            <select
              id="j-company"
              value={values.companyId ?? ""}
              onChange={(event) =>
                set("companyId", event.target.value || null)
              }
              className="h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm"
            >
              <option value="">Yourself</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          <Send className="size-4" />
          {pending
            ? "Saving…"
            : isDraft
              ? "Publish job"
              : "Save changes"}
        </Button>

        {isDraft && (
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={pending}
            onClick={() => save(false)}
          >
            Save as draft
          </Button>
        )}

        <Button
          type="button"
          size="lg"
          variant="ghost"
          onClick={() => router.push(job ? `/jobs/${job.id}` : "/jobs")}
        >
          Cancel
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        A draft is only visible to you. Nothing is sent to anyone until you
        publish.
      </p>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ChipRow({
  label,
  entries,
  value,
  onSelect,
}: {
  label: string;
  entries: Record<string, string>;
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(entries).map(([id, entryLabel]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onSelect(id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              value === id
                ? "border-brand bg-brand text-brand-foreground"
                : "hover:border-brand hover:bg-brand/5",
            )}
          >
            {entryLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function VisibilityCard({
  active,
  onSelect,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        active ? "border-brand bg-brand/5" : "hover:border-brand/50",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        {icon}
        {title}
      </span>
      <span className="mt-1 block text-sm text-muted-foreground">{hint}</span>
    </button>
  );
}
