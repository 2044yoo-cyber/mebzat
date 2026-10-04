import type { Metadata } from "next";
import Link from "next/link";

import { AgentProfileForm } from "@/components/profile/agent-profile-form";
import { requireViewer } from "@/lib/auth/session";
import { agentAreasFor, agentProfileFor } from "@/lib/data/role-profiles";
import { listAreas } from "@/lib/data/professionals";
import { hasRole } from "@/lib/profile/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agent profile" };

export default async function AgentProfilePage() {
  const viewer = await requireViewer("/profile/agent");
  const supabase = await createClient();

  const [{ data: profile }, agent, areas, mine] = await Promise.all([
    supabase
      .from("profiles")
      .select("roles, primary_role")
      .eq("id", viewer.id)
      .maybeSingle(),
    agentProfileFor(viewer.id),
    listAreas(),
    agentAreasFor(viewer.id),
  ]);

  // Not a gate. Somebody who reaches this screen before ticking the role can
  // still fill it in — the work is not thrown away — and is told where the
  // switch is rather than turned around at the door.
  const chosen = profile ? hasRole(profile, "agent") : false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent profile</h1>
        <p className="text-muted-foreground">
          What buyers and tenants see when they find one of your listings.
        </p>
      </div>

      {!chosen && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          You have not turned the agent role on yet. Fill this in now if you
          like — then tick <span className="font-medium">Real estate agent</span>{" "}
          in{" "}
          <Link href="/settings" className="font-medium underline">
            Settings
          </Link>{" "}
          to publish it.
        </p>
      )}

      <AgentProfileForm
        agent={agent}
        areas={areas}
        selectedAreas={mine.map((area) => area.slug)}
      />
    </div>
  );
}
