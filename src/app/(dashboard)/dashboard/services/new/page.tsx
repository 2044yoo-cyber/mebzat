import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ServiceForm } from "@/components/services/service-form";
import { getServiceCategories } from "@/lib/data/services";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add a service" };

export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/services/new");

  const categories = await getServiceCategories();

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
        <h1 className="text-2xl font-semibold tracking-tight">Add a service</h1>
        <p className="mt-1 text-muted-foreground">
          This becomes an independent listing with its own price, capacity,
          availability and analytics.
        </p>
      </header>

      <ServiceForm categories={categories} />
    </div>
  );
}
