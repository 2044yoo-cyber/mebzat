import { notFound } from "next/navigation";

import { ContractList } from "@/components/agenda/money/contract-list";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import { getContracts, getMoneyAccess } from "@/lib/data/agenda-money";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  // Contracts have their own permission, separate from finance: 0091 gates
  // them on `agenda_can_view_contracts`, because a quantity surveyor who
  // prices the work is not necessarily shown what the client signed.
  const access = await getMoneyAccess(projectId);
  if (!access.contracts) return <NoMoneyAccess what="The contract register" />;

  const contracts = await getContracts(projectId);
  return <ContractList projectId={projectId} contracts={contracts} />;
}
