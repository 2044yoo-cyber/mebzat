import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, CalendarClock, MapPin } from "lucide-react";

import { HireList } from "@/components/jobs/hire-list";
import { buttonVariants } from "@/components/ui/button";
import { APPLICATION_STATUS_LABEL } from "@/lib/constants/community";
import { salaryPeriodLabel } from "@/lib/constants/jobs";
import { COMPANY_PLACEHOLDER } from "@/lib/constants/placeholders";
import { getHires, getMyApplications } from "@/lib/data/jobs";
import { createClient } from "@/lib/supabase/server";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { MyApplicationRow } from "@/lib/data/jobs";

/**
 * The applicant's side of Jobs.
 *
 * Where every application stands, in the applicant's words rather than the
 * employer's: an application nobody has opened says "submitted", not "pending
 * review", because the second claims something Medosha does not know.
 */

export const metadata: Metadata = {
  title: "My applications",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function MyApplicationsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === "hired"
    ? "hired"
    : "applications";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/jobs/applications");

  const [applications, hires] = await Promise.all([
    getMyApplications(user.id),
    getHires(user.id),
  ]);

  const myHires = hires.filter((hire) => hire.professional_id === user.id);
  const live = applications.filter(
    (application) =>
      application.status !== "withdrawn" && application.status !== "rejected",
  );

  return (
    <div className="container-page py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            My applications
          </h1>
          <p className="mt-1 text-muted-foreground">
            {applications.length === 0
              ? "You have not applied for anything yet."
              : `${live.length} still in play of ${applications.length} sent.`}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/jobs/saved"
            className={buttonVariants({ variant: "outline" })}
          >
            <Bookmark className="size-4" />
            Saved
          </Link>
          <Link href="/jobs" className={buttonVariants()}>
            Find work
          </Link>
        </div>
      </header>

      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Lists">
        <Link
          href="/jobs/applications"
          aria-current={tab === "applications" ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "applications"
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:border-brand hover:bg-brand/5",
          )}
        >
          Applications
          <span className="ml-1.5 tabular-nums opacity-70">
            {applications.length}
          </span>
        </Link>
        <Link
          href="/jobs/applications?tab=hired"
          aria-current={tab === "hired" ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "hired"
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:border-brand hover:bg-brand/5",
          )}
        >
          Hired
          <span className="ml-1.5 tabular-nums opacity-70">
            {myHires.length}
          </span>
        </Link>
      </nav>

      {tab === "hired" ? (
        <HireList hires={myHires} viewerId={user.id} />
      ) : applications.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-16 text-center">
          <p className="font-medium">Nothing sent yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Your Medosha profile is your application — employers see your work,
            not just a CV.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {applications.map((application) => (
            <ApplicationRowCard key={application.id} row={application} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ApplicationRowCard({ row }: { row: MyApplicationRow }) {
  const job = row.job;
  const employer =
    job?.company?.name ??
    job?.poster?.company_name ??
    job?.poster?.full_name ??
    "Medosha member";

  const nextInterview = row.interviews[0];

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card p-5",
        row.status === "hired" && "border-emerald-500/40",
        (row.status === "withdrawn" || row.status === "rejected") && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Image
          src={job?.company?.logo_url || COMPANY_PLACEHOLDER}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-xl border object-cover"
        />

        <div className="min-w-0 flex-1">
          {job ? (
            <Link
              href={`/jobs/${job.id}`}
              className="font-medium leading-snug hover:underline"
            >
              {job.title}
            </Link>
          ) : (
            <span className="font-medium">A job that has been removed</span>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground">{employer}</p>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {job?.location_city && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {job.location_city}
              </span>
            )}
            <span>Applied {formatRelativeTime(row.created_at)}</span>
            {row.expected_salary !== null && job && (
              <span className="tabular-nums">
                Asked {job.currency}{" "}
                {Number(row.expected_salary).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}{" "}
                {salaryPeriodLabel(job.salary_period)}
              </span>
            )}
          </div>
        </div>

        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            row.status === "hired"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {APPLICATION_STATUS_LABEL[row.status] ?? row.status}
        </span>
      </div>

      {nextInterview && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed p-2.5 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" />
          {nextInterview.mode ?? "Interview"}
          {nextInterview.scheduled_at
            ? ` · ${new Date(nextInterview.scheduled_at).toLocaleString("en-GB")}`
            : " · time to be agreed"}
          {nextInterview.location ? ` · ${nextInterview.location}` : ""}
        </p>
      )}
    </li>
  );
}
