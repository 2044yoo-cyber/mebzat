import { notFound } from "next/navigation";

import { FormRunner } from "@/components/agenda/site/form-runner";
import { getFormSubmissions, getFormTemplates } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const [templates, submissions] = await Promise.all([
    getFormTemplates(projectId),
    getFormSubmissions(projectId),
  ]);

  return (
    <FormRunner
      projectId={projectId}
      templates={templates}
      submissions={submissions}
    />
  );
}
