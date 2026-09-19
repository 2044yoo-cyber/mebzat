import { notFound } from "next/navigation";

import { PlantList } from "@/components/agenda/site/plant-list";
import { getEquipment } from "@/lib/data/agenda-billing";
import { getAgendaProject } from "@/lib/data/agenda-projects";

/** Plant is a site record too: a crane being here is not what it cost. */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const items = await getEquipment(projectId);
  return <PlantList projectId={projectId} items={items} />;
}
