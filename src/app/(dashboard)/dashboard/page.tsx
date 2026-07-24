import { Building2, MapPin } from "lucide-react";

import { ProfileCompletionCard } from "@/components/profile/profile-completion-card";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ACCOUNT_TYPE_MAP } from "@/lib/constants/account-types";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const accountType = profile?.account_type
    ? ACCOUNT_TYPE_MAP[profile.account_type]
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening with your Medosha presence.
        </p>
      </div>

      {profile && <ProfileCompletionCard profile={profile} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <CardHeader className="p-0">
            <Building2 className="size-5 text-brand" />
            <CardTitle className="mt-2">
              {accountType?.label ?? "Account type"}
            </CardTitle>
            <CardDescription>
              {accountType?.description ?? "Not set yet"}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="p-5">
          <CardHeader className="p-0">
            <MapPin className="size-5 text-brand" />
            <CardTitle className="mt-2">
              {profile?.location_city || profile?.location_country
                ? [profile?.location_city, profile?.location_country]
                    .filter(Boolean)
                    .join(", ")
                : "Location"}
            </CardTitle>
            <CardDescription>Where you&apos;re based</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
