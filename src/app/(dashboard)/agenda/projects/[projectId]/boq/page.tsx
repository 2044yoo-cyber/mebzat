import { notFound } from "next/navigation";

import { BoqTable } from "@/components/agenda/money/boq-table";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import { getBoqItems, getMoneyAccess } from "@/lib/data/agenda-money";
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

  const access = await getMoneyAccess(projectId);
  // The rows are hidden by the policy either way. This only decides whether
  // the screen says "nothing here yet" or "this is not shared with you".
  if (!access.finance) return <NoMoneyAccess what="The bill of quantities" />;

  const items = await getBoqItems(projectId);
  return <BoqTable projectId={projectId} items={items} />;
}
