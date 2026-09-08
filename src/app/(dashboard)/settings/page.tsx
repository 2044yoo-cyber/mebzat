import type { Metadata } from "next";
import Link from "next/link";
import { Pencil } from "lucide-react";

import { WatermarkSettingsForm } from "@/components/settings/watermark-settings-form";
import { buttonVariants } from "@/components/ui/button";
import {
  DEFAULT_WATERMARK,
  normaliseSettings,
  type WatermarkSettings,
} from "@/lib/images/watermark-settings";
import { cn } from "@/lib/utils";
import { requireViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  // Account settings belong to somebody. Gate it here: the layout used to
  // do this for the whole folder and no longer does.
  const viewer = await requireViewer("/settings");
  const supabase = await createClient();

  const [{ data: watermark }, { data: profile }] = await Promise.all([
    supabase
      .from("watermark_settings")
      .select(
        "enabled, use_username, use_display_name, use_company, use_logo, use_phone, position, size, opacity",
      )
      .eq("user_id", viewer.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("username, full_name, company_name, phone, avatar_url")
      .eq("id", viewer.id)
      .maybeSingle(),
  ]);

  // Somebody who has never opened this screen still has a watermark — the
  // default one — so the form has to show them what is already happening
  // rather than an empty state.
  const initial: WatermarkSettings = watermark
    ? normaliseSettings(watermark as Partial<WatermarkSettings>)
    : { ...DEFAULT_WATERMARK };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Privacy and security for your account.
        </p>
      </header>

      <WatermarkSettingsForm
        initial={initial}
        identity={{
          username: profile?.username ?? null,
          fullName: profile?.full_name ?? null,
          companyName: profile?.company_name ?? null,
          hasPhone: Boolean(profile?.phone),
          hasAvatar: Boolean(profile?.avatar_url),
        }}
      />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 sm:p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Public profile</h2>
          <p className="text-sm text-muted-foreground">
            Your name, photo, bio and contact details.
          </p>
        </div>
        <Link
          href="/profile/edit"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <Pencil className="size-4" /> Edit profile
        </Link>
      </section>
    </div>
  );
}
