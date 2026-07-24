import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";

import { ProfileCard } from "@/components/profile/profile-card";
import { ACCOUNT_TYPE_MAP } from "@/lib/constants/account-types";
import { createClient } from "@/lib/supabase/server";
import type { AccountType } from "@/types/database.types";

function isAccountType(value: string): value is AccountType {
  return value in ACCOUNT_TYPE_MAP;
}

export async function generateMetadata(props: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await props.params;
  const entry = isAccountType(type) ? ACCOUNT_TYPE_MAP[type] : null;
  return { title: entry ? `Find ${entry.label}s` : "Directory" };
}

export default async function DirectoryPage(props: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await props.params;

  if (!isAccountType(type)) {
    notFound();
  }

  const entry = ACCOUNT_TYPE_MAP[type];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const query = supabase
    .from("profiles")
    .select(
      "username, full_name, company_name, avatar_url, account_type, location_city, location_country",
    )
    .eq("account_type", type)
    .not("username", "is", null)
    .order("created_at", { ascending: false })
    .limit(24);

  const { data: profiles } = user
    ? await query.neq("id", user.id)
    : await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Find {entry.label}s
        </h1>
        <p className="text-muted-foreground">{entry.description}</p>
      </div>

      {profiles && profiles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <ProfileCard key={profile.username} profile={profile} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-12 text-center">
          <Users className="size-8 text-muted-foreground" />
          <p className="font-medium">No {entry.label.toLowerCase()}s yet</p>
          <p className="text-sm text-muted-foreground">
            Check back soon as more of the network joins Medosha.
          </p>
        </div>
      )}
    </div>
  );
}
