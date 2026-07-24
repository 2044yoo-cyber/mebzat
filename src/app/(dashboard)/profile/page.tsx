import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Briefcase,
  Globe,
  Languages,
  MapPin,
  Pencil,
  Phone,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ACCOUNT_TYPE_MAP } from "@/lib/constants/account-types";
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
    redirect("/onboarding");
  }

  const accountType = profile.account_type
    ? ACCOUNT_TYPE_MAP[profile.account_type]
    : null;
  const displayName = profile.company_name || profile.full_name || "Unnamed";
  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border">
        <div
          className="h-40 bg-muted sm:h-56"
          style={
            profile.cover_url
              ? {
                  backgroundImage: `url(${profile.cover_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        />
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
            <Avatar className="-mt-16 size-24 border-4 border-background bg-background sm:-mt-20 sm:size-28">
              <AvatarImage src={profile.avatar_url ?? undefined} alt={displayName} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">
                  {displayName}
                </h1>
                {accountType && <Badge variant="secondary">{accountType.label}</Badge>}
              </div>
              {profile.username && (
                <p className="text-sm text-muted-foreground">
                  @{profile.username}
                </p>
              )}
            </div>
          </div>

          <Link href="/profile/edit" className={buttonVariants({ variant: "outline" })}>
            <Pencil className="size-4" /> Edit profile
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground">About</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {profile.bio || "No bio yet."}
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border p-5 text-sm">
          {(profile.location_city || profile.location_country) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4 shrink-0" />
              {[profile.location_city, profile.location_country]
                .filter(Boolean)
                .join(", ")}
            </div>
          )}
          {profile.website && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="size-4 shrink-0" />
              <a
                href={profile.website}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate hover:text-foreground hover:underline"
              >
                {profile.website}
              </a>
            </div>
          )}
          {profile.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4 shrink-0" />
              {profile.phone}
            </div>
          )}
          {typeof profile.years_experience === "number" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Briefcase className="size-4 shrink-0" />
              {profile.years_experience} years of experience
            </div>
          )}
          {profile.languages.length > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Languages className="size-4 shrink-0" />
              {profile.languages.join(", ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
