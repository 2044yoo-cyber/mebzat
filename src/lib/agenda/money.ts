/**
 * The commercial vocabulary, and the arithmetic every money screen shares.
 *
 * 0091's own header sets the rules this follows: every amount is
 * `numeric(16, 2)` with a currency beside it, and the figures a budget is
 * judged on — revised budget, remaining budget, a contract's current value —
 * are generated columns rather than numbers an application maintains. Nothing
 * here recomputes those. What it does is the arithmetic *across* rows, which
 * the database cannot do for a list: totals, variance, and what is left.
 *
 * Client-safe. Nothing here decides who may see the money — `agenda_can_view_
 * finance` and `agenda_can_view_contracts` do that, in the database. A
 * permission checked in a component is a permission that is not enforced.
 */

import type { StatusTone } from "@/components/agenda/shell/status-chip";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type MoneyStatus =
  | "draft"
  | "pending"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "partially_paid"
  | "paid"
  | "closed"
  | "cancelled";

export const MONEY_STATUSES: {
  value: MoneyStatus;
  label: string;
  tone: StatusTone;
}[] = [
  { value: "draft", label: "Draft", tone: "muted" },
  { value: "pending", label: "Pending", tone: "info" },
  { value: "submitted", label: "Submitted", tone: "info" },
  { value: "under_review", label: "Under review", tone: "active" },
  { value: "approved", label: "Approved", tone: "success" },
  { value: "rejected", label: "Rejected", tone: "danger" },
  { value: "partially_paid", label: "Part paid", tone: "warning" },
  { value: "paid", label: "Paid", tone: "success" },
  { value: "closed", label: "Closed", tone: "neutral" },
  { value: "cancelled", label: "Cancelled", tone: "muted" },
];

export function moneyStatusLabel(status: MoneyStatus): string {
  return MONEY_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

export function moneyStatusTone(status: MoneyStatus): StatusTone {
  return (
    MONEY_STATUSES.find((entry) => entry.value === status)?.tone ?? "neutral"
  );
}

/**
 * Whether this row has been agreed.
 *
 * Only `approved` and `paid` count. The distinction matters most for change
 * orders: 0091's trigger moves a contract's sum on `approved` alone, so a
 * screen that called `submitted` agreed would show a contract value the
 * database does not hold.
 */
export function isAgreed(status: MoneyStatus): boolean {
  return status === "approved" || status === "paid";
}

/** Still moving: somebody has to do something before it is settled. */
export function isLiveMoney(status: MoneyStatus): boolean {
  return !["rejected", "paid", "closed", "cancelled"].includes(status);
}

// ---------------------------------------------------------------------------
// Parties and reasons
// ---------------------------------------------------------------------------

export type ContractParty =
  | "client"
  | "consultant"
  | "subcontractor"
  | "supplier"
  | "other";

export const CONTRACT_PARTIES: { value: ContractParty; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "consultant", label: "Consultant" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "supplier", label: "Supplier" },
  { value: "other", label: "Other" },
];

export function contractPartyLabel(party: ContractParty): string {
  return CONTRACT_PARTIES.find((entry) => entry.value === party)?.label ?? party;
}

export type ChangeReason =
  | "design_change"
  | "site_condition"
  | "client_request"
  | "material_change"
  | "rfi_result"
  | "quantity_variation"
  | "other";

export const CHANGE_REASONS: { value: ChangeReason; label: string }[] = [
  { value: "design_change", label: "Design change" },
  { value: "site_condition", label: "Site condition" },
  { value: "client_request", label: "Client request" },
  { value: "material_change", label: "Material change" },
  { value: "rfi_result", label: "Answer to an RFI" },
  { value: "quantity_variation", label: "Quantity variation" },
  { value: "other", label: "Other" },
];

export function changeReasonLabel(reason: ChangeReason): string {
  return CHANGE_REASONS.find((entry) => entry.value === reason)?.label ?? reason;
}

/**
 * What a bill of quantities measures in.
 *
 * A list here rather than an enum in the database, for the reason 0091 gives:
 * a bill uses whatever the specification used, and a migration per unit is not
 * a system anybody wants. The list is a convenience on the form; the column
 * takes anything.
 */
export const BOQ_UNITS = [
  "pcs", "m", "m2", "m3", "kg", "ton", "litre", "bag", "roll", "set",
  "lump sum", "day", "hour",
] as const;

// ---------------------------------------------------------------------------
// Budget arithmetic
// ---------------------------------------------------------------------------

export type BudgetRow = {
  originalBudget: number;
  approvedChanges: number;
  committedCost: number;
  actualCost: number;
  pendingCost: number;
  forecastCost: number;
};

export type BudgetTotals = BudgetRow & {
  revisedBudget: number;
  remainingBudget: number;
};

/**
 * The bottom line of a budget.
 *
 * `revisedBudget` and `remainingBudget` are summed from the parts rather than
 * from the rows' own generated columns, and that is not a duplicate of the
 * database's definition — it is the same definition applied to a total, which
 * is a number no column holds. Summing the generated columns instead would
 * give the same answer and would break silently the day a row is filtered out
 * of one sum and not the other.
 */
export function budgetTotals(rows: readonly BudgetRow[]): BudgetTotals {
  const total = rows.reduce<BudgetRow>(
    (sum, row) => ({
      originalBudget: sum.originalBudget + row.originalBudget,
      approvedChanges: sum.approvedChanges + row.approvedChanges,
      committedCost: sum.committedCost + row.committedCost,
      actualCost: sum.actualCost + row.actualCost,
      pendingCost: sum.pendingCost + row.pendingCost,
      forecastCost: sum.forecastCost + row.forecastCost,
    }),
    {
      originalBudget: 0,
      approvedChanges: 0,
      committedCost: 0,
      actualCost: 0,
      pendingCost: 0,
      forecastCost: 0,
    },
  );

  return {
    ...total,
    revisedBudget: total.originalBudget + total.approvedChanges,
    remainingBudget:
      total.originalBudget +
      total.approvedChanges -
      total.actualCost -
      total.committedCost,
  };
}

/**
 * How much of the revised budget is spoken for, 0 to 100 or beyond.
 *
 * Committed money counts. A purchase order placed and not yet invoiced is
 * money that has left, whatever the bank says, and a bar that ignores it tells
 * a project manager they have room they do not have.
 *
 * Deliberately **not** clamped at 100: a line 130% spent is the single most
 * important thing on the screen, and a bar that stops at full hides it. The
 * caller clamps the bar's width and shows the number.
 *
 * Null when there is no budget to be a percentage of — zero would read as
 * "nothing spent", which is the opposite of what an unbudgeted line means.
 */
export function committedPercent(row: BudgetRow): number | null {
  const revised = row.originalBudget + row.approvedChanges;
  if (revised <= 0) return null;
  return Math.round(((row.actualCost + row.committedCost) / revised) * 100);
}

/**
 * Over or under the revised budget, as an amount.
 *
 * Negative is over. That is the sign convention the rest of Agenda uses for
 * lateness — `daysRemaining` is negative when a job is late — and two
 * conventions in one product is how somebody reads a red number as good news.
 */
export function budgetVariance(row: BudgetRow): number {
  return (
    row.originalBudget +
    row.approvedChanges -
    row.actualCost -
    row.committedCost
  );
}

// ---------------------------------------------------------------------------
// The bill of quantities
// ---------------------------------------------------------------------------

export type BoqRow = {
  section: string;
  amount: number;
  actualCost: number | null;
};

/**
 * A bill grouped into its sections, in the order they first appear.
 *
 * Insertion order rather than alphabetical: a bill is written in the order the
 * work happens — substructure before superstructure before finishes — and
 * sorting it alphabetically puts Finishes first, which is nobody's bill.
 */
export function groupBySection<T extends BoqRow>(
  rows: readonly T[],
): { section: string; rows: T[]; priced: number; actual: number }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = groups.get(row.section);
    if (bucket) bucket.push(row);
    else groups.set(row.section, [row]);
  }

  return [...groups.entries()].map(([section, sectionRows]) => ({
    section,
    rows: sectionRows,
    priced: sectionRows.reduce((sum, row) => sum + row.amount, 0),
    actual: sectionRows.reduce((sum, row) => sum + (row.actualCost ?? 0), 0),
  }));
}

/**
 * What a set of change orders has done, and what it might still do.
 *
 * Approved and pending are counted apart on purpose. "The contract is up by
 * 4 million" and "the contract is up by 4 million and another 6 is being
 * argued about" are different sentences, and a single total says the first
 * while meaning the second.
 */
export function changeImpact(
  orders: readonly { status: MoneyStatus; costImpact: number; scheduleImpactDays: number }[],
): {
  approvedCost: number;
  pendingCost: number;
  approvedDays: number;
  pendingDays: number;
} {
  let approvedCost = 0;
  let pendingCost = 0;
  let approvedDays = 0;
  let pendingDays = 0;

  for (const order of orders) {
    if (isAgreed(order.status)) {
      approvedCost += order.costImpact;
      approvedDays += order.scheduleImpactDays;
    } else if (isLiveMoney(order.status)) {
      // A rejected or cancelled change is neither agreed nor still arguable,
      // and counting it as pending would leave a number on the screen that
      // nobody is going to resolve.
      pendingCost += order.costImpact;
      pendingDays += order.scheduleImpactDays;
    }
  }

  return { approvedCost, pendingCost, approvedDays, pendingDays };
}
