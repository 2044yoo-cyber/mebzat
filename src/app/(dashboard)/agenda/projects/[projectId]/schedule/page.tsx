import { notFound } from "next/navigation";

import { ScheduleBoard } from "@/components/agenda/site/schedule-board";
import { getProjectPeople, getScheduleItems } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const [items, people] = await Promise.all([
    getScheduleItems(projectId),
    getProjectPeople(projectId),
  ]);

  return <ScheduleBoard projectId={projectId} items={items} people={people} />;
}
