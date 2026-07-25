import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ClaimForm } from "@/components/companies/claim-form";
import { getCompanyBySlug } from "@/lib/data/companies";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Claim business" };

export default async function ClaimCompanyPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const company = await getCompanyBySlug(slug);
  if (!company) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/companies/${slug}/claim`);
  }

  if (company.is_claimed) {
    redirect(`/companies/${slug}`);
  }

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Claim {company.name}
        </h1>
        <p className="text-muted-foreground">
          Verify that you&apos;re authorized to manage this business.
        </p>
      </div>
      <ClaimForm
        companyId={company.id}
        companySlug={company.slug}
        companyName={company.name}
        defaultEmail={user.email ?? ""}
      />
    </div>
  );
}
