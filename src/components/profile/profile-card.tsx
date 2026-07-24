import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ACCOUNT_TYPE_MAP } from "@/lib/constants/account-types";
import type { AccountType } from "@/types/database.types";

export type ProfileCardData = {
  username: string | null;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  account_type: AccountType | null;
  location_city: string | null;
  location_country: string | null;
};

export function ProfileCard({ profile }: { profile: ProfileCardData }) {
  const displayName = profile.company_name || profile.full_name || "Unnamed";
  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const accountType = profile.account_type
    ? ACCOUNT_TYPE_MAP[profile.account_type]
    : null;
  const location = [profile.location_city, profile.location_country]
    .filter(Boolean)
    .join(", ");

  const content = (
    <Card className="h-full items-start gap-3 p-4 transition-shadow hover:shadow-md">
      <div className="flex w-full items-center gap-3">
        <Avatar className="size-11">
          <AvatarImage src={profile.avatar_url ?? undefined} alt={displayName} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{displayName}</p>
          {location && (
            <p className="truncate text-xs text-muted-foreground">{location}</p>
          )}
        </div>
      </div>
      {accountType && <Badge variant="secondary">{accountType.label}</Badge>}
    </Card>
  );

  if (!profile.username) {
    return content;
  }

  return (
    <Link href={`/u/${profile.username}`} className="block">
      {content}
    </Link>
  );
}
