import { notFound } from "next/navigation";

import { MeetingPanel } from "@/components/agenda/meeting-panel";
import { agendaMeetings } from "@/lib/data/agenda";
import { getAgendaProject } from "@/lib/data/agenda-projects";

/**
 * Minutes, client decisions, design changes, approvals.
 *
 * As with the daily log, this is 0024's panel reused. Meetings are gated on
 * `can_view_meetings` in the database, so a member without that permission
 * gets an empty list here — which is the correct answer and is given by the
 * policy rather than by this page.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const meetings = await agendaMeetings(projectId);

  return <MeetingPanel projectId={projectId} meetings={meetings} />;
}
