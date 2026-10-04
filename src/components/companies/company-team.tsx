import Link from "next/link";
import { Users } from "lucide-react";

import {
  VerifiedBadge,
  verificationLevelOf,
} from "@/components/profile/verified-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { CompanyTeamMember } from "@/lib/data/company-profile";

/**
 * Who works here.
 *
 * Only members whose status is `active` — an invitation nobody accepted is not
 * a colleague, and listing one would let a business pad its team with people
 * who never joined. Each name links to the person's own profile, so the
 * reputation on the business and the reputation on the individual stay
 * connected rather than being two unrelated pages.
 */
const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Team",
};

export function CompanyTeam({ team }: { team: CompanyTeamMember[] }) {
  if (team.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        <Users className="mx-auto mb-2 size-5" />
        Nobody has been added to this team yet.
      </div>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {team.map((entry) => {
        const person = entry.member;
        const name = person?.full_name || (person?.username ? `@${person.username}` : "A team member");
        const initials = name
          .replace(/^@/, "")
          .split(" ")
          .map((part) => part[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        const level = person ? verificationLevelOf(person) : null;

        const inner = (
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <Avatar className="size-10">
              <AvatarImage src={person?.avatar_url ?? undefined} alt={name} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                {name}
                {level && <VerifiedBadge level={level} showLabel={false} />}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {entry.title || ROLE_LABEL[entry.role] || entry.role}
              </p>
            </div>
            {entry.role === "owner" && <Badge variant="secondary">Owner</Badge>}
          </div>
        );

        return (
          <li key={entry.id}>
            {person?.username ? (
              <Link
                href={`/u/${person.username}`}
                className="block transition-colors hover:bg-muted/50 [&>div]:hover:bg-muted/50"
              >
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
