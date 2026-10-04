import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, MapPin, Users } from "lucide-react";

import { COMPANY_PLACEHOLDER } from "@/lib/constants/placeholders";
import { EXPERIENCE_LEVEL, JOB_TYPE, WORK_MODE } from "@/lib/constants/community";
import { jobCategoryLabel, salaryPeriodLabel } from "@/lib/constants/jobs";
import { formatRelativeTime } from "@/lib/utils";
import type { JobRow } from "@/lib/data/jobs";

/** Renders a salary range, or nothing when the poster chose to hide it. */
function salaryLabel(job: JobRow): string | null {
  if (!job.salary_visible) return null;
  if (job.salary_min === null && job.salary_max === null) return null;

  const format = (value: number) =>
    `${job.currency} ${Number(value).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`;

  const range =
    job.salary_min !== null && job.salary_max !== null
      ? job.salary_min === job.salary_max
        ? format(job.salary_min)
        : `${format(job.salary_min)} – ${format(job.salary_max)}`
      : format((job.salary_min ?? job.salary_max)!);

  return `${range} ${salaryPeriodLabel(job.salary_period)}`;
}

export function JobCard({ job }: { job: JobRow }) {
  const employer =
    job.company?.name ??
    job.poster?.company_name ??
    job.poster?.full_name ??
    "Medosha member";
  const salary = salaryLabel(job);

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group flex gap-4 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
    >
      <Image
        src={job.company?.logo_url || COMPANY_PLACEHOLDER}
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-xl border object-cover"
      />

      <div className="min-w-0 flex-1">
        <h3 className="font-medium leading-snug group-hover:underline">
          {job.title}
        </h3>

        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate">{employer}</span>
          {job.company?.verified && (
            <BadgeCheck className="size-3.5 shrink-0 text-brand" aria-label="Verified" />
          )}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {job.category && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
              {jobCategoryLabel(job.category)}
            </span>
          )}
          <Tag>{JOB_TYPE[job.job_type]}</Tag>
          <Tag>{WORK_MODE[job.work_mode]}</Tag>
          <Tag>{EXPERIENCE_LEVEL[job.experience_level]}</Tag>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {job.location_city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {job.location_city}
            </span>
          )}
          {job.application_count > 0 && (
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {job.application_count}{" "}
              {job.application_count === 1 ? "applicant" : "applicants"}
            </span>
          )}
          <span>{formatRelativeTime(job.created_at)}</span>
        </div>
      </div>

      {salary && (
        <p className="hidden shrink-0 text-right text-sm font-semibold tabular-nums sm:block">
          {salary}
        </p>
      )}
    </Link>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
