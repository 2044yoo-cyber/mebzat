import { notFound } from "next/navigation";

import { DailyLogPanel } from "@/components/agenda/daily-log-panel";
import { agendaLogs } from "@/lib/data/agenda";
import { getAgendaProject } from "@/lib/data/agenda-projects";

/**
 * The daily site log, in the project workspace.
 *
 * `DailyLogPanel` is the panel 0024's Agenda already had, reused rather than
 * rewritten. It takes a project id and a list of logs and nothing else, and
 * the logs themselves moved to `agenda_projects` in 0089 — so the same
 * component, the same action and the same table serve both screens. A second
 * daily log form would be a second place for "one entry per day" to be wrong.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const logs = await agendaLogs(projectId);

  return <DailyLogPanel projectId={projectId} logs={logs} />;
}
