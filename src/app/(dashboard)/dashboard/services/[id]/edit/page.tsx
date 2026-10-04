import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ServiceForm } from "@/components/services/service-form";
import { getService, getServiceCategories } from "@/lib/data/services";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit service" };

export const dynamic = "force-dynamic";

export default async function EditServicePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/services/${id}/edit`);

  const [service, categories] = await Promise.all([
    getService(id),
    getServiceCategories(),
  ]);

  // Someone else's service is not found rather than forbidden — the existence
  // of another provider's draft is not this user's business.
  if (!service || service.provider_id !== user.id) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/dashboard/services"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        My Services
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {service.title}
        </h1>
      </header>

      <ServiceForm
        categories={categories}
        initial={{
          id: service.id,
          title: service.title,
          description: service.description ?? undefined,
          categoryId: service.category_id,
          subcategory: service.subcategory ?? undefined,
          pricing: service.pricing,
          priceFrom: service.price_from,
          priceTo: service.price_to,
          unit: service.unit ?? undefined,
          scope: service.scope,
          materialIncluded: service.material_included,
          labourIncluded: service.labour_included,
          minOrder: service.min_order,
          maxCapacity: service.max_capacity,
          capacityUnit: service.capacity_unit ?? undefined,
          workStatus: service.work_status,
          nextAvailableOn: service.next_available_on,
          leadTimeDays: service.lead_time_days,
          completionDays: service.completion_days,
          locationCity: service.location_city ?? undefined,
          serviceRadiusKm: service.service_radius_km,
          servesRemotely: service.serves_remotely,
          yearsExperience: service.years_experience,
          phone: service.phone ?? undefined,
          whatsapp: service.whatsapp ?? undefined,
          coverImageUrl: service.cover_image_url,
          videoUrl: service.video_url,
          acceptingWork: service.accepting_work,
        }}
      />
    </div>
  );
}
