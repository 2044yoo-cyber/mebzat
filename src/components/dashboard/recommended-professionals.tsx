import { Users } from "lucide-react";

import { ProfileCard } from "@/components/profile/profile-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export async function RecommendedProfessionals({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select(
      "username, full_name, company_name, avatar_url, account_type, location_city, location_country",
    )
    .neq("id", currentUserId)
    .not("account_type", "is", null)
    .not("username", "is", null)
    .order("created_at", { ascending: false })
    .limit(4);

  return (
    <Card className="p-5">
      <CardHeader className="p-0">
        <CardTitle>Recommended professionals</CardTitle>
        <CardDescription>People and companies you may want to connect with.</CardDescription>
      </CardHeader>

      {profiles && profiles.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {profiles.map((profile) => (
            <ProfileCard key={profile.username} profile={profile} />
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <Users className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            We&apos;ll recommend professionals here once more of the network
            joins Medosha.
          </p>
        </div>
      )}
    </Card>
  );
}
