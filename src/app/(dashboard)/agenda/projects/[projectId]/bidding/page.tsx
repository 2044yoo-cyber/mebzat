import { notFound } from "next/navigation";

import { BidBoard } from "@/components/agenda/money/bid-board";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import { getBidPackages } from "@/lib/data/agenda-billing";
import { getMoneyAccess } from "@/lib/data/agenda-money";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  // Bids are money: 0091 gates them on finance, because what a firm quoted is
  // commercially sensitive to every other firm on the project.
  const access = await getMoneyAccess(projectId);
  if (!access.finance) return <NoMoneyAccess what="Bidding" />;

  const packages = await getBidPackages(projectId);
  return <BidBoard projectId={projectId} packages={packages} />;
}
