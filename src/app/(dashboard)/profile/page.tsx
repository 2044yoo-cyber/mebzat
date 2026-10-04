import { redirect } from "next/navigation";

import { ProfileCompletionCard } from "@/components/profile/profile-completion-card";
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
      {/* The same card, from the same function, as the Dashboard. The two used
          to disagree because there were two rules; showing it in both places
          is how that stays visible if it ever happens again. */}
      <ProfileCompletionCard profile={profile} />
      <ProfileDisplay profile={profile} isOwner />
      <ProfileProjects ownerId={profile.id} includeDrafts />
    </div>
  );
}
