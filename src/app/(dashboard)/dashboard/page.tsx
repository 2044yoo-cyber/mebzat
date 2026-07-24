import Link from "next/link";
import { ArrowRight, Building2, MapPin } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ACCOUNT_TYPE_MAP } from "@/lib/constants/account-types";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, account_type, location_city, location_country")
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        <Card className="flex flex-col justify-between p-5">
          <CardHeader className="p-0">
            <CardTitle>Complete your profile</CardTitle>
            <CardDescription>
              A complete profile gets discovered more often in search and on
              the map.
            </CardDescription>
          </CardHeader>
          <Link
            href="/profile/edit"
            className={cn(buttonVariants({ size: "sm" }), "mt-4 w-fit")}
          >
            Edit profile <ArrowRight className="size-4" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
