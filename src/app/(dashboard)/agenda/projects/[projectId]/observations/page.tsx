import { notFound } from "next/navigation";

import { ObservationList } from "@/components/agenda/site/observation-list";
import { getObservations, getProjectPeople } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const [observations, people] = await Promise.all([
    getObservations(projectId),
    getProjectPeople(projectId),
  ]);

  return (
    <ObservationList
      projectId={projectId}
      observations={observations}
      people={people}
    />
  );
}
