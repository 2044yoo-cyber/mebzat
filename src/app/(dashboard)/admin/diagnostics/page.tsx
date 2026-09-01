import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Activity } from "lucide-react";

import { Diagnostics } from "@/components/admin/diagnostics";
import { isAdmin } from "@/lib/auth/admin";

export const metadata: Metadata = { title: "Provider diagnostics" };
export const dynamic = "force-dynamic";

/**
 * Provider diagnostics.
 *
 * The operational view: every provider, its status, when it last actually
 * produced an image, what it last failed with, which models it offers and
 * whatever it discloses about remaining quota.
 *
 * `notFound()` rather than a redirect for a non-admin, so the page does not
 * confirm its own existence to someone who may not have it.
 */
export default async function DiagnosticsPage() {
  if (!(await isAdmin())) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Activity className="size-5 text-brand" />
          Provider diagnostics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What each AI provider is doing right now. Statuses come from a live
          probe; the success and error times come from real generations.
        </p>
      </header>

      <Diagnostics />
    </div>
  );
}
