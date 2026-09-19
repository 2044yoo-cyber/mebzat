import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RolePicker } from "@/components/profile/role-picker";
import { requireViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Welcome · Medosha" };

/**
 * The one question a new account is asked.
 *
 * Only new ones. 0097 marked every profile that already existed as onboarded,
 * so somebody who has been using Medosha for a year never sees this — and
 * anybody who has already answered is sent on rather than asked twice, which
 * is what the redirect below is for.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireViewer("/welcome");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/welcome");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <RolePicker
        greeting={profile?.full_name?.split(" ")[0] ?? null}
        failed={error === "1"}
      />
    </div>
  );
}
