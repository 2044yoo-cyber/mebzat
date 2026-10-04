import { notFound } from "next/navigation";

import { AgendaTimeline } from "@/components/agenda/timeline";
import { agendaReminders, agendaTimeline } from "@/lib/data/agenda";
import { getAgendaProject } from "@/lib/data/agenda-projects";

/**
 * What has happened, in order.
 *
 * The timeline is written by triggers on the tables themselves — 0024 put
 * `agenda_*_timeline` on logs, tasks, the ledger, meetings and decisions — so
 * this reads a record nothing here maintains. That is the point: an activity
 * log an application writes is an activity log that misses whatever the
 * application forgot.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const [events, reminders] = await Promise.all([
    agendaTimeline(projectId),
    agendaReminders(projectId),
  ]);

  return <AgendaTimeline events={events} reminders={reminders} />;
}
