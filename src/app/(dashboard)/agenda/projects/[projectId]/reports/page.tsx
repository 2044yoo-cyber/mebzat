import { notFound } from "next/navigation";

import {
  ProjectReport,
  type ReportFigures,
} from "@/components/agenda/site/project-report";
import { changeImpact, budgetTotals } from "@/lib/agenda/money";
import { invoiceTotals, plantInUsePercent } from "@/lib/agenda/billing";
import { isIssueOpen, punchProgress, rollUpInspection } from "@/lib/agenda/quality";
import { isAwaitingAnswer, isOverdue, scheduleVariance } from "@/lib/agenda/records";
import { getEquipment, getInvoices, getTimesheets } from "@/lib/data/agenda-billing";
import {
  getBudgetItems,
  getChangeOrders,
  getMoneyAccess,
} from "@/lib/data/agenda-money";
import {
  getInspections,
  getObservations,
  getPunchItems,
  getRfis,
  getScheduleItems,
  getSitePhotos,
  getSubmittals,
} from "@/lib/data/agenda-site";
import { agendaLogs } from "@/lib/data/agenda";
import { getAgendaProject } from "@/lib/data/agenda-projects";

/**
 * Where the project is, gathered from everything.
 *
 * Every figure comes from the same function the section that owns it uses —
 * `punchProgress` from quality, `invoiceTotals` from billing, `changeImpact`
 * from money — rather than being summed again here. A report that computes
 * its own version of a number is a report that disagrees with the screen it
 * summarises, and the report is the one people forward.
 *
 * The money block is only gathered when the viewer may see it. Row-level
 * security would return empty lists anyway, but empty lists would total to
 * zero and print "0 outstanding", which is a confident lie rather than a
 * withheld figure.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const access = await getMoneyAccess(projectId);

  const [
    schedule,
    rfis,
    submittals,
    inspections,
    observations,
    punchItems,
    photos,
    logs,
    timesheets,
    equipment,
  ] = await Promise.all([
    getScheduleItems(projectId),
    getRfis(projectId),
    getSubmittals(projectId),
    getInspections(projectId),
    getObservations(projectId),
    getPunchItems(projectId),
    getSitePhotos(projectId),
    agendaLogs(projectId),
    getTimesheets(projectId),
    getEquipment(projectId),
  ]);

  const money = access.finance
    ? await (async () => {
        const [budget, invoices, changeOrders] = await Promise.all([
          getBudgetItems(projectId),
          getInvoices(projectId),
          getChangeOrders(projectId),
        ]);
        const budgetSum = budgetTotals(budget);
        const invoiceSum = invoiceTotals(invoices);
        const change = changeImpact(changeOrders);
        return {
          revisedBudget: budgetSum.revisedBudget,
          remainingBudget: budgetSum.remainingBudget,
          outstanding: invoiceSum.outstanding,
          retentionHeld: invoiceSum.retentionHeld,
          approvedChange: change.approvedCost,
          pendingChange: change.pendingCost,
          currency:
            budget[0]?.currency ?? invoices[0]?.currency ?? project.currency,
        };
      })()
    : null;

  // Reported progress across the programme, weighted by nothing: an average of
  // what was reported. Null when nothing has been programmed, rather than
  // zero — "no programme" and "nothing built" are different facts.
  const reportedPercent =
    schedule.length === 0
      ? null
      : Math.round(
          schedule.reduce((sum, item) => sum + item.progressPercent, 0) /
            schedule.length,
        );

  const figures: ReportFigures = {
    schedule: {
      activities: schedule.length,
      milestones: schedule.filter((item) => item.isMilestone).length,
      behind: schedule.filter((item) => {
        const variance = scheduleVariance(
          item.startDate,
          item.finishDate,
          item.progressPercent,
        );
        return variance !== null && variance < 0;
      }).length,
      reportedPercent,
    },
    questions: {
      openRfis: rfis.filter((rfi) => isAwaitingAnswer(rfi.status)).length,
      overdueRfis: rfis.filter((rfi) => isOverdue(rfi.dueDate, rfi.status))
        .length,
      pendingSubmittals: submittals.filter((submittal) =>
        isAwaitingAnswer(submittal.status),
      ).length,
    },
    quality: {
      openObservations: observations.filter((item) => isIssueOpen(item.status))
        .length,
      openPunchItems: punchItems.filter((item) => isIssueOpen(item.status))
        .length,
      failedInspections: inspections.filter(
        (inspection) =>
          (rollUpInspection(inspection.items) ?? inspection.result) === "fail",
      ).length,
      punchProgress: punchProgress(punchItems),
    },
    site: {
      dailyLogs: logs.length,
      photos: photos.length,
      hours: Math.round(
        timesheets.reduce(
          (sum, row) => sum + row.hours + row.overtimeHours,
          0,
        ),
      ),
      plantInUse: plantInUsePercent(equipment),
    },
    money,
  };

  return <ProjectReport projectId={projectId} figures={figures} />;
}
