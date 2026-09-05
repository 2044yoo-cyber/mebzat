import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UserCog } from "lucide-react";

import { AddAdmin } from "@/components/admin/add-admin";
import { TeamMemberRow } from "@/components/admin/team-member-row";
import { listTeam } from "@/lib/admin/team";

export const metadata: Metadata = { title: "Team — control room" };
export const dynamic = "force-dynamic";

/**
 * Who runs the platform.
 *
 * Owner only. `listTeam` returns null for anybody else — including another
 * administrator — and null becomes a 404 rather than a refusal, for the same
 * reason the whole of /admin does: a refusal confirms the address is real.
 */
export default async function AdminTeamPage() {
  const team = await listTeam();
  if (!team) notFound();

  const others = team.filter((one) => !one.isOwner);

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-medium">Team</h2>
        <p className="text-sm text-muted-foreground">
          You are the main administrator. Everyone else holds only what you tick
          here, and every page and button checks it on the server.
        </p>
      </header>

      <AddAdmin />

      <ul className="space-y-2">
        {team.map((member) => (
          <TeamMemberRow key={member.userId} member={member} />
        ))}
      </ul>

      {others.length === 0 && (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <UserCog className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">You are on your own here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add somebody above and give them just the areas they need.
          </p>
        </div>
      )}
    </div>
  );
}
