import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Recycle } from "lucide-react";

import { OffcutInventory } from "@/features/berchuma-studio/components/offcut-inventory";
import { listOffcuts } from "@/features/berchuma-studio/services/offcuts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Offcut Inventory | Berchuma Studio",
  description: "Track measured MDF and board remnants between cabinet and wardrobe projects.",
};

export default async function OffcutInventoryPage() {
  let authenticated = false;
  try {
    const supabase = await createClient();
    const result = await supabase.auth.getUser();
    authenticated = Boolean(result.data.user);
  } catch {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Offcut inventory unavailable</h1>
        <p className="text-sm text-muted-foreground">Medosha could not connect to the account database. Check the Supabase connection and try again.</p>
        <Link href="/studio" className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-4"><ArrowLeft className="size-4" /> Back to Studio</Link>
      </main>
    );
  }

  if (!authenticated) redirect("/login?redirect=%2Fstudio%2Foffcuts");

  let offcuts: Awaited<ReturnType<typeof listOffcuts>> = [];
  let inventoryError: string | null = null;
  try {
    offcuts = await listOffcuts();
  } catch {
    inventoryError = "The inventory table is not available yet. Apply supabase/migrations/0073_offcut_inventory.sql to the Medosha Supabase project, then reload this page.";
  }
  const readyCount = offcuts.filter((item) => item.status === "available").length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/studio" className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted">
          <ArrowLeft className="size-4" /> Back to Berchuma Studio
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm">
          <Recycle className="size-4" /> {readyCount} available
        </span>
      </div>
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Berchuma Studio · Workshop tools</p>
        <h1 className="text-3xl font-semibold tracking-tight">Offcut Inventory</h1>
        <p className="max-w-3xl text-muted-foreground">
          Record the actual dimensions of leftover MDF, plywood and other sheet materials. Your inventory is saved to your account, so it follows you between projects and devices. Check every remnant in the workshop before reuse.
        </p>
      </header>
      {inventoryError ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{inventoryError}</p> : null}
      <OffcutInventory initialItems={offcuts} />
      <p className="text-xs text-muted-foreground">
        Inventory records are not yet automatically deducted from a new project's board purchase estimate. That requires a separate stock-matching and reservation step so one remnant cannot be promised to two projects.
      </p>
    </main>
  );
}
