"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  claimSchema,
  companyEditSchema,
} from "@/lib/validations/company";

export type ClaimState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  status?: "pending" | "approved";
};

/** Submits a claim on an unclaimed business. If the claimant's account email
 * matches the business's listed email, ownership is verified and granted
 * immediately; otherwise the claim is left pending admin review. */
export async function submitClaim(
  companyId: string,
  _prevState: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const parsed = claimSchema.safeParse({
    roleAtCompany: formData.get("roleAtCompany"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Log in to claim a business." };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, slug, email, is_claimed")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) return { error: "Business not found." };
  if (company.is_claimed) {
    return { error: "This business has already been claimed." };
  }

  const { data: claim, error } = await supabase
    .from("company_claims")
    .upsert(
      {
        company_id: companyId,
        claimant_id: user.id,
        role_at_company: parsed.data.roleAtCompany,
        contact_email: parsed.data.contactEmail,
        contact_phone: parsed.data.contactPhone || null,
        message: parsed.data.message || null,
        status: "pending",
      },
      { onConflict: "company_id,claimant_id" },
    )
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Verify by email match: if the business lists an email that matches the
  // claimant's account or provided contact email, approve immediately.
  const businessEmail = company.email?.trim().toLowerCase();
  const claimantEmails = [user.email, parsed.data.contactEmail]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());

  if (businessEmail && claimantEmails.includes(businessEmail)) {
    const service = createServiceClient();
    const { error: approveError } = await service.rpc("approve_company_claim", {
      claim_id: claim.id,
    });
    if (!approveError) {
      revalidatePath(`/companies/${company.slug}`);
      return { status: "approved" };
    }
    // Fall through to pending if approval failed for any reason.
  }

  revalidatePath(`/companies/${company.slug}`);
  return { status: "pending" };
}

export type CompanyEditState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export async function updateCompany(
  companyId: string,
  _prevState: CompanyEditState,
  formData: FormData,
): Promise<CompanyEditState> {
  const parsed = companyEditSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description"),
    website: formData.get("website"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    city: formData.get("city"),
    country: formData.get("country"),
    employeesCount: formData.get("employeesCount") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Log in again." };
  }

  const d = parsed.data;
  const logoUrl = formData.get("logoUrl");
  const coverUrl = formData.get("coverUrl");

  const { data: company, error } = await supabase
    .from("companies")
    .update({
      name: d.name,
      category: d.category || null,
      description: d.description || null,
      website: d.website || null,
      email: d.email || null,
      phone: d.phone || null,
      address: d.address || null,
      city: d.city || null,
      country: d.country || null,
      employees_count: d.employeesCount ?? null,
      logo_url: typeof logoUrl === "string" && logoUrl ? logoUrl : null,
      cover_url: typeof coverUrl === "string" && coverUrl ? coverUrl : null,
    })
    .eq("id", companyId)
    .eq("owner_id", user.id)
    .select("slug")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/companies/${company.slug}`);
  redirect(`/companies/${company.slug}`);
}
