import { notFound } from "next/navigation";

import { SectionShell } from "@/components/agenda/shell/section-shell";
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

  return (
    <SectionShell
      title="Tasks"
      blurb="Everything assigned on this project."
      projectId={projectId}
      section="tasks"
    />
  );
}
