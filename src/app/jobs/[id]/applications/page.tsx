import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ApplicantCard } from "@/components/jobs/applicant-card";
import { APPLICATION_STATUS_LABEL } from "@/lib/constants/community";
import { getJob, getJobApplications, signJobFiles } from "@/lib/data/jobs";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "@/types/database.types";

/**
 * The pipeline for one job.
 *
 * Filtered by a query parameter rather than client state, so "the people I
 * shortlisted" is a link an employer can keep, and so the page still works
 * before any JavaScript has run.
 */

export const metadata: Metadata = {
  title: "Applications",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const FILTERS: { id: string; label: string; match: ApplicationStatus[] }[] = [
  {
    id: "open",
    label: "In play",
    match: ["submitted", "reviewing", "shortlisted", "interviewing", "offered"],
  },
  { id: "shortlisted", label: "Shortlisted", match: ["shortlisted"] },
  { id: "interviewing", label: "Interviewing", match: ["interviewing"] },
  { id: "hired", label: "Hired", match: ["hired"] },
  { id: "rejected", label: "Not selected", match: ["rejected"] },
  { id: "withdrawn", label: "Withdrawn", match: ["withdrawn"] },
  {
    id: "all",
    label: "Everyone",
    match: [
      "submitted",
      "reviewing",
      "shortlisted",
      "interviewing",
      "offered",
      "hired",
      "rejected",
      "withdrawn",
    ],
  },
];

export default async function JobApplicationsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const rawFilter = Array.isArray(sp.stage) ? sp.stage[0] : sp.stage;
  const filter = FILTERS.find((entry) => entry.id === rawFilter) ?? FILTERS[0]!;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/jobs/${id}/applications`);

  const job = await getJob(id);
  if (!job) notFound();

  // The select policy on job_applications already limits this to the poster,
  // so a stranger would see an empty list. An empty list looks like "nobody
  // applied", which is a different and misleading statement.
  if (job.poster_id !== user.id) notFound();

  const applications = await getJobApplications(job.id);
  const signed = await signJobFiles(
    applications.flatMap((application) =>
      application.attachments.map((file) => file.url),
    ),
  );

  const shown = applications.filter((application) =>
    filter.match.includes(application.status),
  );

  const countOf = (entry: (typeof FILTERS)[number]) =>
    applications.filter((application) => entry.match.includes(application.status))
      .length;

  return (
    <div className="container-page py-10">
      <Link
        href={`/jobs/${job.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {job.title}
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Applications</h1>
        <p className="mt-1 text-muted-foreground">
          {applications.length === 0
            ? "Nobody has applied yet. New applications appear here and in your notifications."
            : `${applications.length} ${
                applications.length === 1 ? "person has" : "people have"
              } applied. ${job.openings > 1 ? `${job.openings} positions to fill.` : ""}`}
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Stage">
        {FILTERS.map((entry) => {
          const count = countOf(entry);
          if (count === 0 && entry.id !== "open" && entry.id !== "all") {
            return null;
          }
          return (
            <Link
              key={entry.id}
              href={`/jobs/${job.id}/applications?stage=${entry.id}`}
              aria-current={filter.id === entry.id ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                filter.id === entry.id
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:border-brand hover:bg-brand/5",
              )}
            >
              {entry.label}
              <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-16 text-center">
          <p className="font-medium">
            {applications.length === 0
              ? "No applications yet"
              : `Nobody is ${(APPLICATION_STATUS_LABEL[filter.match[0] ?? ""] ?? filter.label).toLowerCase()}`}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {applications.length === 0
              ? "Share the link, or check that the job is published and public."
              : "Move somebody into this stage and they will appear here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((application) => (
            <ApplicantCard
              key={application.id}
              application={application}
              currency={job.currency}
              salaryPeriod={job.salary_period}
              jobTitle={job.title}
              signedUrls={signed}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
