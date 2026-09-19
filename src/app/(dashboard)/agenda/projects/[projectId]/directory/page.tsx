import { notFound, redirect } from "next/navigation";

import { TeamPanel } from "@/components/agenda/team-panel";
import { agendaMembers } from "@/lib/data/agenda";
import { getAgendaProject } from "@/lib/data/agenda-projects";
import { createClient } from "@/lib/supabase/server";

/**
 * Who is on the project, and what each of them may see.
 *
 * This is where the finance and contracts permissions the money screens ask
 * about are actually granted, which is why those screens send people here by
 * name. `TeamPanel` is 0024's, and the guard that stops a member editing their
 * own permissions is `agenda_guard_member_update` in the database rather than
 * anything in the component.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/agenda/projects/${projectId}/directory`);

  const members = await agendaMembers(projectId);
  const me = members.find((member) => member.user_id === user.id);

  return (
    <TeamPanel
      projectId={projectId}
      members={members}
      // The owner column on the project, not a role on the roster: an owner
      // whose membership row was edited must not lose control of their own
      // project.
      isOwner={me?.role === "administrator"}
      myUserId={user.id}
      myRole={me?.role ?? "employee"}
    />
  );
}
