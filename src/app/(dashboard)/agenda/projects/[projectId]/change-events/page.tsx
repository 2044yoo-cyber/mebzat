import { notFound } from "next/navigation";

import { ChangeEvents } from "@/components/agenda/money/change-events";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import { getChangeEvents, getMoneyAccess } from "@/lib/data/agenda-money";
import { getRfis } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const access = await getMoneyAccess(projectId);
  if (!access.finance) return <NoMoneyAccess what="Change events" />;

  const [events, rfis] = await Promise.all([
    getChangeEvents(projectId),
    getRfis(projectId),
  ]);

  return <ChangeEvents projectId={projectId} events={events} rfis={rfis} />;
}
