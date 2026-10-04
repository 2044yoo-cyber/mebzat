import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Briefcase } from "lucide-react";

import { JobForm } from "@/components/jobs/job-form";
import { getMyCompanies } from "@/lib/data/companies";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Post a job",
  description:
    "Hire site engineers, architects, foremen and tradespeople. Post a role and receive applications from professionals already on Medosha.",
};

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/jobs/new");

  // The poster's own city is the likeliest answer, so it is filled in rather
  // than asked for. It is a normal editable field, not a lock.
  const [{ data: profile }, companies] = await Promise.all([
    supabase
      .from("profiles")
      .select("location_city")
      .eq("id", user.id)
      .maybeSingle(),
    getMyCompanies(user.id),
  ]);

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All jobs
        </Link>

        <header>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="size-4" /> Post a job
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Hire someone
          </h1>
          <p className="mt-1 text-muted-foreground">
            Describe the role. Professionals apply with the profile they have
            already built here, so you see their work, not just a CV.
          </p>
        </header>

        <JobForm companies={companies} defaultCity={profile?.location_city} />
      </div>
    </div>
  );
}
