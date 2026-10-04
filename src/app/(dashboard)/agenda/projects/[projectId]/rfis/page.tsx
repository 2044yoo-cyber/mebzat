import { notFound } from "next/navigation";

import { RfiRegister } from "@/components/agenda/site/rfi-register";
import { getProjectPeople, getRfis } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  // Each page asks for the project again rather than trusting the layout.
  // A layout cannot hand data to a page in the App Router, and a page that
  // assumed the layout had already checked access would be a page that is
  // reachable without the check when it is rendered another way.
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const [rfis, people] = await Promise.all([
    getRfis(projectId),
    getProjectPeople(projectId),
  ]);

  return <RfiRegister projectId={projectId} rfis={rfis} people={people} />;
}
