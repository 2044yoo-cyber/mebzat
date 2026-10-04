import { notFound } from "next/navigation";

import { ProjectSettings } from "@/components/agenda/site/project-settings";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  return <ProjectSettings project={project} />;
}
