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

  // A task made from a pin opens the drawing, photo or PDF at the pin.
  const taskIds = tasks.map((task) => task.id);
  const { data: pins } = taskIds.length
    ? await supabase
        .from("agenda_pins")
        .select("id, number, plan_id, sketch_id, task_id")
        .eq("project_id", projectId)
        .in("task_id", taskIds)
    : { data: [] };
  const drawings = Object.fromEntries(
    (pins ?? [])
      .filter((pin) => pin.task_id && pin.plan_id)
      .map((pin) => [
        pin.task_id!,
        {
          href: `/house-design?plan=${pin.plan_id}${pin.sketch_id ? `&sketch=${pin.sketch_id}` : ""}&pin=${pin.id}`,
          label: `Open ${pin.number} on the drawing`,
        },
      ]),
  );

  return (
    <TaskPanel
      projectId={projectId}
      tasks={tasks}
      members={members}
      myUserId={user.id}
      drawings={drawings}
    />
  );
}
