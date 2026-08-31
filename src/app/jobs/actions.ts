"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { JOB_FILES_BUCKET } from "@/lib/constants/jobs";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { jobFormSchema, type JobFormValues } from "@/lib/validations/job";
import type { ApplicationStatus, JobFileKind } from "@/types/database.types";

/**
 * Everything a person does to a job.
 *
 * The writes that touch only the actor's own rows go straight to the table and
 * are stopped by row-level security if they should not happen. The five that
 * reach another person — applying, moving somebody through the pipeline,
 * withdrawing, arranging an interview, hiring — go through the security
 * definer functions in 0034, because each of them writes a notification and
 * `notifications` has no insert policy for clients. That is not a workaround;
 * it is the only place those inserts are allowed to happen.
 *
 * Every function returns a message rather than throwing. A form that loses
 * what somebody typed because the server threw is a form people stop using.
 */

export type JobResultMessage = {
  error?: string;
  ok?: boolean;
  /** Set by the actions that create something the caller has to navigate to. */
  id?: string;
  saved?: boolean;
};

async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}

/**
 * What went wrong, in the applicant's language.
 *
 * The functions in 0034 raise with SQLSTATEs chosen to be readable: 28000 for
 * "not signed in", P0002 for "no such row, or not yours", 22023 for "that is
 * not a thing you may do". A raw PostgreSQL message is never shown — it names
 * tables and columns, and a member reading "duplicate key value violates
 * unique constraint" learns nothing they can act on.
 */
function rpcMessage(error: { code?: string; message?: string } | null): string {
  if (!error) return "Something went wrong. Try again.";

  switch (error.code) {
    case "28000":
      return "Sign in first.";
    case "P0002":
      return "That is no longer available.";
    case "22023":
      // These are the deliberate refusals — applying to your own job, hiring a
      // withdrawn applicant — and the function's own wording is the clearest
      // there is, so it is passed through when it is one of ours.
      return error.message?.replace(/^.*?:\s*/, "") ?? "That is not allowed.";
    default:
      return "Something went wrong. Try again.";
  }
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

/** A slug that is unique without a round trip per attempt. */
function jobSlug(title: string): string {
  const base = slugify(title) || "job";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

function toRow(values: JobFormValues) {
  return {
    title: values.title,
    description: values.description,
    responsibilities: values.responsibilities || null,
    requirements: values.requirements || null,
    job_type: values.jobType,
    work_mode: values.workMode,
    experience_level: values.experienceLevel,
    profession: values.profession || null,
    category: values.category,
    skills: values.skills,
    salary_min: values.salaryMin,
    salary_max: values.salaryMax,
    currency: values.currency,
    salary_period: values.salaryPeriod,
    salary_visible: values.salaryVisible,
    location_city: values.city || null,
    location_country: values.country || "Ethiopia",
    openings: values.openings,
    closes_on: values.closesOn || null,
    visibility: values.visibility,
    company_id: values.companyId ?? null,
  };
}

/**
 * Creates a job.
 *
 * Drafts and published jobs are the same row with a different status, so
 * "Save draft" and "Publish" are this function with a flag rather than two
 * paths that can drift apart. A draft is validated too — a draft that cannot
 * be published is a trap somebody discovers later.
 */
export async function createJob(
  values: JobFormValues,
  options: { publish?: boolean } = {},
): Promise<JobResultMessage> {
  const { supabase, user } = await requireUser("/jobs/new");

  const parsed = jobFormSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      ...toRow(parsed.data),
      poster_id: user.id,
      slug: jobSlug(parsed.data.title),
      status: options.publish ? "open" : "draft",
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not save that job." };

  revalidatePath("/jobs");
  revalidatePath("/jobs/manage");
  return { ok: true, id: data.id };
}

export async function updateJob(
  jobId: string,
  values: JobFormValues,
): Promise<JobResultMessage> {
  const { supabase } = await requireUser(`/jobs/${jobId}/edit`);

  const parsed = jobFormSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  // No poster_id filter: the update policy from 0012 is what decides this, and
  // repeating it here would be a second copy of the rule.
  const { error } = await supabase
    .from("jobs")
    .update(toRow(parsed.data))
    .eq("id", jobId);

  if (error) return { error: "Could not save those changes." };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs/manage");
  return { ok: true, id: jobId };
}

/** Draft → open. The moment the job becomes visible to everyone. */
export async function publishJob(jobId: string): Promise<JobResultMessage> {
  const { supabase } = await requireUser("/jobs/manage");

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) return { error: "That job no longer exists." };

  // A draft skipped the full check when it was saved. It cannot skip it now.
  const parsed = jobFormSchema.safeParse({
    title: job.title,
    category: job.category ?? "",
    description: job.description,
    responsibilities: job.responsibilities ?? "",
    requirements: job.requirements ?? "",
    jobType: job.job_type,
    workMode: job.work_mode,
    experienceLevel: job.experience_level,
    profession: job.profession ?? "",
    skills: job.skills,
    city: job.location_city ?? "",
    country: job.location_country,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    currency: job.currency,
    salaryPeriod: job.salary_period,
    salaryVisible: job.salary_visible,
    openings: job.openings,
    closesOn: job.closes_on ?? "",
    visibility: job.visibility,
    companyId: job.company_id,
  });

  if (!parsed.success) {
    return {
      error: `Not ready to publish: ${parsed.error.issues[0]?.message ?? "check the form"}.`,
    };
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "open" })
    .eq("id", jobId);

  if (error) return { error: "Could not publish that job." };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs/manage");
  return { ok: true, id: jobId };
}

export async function setJobStatus(
  jobId: string,
  status: "open" | "closed" | "filled" | "draft",
): Promise<JobResultMessage> {
  const { supabase } = await requireUser("/jobs/manage");

  const { error } = await supabase
    .from("jobs")
    .update({ status })
    .eq("id", jobId);

  if (error) return { error: "Could not change that." };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs/manage");
  return { ok: true };
}

/**
 * Deletes a job.
 *
 * Only a draft. Once a job has been published people have applied to it, and
 * deleting it would take their applications with it — a member should not
 * discover that the role they were shortlisted for has vanished from their
 * list. A published job is closed instead, which is what closing is for.
 */
export async function deleteJob(jobId: string): Promise<JobResultMessage> {
  const { supabase } = await requireUser("/jobs/manage");

  const { data: job } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) return { error: "That job no longer exists." };
  if (job.status !== "draft") {
    return { error: "Published jobs are closed rather than deleted." };
  }

  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) return { error: "Could not delete that draft." };

  revalidatePath("/jobs/manage");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * Records a file that the browser has already uploaded to storage.
 *
 * The upload itself happens from the client straight to Supabase Storage, so a
 * 20 MB drawing never passes through the server action and its body limit.
 * This is the row that makes it visible, and the storage path is checked
 * against the job so a poster cannot attach somebody else's file.
 */
export async function attachJobFile(
  jobId: string,
  file: { path: string; name: string; kind: JobFileKind; sizeBytes: number },
): Promise<JobResultMessage> {
  const { supabase } = await requireUser(`/jobs/${jobId}/edit`);

  if (!file.path.startsWith(`${jobId}/`)) {
    return { error: "That file does not belong to this job." };
  }

  const { count } = await supabase
    .from("job_attachments")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  const { data, error } = await supabase
    .from("job_attachments")
    .insert({
      job_id: jobId,
      url: file.path,
      name: file.name.slice(0, 200),
      kind: file.kind,
      size_bytes: file.sizeBytes,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not attach that file." };

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, id: data.id };
}

export async function removeJobFile(
  attachmentId: string,
): Promise<JobResultMessage> {
  const { supabase } = await requireUser("/jobs/manage");

  const { data: attachment } = await supabase
    .from("job_attachments")
    .select("id, job_id, url")
    .eq("id", attachmentId)
    .maybeSingle();

  if (!attachment) return { error: "That file is already gone." };

  const { error } = await supabase
    .from("job_attachments")
    .delete()
    .eq("id", attachmentId);

  if (error) return { error: "Could not remove that file." };

  // The row is the record; the object is the bytes. Removing the row first
  // means a failed storage delete leaves an orphan nobody can see, which is
  // better than a visible row pointing at nothing.
  await supabase.storage.from(JOB_FILES_BUCKET).remove([attachment.url]);

  revalidatePath(`/jobs/${attachment.job_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

export type ApplyInput = {
  coverLetter?: string;
  proposal?: string;
  cvUrl?: string;
  portfolioUrl?: string;
  expectedSalary?: number | null;
  availableFrom?: string | null;
  availabilityNote?: string;
};

export async function applyToJob(
  jobId: string,
  input: ApplyInput,
): Promise<JobResultMessage> {
  const { supabase } = await requireUser(`/jobs/${jobId}`);

  for (const url of [input.cvUrl, input.portfolioUrl]) {
    if (url && !/^https?:\/\//i.test(url)) {
      return { error: "Links must start with http:// or https://" };
    }
  }

  const salary = input.expectedSalary ?? null;
  if (salary !== null && (!Number.isFinite(salary) || salary < 0)) {
    return { error: "Enter a valid figure, or leave it blank." };
  }

  const { data, error } = await supabase.rpc("job_apply", {
    p_job: jobId,
    p_cover_letter: input.coverLetter?.slice(0, 5000) || null,
    p_proposal: input.proposal?.slice(0, 5000) || null,
    p_cv_url: input.cvUrl || null,
    p_portfolio_url: input.portfolioUrl || null,
    p_expected: salary,
    p_available_from: input.availableFrom || null,
    p_availability_note: input.availabilityNote?.slice(0, 200) || null,
  });

  if (error) return { error: rpcMessage(error) };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs/applications");
  return { ok: true, id: data ?? undefined };
}

export async function withdrawApplication(
  applicationId: string,
): Promise<JobResultMessage> {
  const { supabase } = await requireUser("/jobs/applications");

  const { error } = await supabase.rpc("job_withdraw_application", {
    p_application: applicationId,
  });

  if (error) return { error: rpcMessage(error) };

  revalidatePath("/jobs");
  revalidatePath("/jobs/applications");
  return { ok: true };
}

/**
 * Records a file the applicant uploaded with their application.
 *
 * Same shape as `attachJobFile`, and the same reason: the bytes go straight to
 * storage from the browser. The path is under the job's folder because that is
 * what the storage policy reads, and the row is what ties it to the person.
 */
export async function attachApplicationFile(
  applicationId: string,
  file: { path: string; name: string; kind: JobFileKind; sizeBytes: number },
): Promise<JobResultMessage> {
  const { supabase } = await requireUser("/jobs/applications");

  const { data: application } = await supabase
    .from("job_applications")
    .select("id, job_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) return { error: "That application no longer exists." };
  if (!file.path.startsWith(`${application.job_id}/`)) {
    return { error: "That file does not belong to this application." };
  }

  const { count } = await supabase
    .from("job_application_attachments")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId);

  const { error } = await supabase
    .from("job_application_attachments")
    .insert({
      application_id: applicationId,
      url: file.path,
      name: file.name.slice(0, 200),
      kind: file.kind,
      size_bytes: file.sizeBytes,
      position: count ?? 0,
    });

  if (error) return { error: "Could not attach that file." };

  revalidatePath(`/jobs/${application.job_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The employer's side of an application
// ---------------------------------------------------------------------------

export async function setApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
): Promise<JobResultMessage> {
  const { supabase } = await requireUser("/jobs/manage");

  const { error } = await supabase.rpc("job_set_application_status", {
    p_application: applicationId,
    p_status: status,
  });

  if (error) return { error: rpcMessage(error) };

  revalidatePath("/jobs/manage");
  return { ok: true };
}

export async function scheduleInterview(
  applicationId: string,
  input: {
    scheduledAt?: string | null;
    mode?: string;
    location?: string;
    note?: string;
  },
): Promise<JobResultMessage> {
  const { supabase } = await requireUser("/jobs/manage");

  if (input.scheduledAt && Number.isNaN(Date.parse(input.scheduledAt))) {
    return { error: "That is not a date and time." };
  }

  const { data, error } = await supabase.rpc("job_schedule_interview", {
    p_application: applicationId,
    p_scheduled_at: input.scheduledAt || null,
    p_mode: input.mode?.slice(0, 80) || null,
    p_location: input.location?.slice(0, 200) || null,
    p_note: input.note?.slice(0, 1000) || null,
  });

  if (error) return { error: rpcMessage(error) };

  revalidatePath("/jobs/manage");
  return { ok: true, id: data ?? undefined };
}

/**
 * Hires an applicant.
 *
 * One call does all of it: the agreement, the application status, the job's
 * remaining openings, the conversation between the two of them and the
 * notification. That is deliberate — it is one transaction in `job_hire`, so a
 * hire cannot half-happen.
 */
export async function hireApplicant(
  applicationId: string,
  input: {
    amount?: number | null;
    currency?: string;
    period?: string;
    startsOn?: string | null;
    note?: string;
  } = {},
): Promise<JobResultMessage> {
  const { supabase } = await requireUser("/jobs/manage");

  const amount = input.amount ?? null;
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return { error: "Enter a valid figure, or leave it blank." };
  }

  const { data, error } = await supabase.rpc("job_hire", {
    p_application: applicationId,
    p_amount: amount,
    p_currency: input.currency || null,
    p_period: input.period || null,
    p_starts_on: input.startsOn || null,
    p_note: input.note?.slice(0, 1000) || null,
  });

  if (error) return { error: rpcMessage(error) };

  revalidatePath("/jobs/manage");
  revalidatePath("/messages");
  return { ok: true, id: data ?? undefined };
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export async function toggleSavedJob(
  jobId: string,
): Promise<JobResultMessage> {
  const { supabase } = await requireUser(`/jobs/${jobId}`);

  const { data, error } = await supabase.rpc("job_toggle_saved", {
    p_job: jobId,
  });

  if (error) return { error: rpcMessage(error) };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs/saved");
  return { ok: true, saved: data === true };
}
