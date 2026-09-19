import { notFound } from "next/navigation";

import { InvoiceLedger } from "@/components/agenda/money/invoice-ledger";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import { getInvoices } from "@/lib/data/agenda-billing";
import {
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
  // Each page asks for the project again rather than trusting the layout.
  // A layout cannot hand data to a page in the App Router, and a page that
  // assumed the layout had already checked access would be a page that is
  // reachable without the check when it is rendered another way.
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const access = await getMoneyAccess(projectId);
  if (!access.finance) return <NoMoneyAccess what="The invoice ledger" />;

  const [invoices, contracts, commitments] = await Promise.all([
    getInvoices(projectId),
    getContracts(projectId),
    getCommitments(projectId),
  ]);

  return (
    <InvoiceLedger
      projectId={projectId}
      invoices={invoices}
      contracts={contracts}
      commitments={commitments}
    />
  );
}
