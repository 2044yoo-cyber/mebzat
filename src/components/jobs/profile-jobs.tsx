import Link from "next/link";

import { JobCard } from "@/components/jobs/job-card";
import { createClient } from "@/lib/supabase/server";
import type { JobRow } from "@/lib/data/jobs";

/**
 * What this member is hiring for, on their profile.
 *
 * Only live, public postings. A draft belongs to the person who wrote it and a
 * private job is private — the select policy from 0033 enforces both, so a
 * visitor's query simply returns fewer rows than the owner's would, without
 * this component needing to know who is looking.
 *
 * Renders nothing when there is nothing, rather than an empty heading. A
 * profile that says "Jobs: none" reads as a failure; a profile with no jobs
 * section reads as a person who is not hiring.
 */
export async function ProfileJobs({
  ownerId,
  isOwner,
}: {
  ownerId: string;
  isOwner: boolean;
}) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("jobs")
    .select(
      `*,
       poster:profiles!poster_id(id, username, full_name, company_name, avatar_url),
       company:companies(id, name, slug, logo_url, verified)`,
    )
    .eq("poster_id", ownerId)
    .eq("status", "open")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(4);

  const jobs = (data ?? []) as unknown as JobRow[];
  if (jobs.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Hiring</h2>
        {isOwner && (
          <Link
            href="/jobs/manage"
            className="text-sm text-muted-foreground hover:underline"
          >
            Manage
          </Link>
        )}
      </div>
      <div className="space-y-3">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </section>
  );
}

/**
 * The roles a company is hiring for, on its own page.
 *
 * Separate from `ProfileJobs` because the query is by `company_id`, not by
 * poster: a company's jobs may have been posted by any of the people who work
 * there, and the page is about the company.
 */
export async function CompanyJobs({
  companyId,
  name,
}: {
  companyId: string;
  name: string;
}) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("jobs")
    .select(
      `*,
       poster:profiles!poster_id(id, username, full_name, company_name, avatar_url),
       company:companies(id, name, slug, logo_url, verified)`,
    )
    .eq("company_id", companyId)
    .eq("status", "open")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(4);

  const jobs = (data ?? []) as unknown as JobRow[];
  if (jobs.length === 0) return null;

  return (
    <section className="space-y-3 pt-4">
      <h2 className="text-sm font-medium text-muted-foreground">
        {name} is hiring
      </h2>
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </section>
  );
}
