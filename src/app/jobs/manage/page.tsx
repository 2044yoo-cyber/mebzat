import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Briefcase,
  CalendarClock,
  MapPin,
  Pencil,
  Plus,
  Users,
} from "lucide-react";

import { HireList } from "@/components/jobs/hire-list";
import { JobStatusMenu } from "@/components/jobs/job-status-menu";
import { buttonVariants } from "@/components/ui/button";
import { jobCategoryLabel } from "@/lib/constants/jobs";
import { getApplicationCounts, getHires, getMyJobs } from "@/lib/data/jobs";
import { createClient } from "@/lib/supabase/server";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { MyJobRow } from "@/lib/data/jobs";

/**
 * The employer's side of Jobs.
 *
 * Everything they posted, what is waiting on them, and who they hired — on one
 * page, because a hiring dashboard split across four screens is a dashboard
 * nobody checks. The tabs are links rather than client state so a bookmark to
 * "my drafts" is a real address.
 */

export const metadata: Metadata = {
  title: "My jobs",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const TABS = [
  { id: "active", label: "Active" },
  { id: "drafts", label: "Drafts" },
  { id: "closed", label: "Closed" },
  { id: "hired", label: "Hired" },
] as const;

export default async function ManageJobsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab = TABS.some((entry) => entry.id === rawTab)
    ? (rawTab as (typeof TABS)[number]["id"])
    : "active";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/jobs/manage");

  const [jobs, counts, hires] = await Promise.all([
    getMyJobs(user.id),
    getApplicationCounts(user.id),
    getHires(user.id),
  ]);

  const active = jobs.filter(
    (job) => job.status === "open" || job.status === "filled",
  );
  const drafts = jobs.filter((job) => job.status === "draft");
  const closed = jobs.filter((job) => job.status === "closed");
  const employerHires = hires.filter((hire) => hire.employer_id === user.id);

  const waiting =
    counts.submitted + counts.reviewing + counts.shortlisted + counts.interviewing;

  const shown =
    tab === "drafts" ? drafts : tab === "closed" ? closed : active;

  return (
    <div className="container-page py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="size-4" /> Hiring
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">My jobs</h1>
          <p className="mt-1 text-muted-foreground">
            {jobs.length === 0
              ? "Nothing posted yet."
              : `${waiting} ${waiting === 1 ? "application" : "applications"} waiting on you across ${active.length} ${active.length === 1 ? "role" : "roles"}.`}
          </p>
        </div>

        <Link href="/jobs/new" className={buttonVariants({ size: "lg" })}>
          <Plus className="size-4" />
          Post a job
        </Link>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Waiting" value={waiting} />
        <Stat label="Shortlisted" value={counts.shortlisted} />
        <Stat label="Interviewing" value={counts.interviewing} />
        <Stat label="Hired" value={counts.hired} />
      </div>

      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Job lists">
        {TABS.map((entry) => {
          const count =
            entry.id === "active"
              ? active.length
              : entry.id === "drafts"
                ? drafts.length
                : entry.id === "closed"
                  ? closed.length
                  : employerHires.length;

          return (
            <Link
              key={entry.id}
              href={`/jobs/manage?tab=${entry.id}`}
              aria-current={tab === entry.id ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                tab === entry.id
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

      {tab === "hired" ? (
        <HireList hires={employerHires} viewerId={user.id} />
      ) : shown.length === 0 ? (
        <Empty tab={tab} />
      ) : (
        <ul className="space-y-3">
          {shown.map((job) => (
            <ManagedJob key={job.id} job={job} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ManagedJob({ job }: { job: MyJobRow }) {
  const isDraft = job.status === "draft";

  return (
    <li className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/jobs/${job.id}`}
            className="font-medium leading-snug hover:underline"
          >
            {job.title}
          </Link>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {job.category && <span>{jobCategoryLabel(job.category)}</span>}
            {job.location_city && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {job.location_city}
              </span>
            )}
            {job.closes_on && (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                Closes {new Date(job.closes_on).toLocaleDateString("en-GB")}
              </span>
            )}
            <span>
              {isDraft ? "Saved" : "Posted"} {formatRelativeTime(job.created_at)}
            </span>
          </div>
        </div>

        <JobStatusMenu jobId={job.id} status={job.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!isDraft && (
          <Link
            href={`/jobs/${job.id}/applications`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Users className="size-4" />
            {job.pending} waiting
            {job.application_count > job.pending
              ? ` of ${job.application_count}`
              : ""}
          </Link>
        )}
        <Link
          href={`/jobs/${job.id}/edit`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Pencil className="size-4" />
          {isDraft ? "Finish it" : "Edit"}
        </Link>
        {job.hires > 0 && (
          <span className="text-sm text-muted-foreground">
            {job.hires} of {job.openings} hired
          </span>
        )}
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Empty({ tab }: { tab: string }) {
  const copy: Record<string, { title: string; body: string }> = {
    active: {
      title: "Nothing live right now",
      body: "Post a role and it appears in the jobs list, in search, and on your profile.",
    },
    drafts: {
      title: "No drafts",
      body: "A job you save without publishing waits here until you are ready.",
    },
    closed: {
      title: "Nothing closed yet",
      body: "Closing a job stops new applications. The ones you already have stay.",
    },
  };

  const entry = copy[tab] ?? copy.active!;

  return (
    <div className="rounded-2xl border border-dashed p-16 text-center">
      <p className="font-medium">{entry.title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {entry.body}
      </p>
    </div>
  );
}
