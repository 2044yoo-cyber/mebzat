import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Settings } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed p-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-brand/10">
        <Settings className="size-6 text-brand" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-md text-muted-foreground">
          Account settings are on the way. For now, you can update your public
          profile details.
        </p>
      </div>
      <Link
        href="/profile/edit"
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        <Pencil className="size-4" /> Edit profile
      </Link>
    </div>
  );
}
