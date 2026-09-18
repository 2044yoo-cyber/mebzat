import { notFound } from "next/navigation";

import { SubmittalRegister } from "@/components/agenda/site/submittal-register";
import { getProjectPeople, getSubmittals } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const [submittals, people] = await Promise.all([
    getSubmittals(projectId),
    getProjectPeople(projectId),
  ]);

  return (
    <SubmittalRegister
      projectId={projectId}
      submittals={submittals}
      people={people}
    />
  );
}
