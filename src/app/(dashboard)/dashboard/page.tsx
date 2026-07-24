import { redirect } from "next/navigation";

import { NearbySuppliersMap } from "@/components/dashboard/nearby-suppliers-map";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { RecentMessagesPreview } from "@/components/dashboard/recent-messages-preview";
import { RecentNotifications } from "@/components/dashboard/recent-notifications";
import { RecommendedProfessionals } from "@/components/dashboard/recommended-professionals";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { TrendingProducts } from "@/components/dashboard/trending-products";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { ProfileCompletionCard } from "@/components/profile/profile-completion-card";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
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
    redirect("/login");
  }

  const { count: projectCount } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <WelcomeCard profile={profile} />
        <ProfileCompletionCard profile={profile} />
      </div>

      <QuickActions />

      <StatsGrid profile={profile} projectCount={projectCount ?? 0} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <RecentActivity profile={profile} />
          <RecommendedProfessionals currentUserId={user.id} />
          <TrendingProducts />
        </div>

        <div className="space-y-6">
          <NearbySuppliersMap />
          <RecentMessagesPreview />
          <RecentNotifications />
        </div>
      </div>
    </div>
  );
}
