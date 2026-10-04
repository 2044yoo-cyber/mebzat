import { notFound } from "next/navigation";

import { PunchList } from "@/components/agenda/site/punch-list";
import { getProjectPeople, getPunchItems } from "@/lib/data/agenda-site";
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
    getPunchItems(projectId),
    getProjectPeople(projectId),
  ]);

  return <PunchList projectId={projectId} items={items} people={people} />;
}
