import { notFound } from "next/navigation";

import { Progress360 } from "@/components/agenda/site/progress-360";
import {
  getFinishedPanoramas,
  getProgressPanoramas,
} from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const [panoramas, available] = await Promise.all([
    getProgressPanoramas(projectId),
    getFinishedPanoramas(),
  ]);

  return (
    <Progress360
      projectId={projectId}
      panoramas={panoramas}
      available={available}
    />
  );
}
