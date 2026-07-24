import { redirect } from "next/navigation";

import { ProfileDisplay } from "@/components/profile/profile-display";
import { ProfileProjects } from "@/components/projects/profile-projects";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-8">
      <ProfileDisplay profile={profile} isOwner />
      <ProfileProjects ownerId={profile.id} includeDrafts />
    </div>
  );
}
