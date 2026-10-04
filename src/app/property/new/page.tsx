import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";

import { PropertyForm } from "@/components/property/property-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "List a property",
  description:
    "List your property on Medosha with photos, floor plans and an optional 360° virtual tour.",
};

export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signing in first means the form is never filled in and then lost.
  if (!user) redirect("/login?redirect=/property/new");

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/city"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to the map
        </Link>

        <header className="mt-4 mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="size-4" /> Sell or rent
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            List your property
          </h1>
          <p className="mt-1 text-muted-foreground">
            Put it on the map where buyers are already looking. It takes a few
            minutes.
          </p>
        </header>

        <PropertyForm />
      </div>
    </div>
  );
}
