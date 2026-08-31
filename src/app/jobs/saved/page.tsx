import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark } from "lucide-react";

import { JobCard } from "@/components/jobs/job-card";
import { buttonVariants } from "@/components/ui/button";
import { getSavedJobs } from "@/lib/data/jobs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Saved jobs",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function SavedJobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/jobs/saved");

  const jobs = await getSavedJobs(user.id);

  return (
    <div className="container-page py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bookmark className="size-4" /> Saved
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Saved jobs
          </h1>
          <p className="mt-1 text-muted-foreground">
            Only you can see this list. Nobody is told that you saved a job.
          </p>
        </div>

        <Link
          href="/jobs/applications"
          className={buttonVariants({ variant: "outline" })}
        >
          My applications
        </Link>
      </header>

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-16 text-center">
          <p className="font-medium">Nothing saved</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Save a job while you think about it and it waits here.
          </p>
          <Link href="/jobs" className={buttonVariants({ className: "mt-4" })}>
            Browse jobs
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
