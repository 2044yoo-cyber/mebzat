import { notFound } from "next/navigation";

import { ChangeOrders } from "@/components/agenda/money/change-orders";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import {
  getChangeEvents,
  getChangeOrders,
  getContracts,
  getMoneyAccess,
} from "@/lib/data/agenda-money";
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
  if (!access.finance) return <NoMoneyAccess what="Change orders" />;

  const [orders, contracts, events] = await Promise.all([
    getChangeOrders(projectId),
    getContracts(projectId),
    getChangeEvents(projectId),
  ]);

  return (
    <ChangeOrders
      projectId={projectId}
      orders={orders}
      contracts={contracts}
      events={events}
    />
  );
}
