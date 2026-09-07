import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChevronLeft, FolderOpen } from "lucide-react";

import { SavedList } from "@/components/calculators/saved-list";
import { listSavedCalculations } from "@/lib/calculators/saved";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved calculations" };
export const dynamic = "force-dynamic";

export default async function SavedCalculationsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?redirect=${encodeURIComponent("/calculators/saved")}`);

  const saved = await listSavedCalculations();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-[calc(var(--bottom-nav-h)+1.5rem)] sm:px-6 lg:pb-10">
      <Link
        href="/calculators"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All calculators
      </Link>

      <h1 className="text-2xl font-semibold sm:text-3xl">Saved calculations</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        The inputs are what is stored, so opening one runs the calculator again rather than showing
        an old answer.
      </p>

      <div className="mt-6">
        {saved === null ? (
          // Not the same as "you have nothing saved", and saying so is the
          // difference between a reader waiting and a reader giving up.
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <p className="text-sm font-medium">Your saved calculations are not reachable</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing has been lost. Try again in a moment.
            </p>
          </div>
        ) : saved.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <FolderOpen className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Nothing saved yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Work something out, name it, and it will be here from any device.
            </p>
            <Link
              href="/calculators"
              className="mt-4 inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Open a calculator
            </Link>
          </div>
        ) : (
          <SavedList saved={saved} />
        )}
      </div>
    </div>
  );
}
