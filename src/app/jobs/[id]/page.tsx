import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  FileText,
  Lock,
  MapPin,
  Pencil,
  Users,
} from "lucide-react";

import { ApplyForm } from "@/components/jobs/apply-form";
import { JobActions } from "@/components/jobs/job-actions";
import { MessageButton } from "@/components/messages/message-button";
import { buttonVariants } from "@/components/ui/button";
import {
  EXPERIENCE_LEVEL,
  JOB_TYPE,
  WORK_MODE,
} from "@/lib/constants/community";
import { jobCategoryLabel, salaryPeriodLabel } from "@/lib/constants/jobs";
import { COMPANY_PLACEHOLDER } from "@/lib/constants/placeholders";
import {
  getApplicantSnapshot,
  getJob,
  getJobAttachments,
  getMyApplication,
  isJobSaved,
  signJobFiles,
} from "@/lib/data/jobs";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";
import type { JobRow } from "@/lib/data/jobs";

export const dynamic = "force-dynamic";

function employerName(job: JobRow): string {
  return (
    job.company?.name ??
    job.poster?.company_name ??
    job.poster?.full_name ??
    "Medosha member"
  );
}

function salaryLabel(job: JobRow): string | null {
  if (!job.salary_visible) return null;
  if (job.salary_min === null && job.salary_max === null) return null;

  const format = (value: number) =>
    `${job.currency} ${Number(value).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    })}`;

  const range =
    job.salary_min !== null && job.salary_max !== null
      ? job.salary_min === job.salary_max
        ? format(job.salary_min)
        : `${format(job.salary_min)} – ${format(job.salary_max)}`
      : format((job.salary_min ?? job.salary_max) as number);

  return `${range} ${salaryPeriodLabel(job.salary_period)}`;
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const job = await getJob(id);
  if (!job) return { title: "Job not found" };

  const employer = employerName(job);
  const description = job.description.slice(0, 160);

  return {
    title: `${job.title} at ${employer}`,
    description,
    // A private job is reachable by its link on purpose. Being reachable is
    // not the same as being indexed, and a search engine following a shared
    // link would undo the setting.
    robots: job.visibility === "private" ? { index: false } : undefined,
    openGraph: {
      title: `${job.title} at ${employer}`,
      description,
      type: "article",
    },
  };
}

export default async function JobPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const job = await getJob(id);
  if (!job) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwner = user?.id === job.poster_id;

  const [existing, saved, attachments, profile] = await Promise.all([
    getMyApplication(job.id, user?.id ?? null),
    isJobSaved(job.id, user?.id ?? null),
    getJobAttachments(job.id),
    user ? getApplicantSnapshot(user.id) : Promise.resolve(null),
  ]);

  const signed = await signJobFiles(attachments.map((file) => file.url));

  const employer = employerName(job);
  const salary = salaryLabel(job);
  const closed = job.status !== "open";
  const isProject = job.salary_period === "project";

  return (
    <div className="container-page py-10">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All jobs
      </Link>

      {isOwner && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
          <span className="text-sm text-muted-foreground">
            {job.status === "draft"
              ? "This is a draft. Only you can see it."
              : `Your posting · ${job.application_count} ${
                  job.application_count === 1 ? "applicant" : "applicants"
                }`}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Link
              href={`/jobs/${job.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Pencil className="size-4" />
              Edit
            </Link>
            <Link
              href={`/jobs/${job.id}/applications`}
              className={buttonVariants({ size: "sm" })}
            >
              Applications
            </Link>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <header className="flex gap-4">
            <Image
              src={job.company?.logo_url || COMPANY_PLACEHOLDER}
              alt=""
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-xl border object-cover"
            />
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight">
                {job.title}
              </h1>
              <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                {job.company?.slug ? (
                  <Link
                    href={`/companies/${job.company.slug}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {employer}
                  </Link>
                ) : job.poster?.username ? (
                  <Link
                    href={`/u/${job.poster.username}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {employer}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{employer}</span>
                )}
                {job.company?.verified && (
                  <BadgeCheck className="size-4 text-brand" aria-label="Verified" />
                )}
              </p>
            </div>
          </header>

          <div className="flex flex-wrap gap-2">
            {job.category && <Chip highlight>{jobCategoryLabel(job.category)}</Chip>}
            <Chip>{JOB_TYPE[job.job_type]}</Chip>
            <Chip>{WORK_MODE[job.work_mode]}</Chip>
            <Chip>{EXPERIENCE_LEVEL[job.experience_level]}</Chip>
            {job.profession && <Chip>{job.profession}</Chip>}
            {job.visibility === "private" && (
              <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
                <Lock className="size-3.5" />
                Private — by link only
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {job.location_city && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" />
                {job.location_city}, {job.location_country}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Users className="size-4" />
              {job.application_count}{" "}
              {job.application_count === 1 ? "applicant" : "applicants"}
            </span>
            {job.closes_on && (
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-4" />
                Closes {new Date(job.closes_on).toLocaleDateString("en-GB")}
              </span>
            )}
            <span>Posted {formatRelativeTime(job.created_at)}</span>
          </div>

          <JobActions
            jobId={job.id}
            title={job.title}
            saved={saved}
            signedIn={user !== null}
          />

          <Prose title="About the role" body={job.description} />
          {job.responsibilities && (
            <Prose title="Responsibilities" body={job.responsibilities} />
          )}
          {job.requirements && (
            <Prose title="Requirements" body={job.requirements} />
          )}

          {job.skills.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((skill) => (
                  <Link
                    key={skill}
                    href={`/jobs?skill=${encodeURIComponent(skill)}`}
                    className="rounded-full border px-2.5 py-1 text-sm transition-colors hover:border-brand"
                  >
                    {skill}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {attachments.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Files</h2>
              <ul className="space-y-1.5">
                {attachments.map((file) => {
                  const href = signed[file.url];
                  return (
                    <li key={file.id}>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-brand"
                        >
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate">{file.name}</span>
                        </a>
                      ) : (
                        <span className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                          <FileText className="size-4 shrink-0" />
                          {file.name}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border p-5">
            <div className="mb-4 border-b pb-4">
              <p className="text-sm text-muted-foreground">
                {isProject ? "Budget" : "Pay"}
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {salary ?? "Not disclosed"}
              </p>
              {job.openings > 1 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {job.openings} positions open
                </p>
              )}
            </div>

            <ApplyForm
              jobId={job.id}
              currency={job.currency}
              salaryPeriod={job.salary_period}
              isProject={isProject}
              signedIn={user !== null}
              isOwner={isOwner}
              closed={closed}
              existing={existing}
              profile={profile}
            />
          </div>

          {!isOwner && user && (
            <div className="rounded-2xl border p-5">
              <p className="mb-3 text-sm text-muted-foreground">
                A question before you apply?
              </p>
              <MessageButton
                userId={job.poster_id}
                contextType="job"
                contextId={job.id}
                subject={job.title}
                label={`Message ${employer}`}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Chip({
  children,
  highlight,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <span
      className={
        highlight
          ? "rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand"
          : "rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground"
      }
    >
      {children}
    </span>
  );
}

function Prose({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
        {body}
      </p>
    </section>
  );
}
