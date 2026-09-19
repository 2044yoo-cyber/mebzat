import { notFound } from "next/navigation";

import { BudgetTable } from "@/components/agenda/money/budget-table";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import { getBudgetItems, getMoneyAccess } from "@/lib/data/agenda-money";
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
  if (!access.finance) return <NoMoneyAccess what="The budget" />;

  const items = await getBudgetItems(projectId);
  return <BudgetTable projectId={projectId} items={items} />;
}
