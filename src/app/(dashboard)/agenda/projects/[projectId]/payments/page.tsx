import { notFound } from "next/navigation";

import { PaymentList } from "@/components/agenda/money/payment-list";
import { NoMoneyAccess } from "@/components/agenda/money/no-access";
import { getInvoices, getPayments } from "@/lib/data/agenda-billing";
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

  const access = await getMoneyAccess(projectId);
  if (!access.finance) return <NoMoneyAccess what="Payments" />;

  const [payments, invoices] = await Promise.all([
    getPayments(projectId),
    getInvoices(projectId),
  ]);

  return (
    <PaymentList projectId={projectId} payments={payments} invoices={invoices} />
  );
}
