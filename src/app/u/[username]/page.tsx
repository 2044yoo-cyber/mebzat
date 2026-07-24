import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ProfileDisplay } from "@/components/profile/profile-display";
import { ProfileProjects } from "@/components/projects/profile-projects";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await props.params;
  return { title: `@${username}` };
}

export default async function PublicProfilePage(props: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await props.params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!profile) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === profile.id;

  if (!isOwner) {
    await supabase.rpc("increment_profile_views", { profile_id: profile.id });
  }

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-6 py-10">
        <ProfileDisplay profile={profile} isOwner={isOwner} />
        <ProfileProjects ownerId={profile.id} includeDrafts={isOwner} />
      </main>
      <SiteFooter />
    </div>
  );
}
