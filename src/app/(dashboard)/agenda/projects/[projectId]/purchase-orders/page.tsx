import { notFound } from "next/navigation";

import { PurchaseOrders } from "@/components/agenda/money/purchase-orders";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import {
  getCommitments,
  getMoneyAccess,
  getPurchaseOrders,
} from "@/lib/data/agenda-money";
import { getSubmittals } from "@/lib/data/agenda-site";
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
  if (!access.finance) return <NoMoneyAccess what="Purchase orders" />;

  const [orders, commitments, submittals] = await Promise.all([
    getPurchaseOrders(projectId),
    getCommitments(projectId),
    // Submittals are a site record, not a money one, so any member sees them.
    // Ordering against the revision that was approved is the point.
    getSubmittals(projectId),
  ]);

  return (
    <PurchaseOrders
      projectId={projectId}
      orders={orders}
      commitments={commitments}
      submittals={submittals}
    />
  );
}
