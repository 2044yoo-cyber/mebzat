import { notFound, redirect } from "next/navigation";

import { TaskPanel } from "@/components/agenda/task-panel";
import { agendaMembers, agendaTasks } from "@/lib/data/agenda";
import { getAgendaProject } from "@/lib/data/agenda-projects";
import { createClient } from "@/lib/supabase/server";

/**
 * Tasks, in the project workspace.
 *
 * `TaskPanel` is 0024's, reused rather than rewritten. It takes a project id,
 * the tasks and the roster, and 0089 repointed `agenda_tasks` at
 * `agenda_projects` — so the same component, the same action and the same
 * table serve both screens, and a second task form would be a second place for
 * "assigned to somebody who is not on the project" to be wrong.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  // Each page asks for the project again rather than trusting the layout.
  // A layout cannot hand data to a page in the App Router, and a page that
  // assumed the layout had already checked access would be a page that is
  // reachable without the check when it is rendered another way.
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/agenda/projects/${projectId}/tasks`);

  const [tasks, members] = await Promise.all([
    agendaTasks(projectId),
    agendaMembers(projectId),
  ]);

  return (
    <TaskPanel
      projectId={projectId}
      tasks={tasks}
      members={members}
      myUserId={user.id}
    />
  );
}
