import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ACCOUNT_TYPE_MAP } from "@/lib/constants/account-types";
import type { Profile } from "@/types/database.types";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function WelcomeCard({ profile }: { profile: Profile }) {
  const displayName = profile.company_name || profile.full_name || "there";
  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const accountType = profile.account_type
    ? ACCOUNT_TYPE_MAP[profile.account_type]
    : null;

  return (
    <Card className="h-full justify-center p-5">
      <CardHeader className="flex-row items-center gap-4 p-0">
        <Avatar className="size-14">
          <AvatarImage src={profile.avatar_url ?? undefined} alt={displayName} />
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-lg font-semibold tracking-tight">
            {getGreeting()}, {displayName}
          </p>
          {accountType ? (
            <Badge variant="secondary">{accountType.label}</Badge>
          ) : (
            <p className="text-sm text-muted-foreground">
              Here&apos;s what&apos;s happening with your Medosha presence.
            </p>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
