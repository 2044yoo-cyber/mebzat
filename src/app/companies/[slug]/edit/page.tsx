import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CompanyEditForm } from "@/components/companies/company-edit-form";
import { getCompanyBySlug } from "@/lib/data/companies";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/types/database.types";

export const metadata: Metadata = { title: "Edit business" };

export default async function EditCompanyPage(props: {
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
    redirect(`/login?redirect=/companies/${slug}/edit`);
  }

  if (company.owner_id !== user.id) {
    // Only the verified owner can edit.
    redirect(`/companies/${slug}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {company.name}
        </h1>
        <p className="text-muted-foreground">
          Manage your business profile and contact information.
        </p>
      </div>
      <CompanyEditForm company={company as Company} userId={user.id} />
    </div>
  );
}
