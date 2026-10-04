import { notFound } from "next/navigation";

import { CommitmentList } from "@/components/agenda/money/commitment-list";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import {
  getBudgetItems,
  getCommitments,
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
  if (!access.finance) return <NoMoneyAccess what="Commitments" />;

  // Contracts are fetched for the picker and may come back empty when the
  // viewer has finance but not contracts. That is correct: they can commit
  // money without being shown what the client signed, and the picker simply
  // offers nothing to commit it against.
  const [commitments, contracts, budgetItems] = await Promise.all([
    getCommitments(projectId),
    getContracts(projectId),
    getBudgetItems(projectId),
  ]);

  return (
    <CommitmentList
      projectId={projectId}
      commitments={commitments}
      contracts={contracts}
      budgetItems={budgetItems}
    />
  );
}
