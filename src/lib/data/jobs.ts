import "server-only";

import { JOB_FILES_BUCKET } from "@/lib/constants/jobs";
import { createClient } from "@/lib/supabase/server";
import type {
  ApplicationStatus,
  ExperienceLevel,
  Job,
  JobApplication,
  JobAttachment,
  JobApplicationAttachment,
  JobHire,
  JobInterview,
  JobStatus,
  JobType,
  WorkMode,
} from "@/types/database.types";

/**
 * Reads for Jobs.
 *
 * Two audiences share this file and they see different things. The public list
 * is filtered here — open, public, not a draft — because a list is a query and
 * a query should ask for what it means. Everything private is filtered by
 * row-level security instead: `getMyJobs` does not check `poster_id` because
 * the policy already does, and a second check in TypeScript would be a second
 * place for the rule to be wrong.
 */

export const PAGE_SIZE = 20;

export type JobPoster = {
  id: string;
  username: string | null;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
};

export type JobCompany = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  verified: boolean;
};

export type JobRow = Job & {
  poster: JobPoster | null;
  company: JobCompany | null;
};

export type JobResult = {
  jobs: JobRow[];
  total: number;
  available: boolean;
};

const COLUMNS = `
  *,
  poster:profiles!poster_id(id, username, full_name, company_name, avatar_url),
  company:companies(id, name, slug, logo_url, verified)
`;

const APPLICANT_COLUMNS = `
  id, username, full_name, company_name, avatar_url, bio, account_type,
  location_city, location_country, years_experience, verification_status,
  work_status, next_available_on, reputation_points
`;

export type Applicant = {
  id: string;
  username: string | null;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  account_type: string | null;
  location_city: string | null;
  location_country: string | null;
  years_experience: number | null;
  verification_status: string;
  work_status: string;
  next_available_on: string | null;
  reputation_points: number;
};

/**
 * PostgREST reads `,` `(` `)` as syntax inside a filter, and `%` and `*` as
 * wildcards. A search for "M&E (mechanical)" must not become a filter the
 * server tries to parse.
 */
function sanitize(term: string): string {
  return term.replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim();
}

export type JobFilters = {
  q?: string;
  category?: string;
  jobType?: JobType;
  workMode?: WorkMode;
  level?: ExperienceLevel;
  city?: string;
  skill?: string;
  /** Only jobs whose top of range reaches this, and only where it is shown. */
  minSalary?: number;
  sort?: "recent" | "closing" | "salary";
  page?: number;
  pageSize?: number;
};

export async function getJobs(options: JobFilters = {}): Promise<JobResult> {
  const {
    q,
    category,
    jobType,
    workMode,
    level,
    city,
    skill,
    minSalary,
    sort = "recent",
    page = 1,
    pageSize = PAGE_SIZE,
  } = options;

  const supabase = await createClient();

  let builder = supabase
    .from("jobs")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "open")
    // A private job is reachable by its link, never by a list. The policy in
    // 0033 says the same thing; this says it again so the count is right.
    .eq("visibility", "public");

  const term = q ? sanitize(q) : "";
  if (term) {
    builder = builder.or(
      `title.ilike.%${term}%,profession.ilike.%${term}%,description.ilike.%${term}%`,
    );
  }
  if (category) builder = builder.eq("category", category);
  if (jobType) builder = builder.eq("job_type", jobType);
  if (workMode) builder = builder.eq("work_mode", workMode);
  if (level) builder = builder.eq("experience_level", level);
  if (city) builder = builder.eq("location_city", city);
  if (skill) builder = builder.contains("skills", [skill]);
  if (minSalary !== undefined && Number.isFinite(minSalary)) {
    // A job that hides its salary cannot answer "pays at least this", so it is
    // excluded rather than assumed to qualify.
    builder = builder.eq("salary_visible", true).gte("salary_max", minSalary);
  }

  if (sort === "closing") {
    // Jobs with no closing date are not "never closing", they are unknown, and
    // they belong after the ones with a deadline rather than at the top.
    builder = builder
      .order("closes_on", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else if (sort === "salary") {
    builder = builder
      .order("salary_max", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    builder = builder.order("created_at", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const { data, count, error } = await builder.range(from, from + pageSize - 1);

  if (error) return { jobs: [], total: 0, available: false };

  return {
    jobs: (data ?? []) as unknown as JobRow[],
    total: count ?? 0,
    available: true,
  };
}

export async function getJob(id: string): Promise<JobRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as JobRow;
}

export async function getJobAttachments(
  jobId: string,
): Promise<JobAttachment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_attachments")
    .select("*")
    .eq("job_id", jobId)
    .order("position", { ascending: true });

  return data ?? [];
}

/**
 * Turns stored paths into links that work for an hour.
 *
 * The bucket is private — a public one would make the drawings on a *private*
 * job readable by anyone who guessed a filename — so a link has to be signed
 * for the person looking at the page. Signing happens on the server, at render,
 * for exactly the files that page shows.
 *
 * Returns a map rather than an array so a file that could not be signed is
 * simply absent, and the caller shows the name without a link instead of a
 * link that 400s.
 */
export async function signJobFiles(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(JOB_FILES_BUCKET)
    .createSignedUrls(paths, 60 * 60);

  const signed: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) signed[entry.path] = entry.signedUrl;
  }
  return signed;
}

/** The viewer's own application to a job, if any. */
export async function getMyApplication(
  jobId: string,
  userId: string | null,
): Promise<JobApplication | null> {
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("job_applications")
    .select("*")
    .eq("job_id", jobId)
    .eq("applicant_id", userId)
    .maybeSingle();

  return data ?? null;
}

export async function isJobSaved(
  jobId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("job_saved")
    .select("job_id")
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  return data !== null;
}

export async function getJobCities(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("location_city")
    .eq("status", "open")
    .eq("visibility", "public")
    .limit(500);

  const cities = new Set<string>();
  for (const row of data ?? []) {
    if (row.location_city) cities.add(row.location_city);
  }
  return [...cities].sort();
}

/**
 * How many open jobs each category holds.
 *
 * Counted in one query over ids rather than one `count` query per category:
 * twenty-six round trips to render a filter list would cost more than the list
 * is worth. The cap is deliberate — past a few hundred open jobs the exact
 * number beside a filter stops meaning anything.
 */
export async function getJobCategoryCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("category")
    .eq("status", "open")
    .eq("visibility", "public")
    .limit(1000);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.category) continue;
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// The employer's side
// ---------------------------------------------------------------------------

export type MyJobRow = JobRow & {
  /** Live count of applications that have not been withdrawn. */
  pending: number;
  hires: number;
};

/**
 * Every job the viewer posted, drafts included.
 *
 * `jobs.application_count` is maintained by a trigger and counts everything
 * ever submitted; what an employer needs on a dashboard is how many are
 * actually waiting on them, which is a different number as soon as one person
 * withdraws. Both are here: the stored one on the row, the live one beside it.
 */
export async function getMyJobs(
  userId: string,
  status?: JobStatus,
): Promise<MyJobRow[]> {
  const supabase = await createClient();

  let builder = supabase
    .from("jobs")
    .select(COLUMNS)
    .eq("poster_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) builder = builder.eq("status", status);

  const { data, error } = await builder;
  if (error || !data) return [];

  const jobs = data as unknown as JobRow[];
  if (jobs.length === 0) return [];

  const ids = jobs.map((job) => job.id);

  const [{ data: applications }, { data: hires }] = await Promise.all([
    supabase
      .from("job_applications")
      .select("job_id, status")
      .in("job_id", ids),
    supabase.from("job_hires").select("job_id").in("job_id", ids),
  ]);

  const pending: Record<string, number> = {};
  for (const row of applications ?? []) {
    if (row.status === "withdrawn" || row.status === "rejected") continue;
    pending[row.job_id] = (pending[row.job_id] ?? 0) + 1;
  }

  const hired: Record<string, number> = {};
  for (const row of hires ?? []) {
    hired[row.job_id] = (hired[row.job_id] ?? 0) + 1;
  }

  return jobs.map((job) => ({
    ...job,
    pending: pending[job.id] ?? 0,
    hires: hired[job.id] ?? 0,
  }));
}

export type ApplicationRow = JobApplication & {
  applicant: Applicant | null;
  attachments: JobApplicationAttachment[];
  interviews: JobInterview[];
  hire: JobHire | null;
};

/**
 * The pipeline for one job.
 *
 * Ordered newest first within a stage rather than by stage, because an
 * employer reads this list looking for what arrived, and the stage is a chip
 * on the row. Attachments, interviews and the hire are fetched alongside in
 * three queries rather than joined, so one applicant with six files cannot
 * multiply the rows of everyone else.
 */
export async function getJobApplications(
  jobId: string,
): Promise<ApplicationRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_applications")
    .select(`*, applicant:profiles!applicant_id(${APPLICANT_COLUMNS})`)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data) return [];

  const rows = data as unknown as (JobApplication & {
    applicant: Applicant | null;
  })[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [{ data: files }, { data: interviews }, { data: hires }] =
    await Promise.all([
      supabase
        .from("job_application_attachments")
        .select("*")
        .in("application_id", ids)
        .order("position", { ascending: true }),
      supabase
        .from("job_interviews")
        .select("*")
        .in("application_id", ids)
        .order("scheduled_at", { ascending: false }),
      supabase.from("job_hires").select("*").in("application_id", ids),
    ]);

  const byApplication = <T extends { application_id: string }>(
    list: T[] | null,
  ) => {
    const map: Record<string, T[]> = {};
    for (const row of list ?? []) {
      (map[row.application_id] ??= []).push(row);
    }
    return map;
  };

  const filesFor = byApplication(files);
  const interviewsFor = byApplication(interviews);
  const hiresFor = byApplication(hires);

  return rows.map((row) => ({
    ...row,
    attachments: filesFor[row.id] ?? [],
    interviews: interviewsFor[row.id] ?? [],
    hire: hiresFor[row.id]?.[0] ?? null,
  }));
}

/** Applications across every job the viewer posted, for the summary counts. */
export async function getApplicationCounts(
  userId: string,
): Promise<Record<ApplicationStatus, number>> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("job_applications")
    .select("status, jobs!inner(poster_id)")
    .eq("jobs.poster_id", userId)
    .limit(2000);

  const counts = {
    submitted: 0,
    reviewing: 0,
    shortlisted: 0,
    interviewing: 0,
    offered: 0,
    hired: 0,
    rejected: 0,
    withdrawn: 0,
  } satisfies Record<ApplicationStatus, number>;

  for (const row of (data ?? []) as { status: ApplicationStatus }[]) {
    counts[row.status] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// The applicant's side
// ---------------------------------------------------------------------------

export type MyApplicationRow = JobApplication & {
  job: JobRow | null;
  interviews: JobInterview[];
};

export async function getMyApplications(
  userId: string,
): Promise<MyApplicationRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_applications")
    .select(`*, job:jobs(${COLUMNS})`)
    .eq("applicant_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  const rows = data as unknown as (JobApplication & { job: JobRow | null })[];
  if (rows.length === 0) return [];

  const { data: interviews } = await supabase
    .from("job_interviews")
    .select("*")
    .in(
      "application_id",
      rows.map((row) => row.id),
    )
    .order("scheduled_at", { ascending: false });

  const byApplication: Record<string, JobInterview[]> = {};
  for (const row of interviews ?? []) {
    (byApplication[row.application_id] ??= []).push(row);
  }

  return rows.map((row) => ({
    ...row,
    interviews: byApplication[row.id] ?? [],
  }));
}

export async function getSavedJobs(userId: string): Promise<JobRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_saved")
    .select(`created_at, job:jobs(${COLUMNS})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  // A saved job whose posting was deleted comes back with a null join rather
  // than disappearing, and a row that renders nothing is worse than no row.
  return (data as unknown as { job: JobRow | null }[])
    .map((row) => row.job)
    .filter((job): job is JobRow => job !== null);
}

export type HireRow = JobHire & {
  job: JobRow | null;
  professional: Applicant | null;
  employer: Applicant | null;
};

/**
 * Everyone the viewer hired, and everywhere the viewer was hired.
 *
 * One query for both sides: the policy already limits it to hires the viewer
 * is party to, and which side they were on is `employer_id === userId`.
 */
export async function getHires(userId: string): Promise<HireRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_hires")
    .select(
      `*,
       job:jobs(${COLUMNS}),
       professional:profiles!professional_id(${APPLICANT_COLUMNS}),
       employer:profiles!employer_id(${APPLICANT_COLUMNS})`,
    )
    .or(`employer_id.eq.${userId},professional_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return data as unknown as HireRow[];
}

/**
 * What the platform already knows about the applicant.
 *
 * The apply form is filled from this rather than asking again. A member who
 * has kept their profile current should not have to retype their city and
 * their years of experience to apply for a job, and an employer reading the
 * application gets the same figures the profile shows.
 */
export type ApplicantSnapshot = {
  fullName: string | null;
  headline: string | null;
  city: string | null;
  yearsExperience: number | null;
  website: string | null;
  avatarUrl: string | null;
  username: string | null;
  /** Whether the profile has enough on it to be worth an employer's click. */
  complete: boolean;
};

export async function getApplicantSnapshot(
  userId: string,
): Promise<ApplicantSnapshot | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "full_name, company_name, bio, website, location_city, years_experience, avatar_url, username",
    )
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    fullName: data.full_name ?? data.company_name,
    headline: data.bio,
    city: data.location_city,
    yearsExperience: data.years_experience,
    website: data.website,
    avatarUrl: data.avatar_url,
    username: data.username,
    complete: Boolean(data.full_name && data.bio && data.location_city),
  };
}
