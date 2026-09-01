import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Briefcase } from "lucide-react";

import { BriefForm } from "@/components/hire/brief-form";
import { getServiceCategories } from "@/lib/data/services";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Post a project",
  description:
    "Describe the work and let matching professionals bid. Compare the offers side by side.",
};

export const dynamic = "force-dynamic";

export default async function NewBriefPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/hire/new");

  const categories = await getServiceCategories();

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/hire"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Project marketplace
        </Link>

        <header>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="size-4" /> Post a project
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Tell us what needs doing
          </h1>
          <p className="mt-1 text-muted-foreground">
            Matching professionals are notified automatically. You compare
            their bids side by side and choose.
          </p>
        </header>

        <BriefForm categories={categories} />
      </div>
    </div>
  );
}
