import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { JobFiles } from "@/components/jobs/job-files";
import { JobForm } from "@/components/jobs/job-form";
import { getMyCompanies } from "@/lib/data/companies";
import { getJob, getJobAttachments } from "@/lib/data/jobs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Edit job",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function EditJobPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/jobs/${id}/edit`);

  const job = await getJob(id);
  if (!job) notFound();

  // The update policy would refuse the write anyway. Refusing the page is
  // kinder: nobody fills in a form that was never going to save.
  if (job.poster_id !== user.id) notFound();

  const [companies, attachments] = await Promise.all([
    getMyCompanies(user.id),
    getJobAttachments(job.id),
  ]);

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href={job.status === "draft" ? "/jobs/manage" : `/jobs/${job.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {job.status === "draft" ? "My jobs" : "Back to the job"}
        </Link>

        <header>
          <h1 className="text-3xl font-semibold tracking-tight">
            {job.status === "draft" ? "Finish this draft" : "Edit job"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {job.status === "draft"
              ? "Only you can see it. It goes live when you publish."
              : `${job.application_count} ${
                  job.application_count === 1 ? "person has" : "people have"
                } applied. Changes are live as soon as you save.`}
          </p>
        </header>

        <JobForm job={job} companies={companies} />

        <JobFiles jobId={job.id} attachments={attachments} />
      </div>
    </div>
  );
}
