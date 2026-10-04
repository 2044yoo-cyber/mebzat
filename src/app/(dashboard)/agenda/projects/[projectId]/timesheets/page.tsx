import { notFound } from "next/navigation";

import { TimesheetBoard } from "@/components/agenda/site/timesheet-board";
import { getTimesheets } from "@/lib/data/agenda-billing";
import { getScheduleItems } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

/**
 * Hours are a site record, not a money one.
 *
 * 0091 put timesheets and plant with the site tables deliberately, so there is
 * no finance gate here: the supervisor who knows who turned up should not need
 * to be shown the contract sum before they can say so.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const [rows, activities] = await Promise.all([
    getTimesheets(projectId),
    getScheduleItems(projectId),
  ]);

  return (
    <TimesheetBoard
      projectId={projectId}
      rows={rows}
      activities={activities}
    />
  );
}
