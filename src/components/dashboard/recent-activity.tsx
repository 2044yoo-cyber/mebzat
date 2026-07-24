import { Sparkles, UserCircle } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import type { Profile } from "@/types/database.types";

export function RecentActivity({ profile }: { profile: Profile }) {
  const hasUpdated =
    new Date(profile.updated_at).getTime() -
      new Date(profile.created_at).getTime() >
    60_000;

  const events = [
    hasUpdated
      ? {
          icon: UserCircle,
          text: "You updated your profile",
          at: profile.updated_at,
        }
      : null,
    {
      icon: Sparkles,
      text: "You joined Medosha",
      at: profile.created_at,
    },
  ].filter((e) => e !== null);

  return (
    <Card className="p-5">
      <CardHeader className="p-0">
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <ul className="mt-4 space-y-4">
        {events.map((event, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <event.icon className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p>{event.text}</p>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(event.at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
