/**
 * Billing, bidding, the workforce and the plant.
 *
 * The arithmetic here is all *across* rows — what is outstanding across a
 * ledger of invoices, how far apart a set of bids is, how many hours a crew
 * worked in a week. The per-row figures are the database's: `total_amount` is
 * a generated column, and an invoice's status follows its payments through
 * `agenda_sync_invoice_status` in 0091 rather than through anything here.
 *
 * Client-safe. Every one of these tables is gated on `agenda_can_view_finance`
 * — except timesheets and plant, which 0091 deliberately left as site records,
 * because knowing a crane is on site is not knowing what it cost.
 */

import type { StatusTone } from "@/components/agenda/shell/status-chip";
import { isAgreed, type MoneyStatus } from "@/lib/agenda/money";

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export type InvoiceRow = {
  amount: number;
  taxAmount: number;
  retentionAmount: number;
  /** Generated in the database: amount + tax − retention. */
  totalAmount: number;
  paidAmount: number;
  status: MoneyStatus;
  dueOn: string | null;
};

/**
 * What is still owed on an invoice.
 *
 * Never negative. An overpayment is a real thing and it is not negative debt —
 * showing "−4,000 outstanding" invites somebody to subtract it from the next
 * invoice, which is a conversation with the supplier rather than arithmetic.
 */
export function outstanding(invoice: InvoiceRow): number {
  return Math.max(invoice.totalAmount - invoice.paidAmount, 0);
}

/**
 * The ledger's bottom line.
 *
 * Retention is counted apart from what is unpaid, because it is money earned
 * and deliberately withheld until handover — 0091's own words. A system that
 * folds it into "unpaid" cannot tell a subcontractor why they are short, and
 * that is the single most common argument on an Ethiopian site.
 */
export function invoiceTotals(invoices: readonly InvoiceRow[]): {
  invoiced: number;
  paid: number;
  outstanding: number;
  retentionHeld: number;
} {
  let invoiced = 0;
  let paid = 0;
  let owed = 0;
  let retentionHeld = 0;

  for (const invoice of invoices) {
    // A draft or rejected invoice is not a claim on the project. Counting it
    // would overstate what is owed by whatever somebody happened to type.
    if (invoice.status === "draft" || invoice.status === "rejected" ||
        invoice.status === "cancelled") {
      continue;
    }
    invoiced += invoice.totalAmount;
    paid += invoice.paidAmount;
    owed += outstanding(invoice);
    retentionHeld += invoice.retentionAmount;
  }

  return { invoiced, paid, outstanding: owed, retentionHeld };
}

export type AgeBucket = "not_due" | "under_30" | "under_60" | "over_60";

export const AGE_BUCKETS: { value: AgeBucket; label: string; tone: StatusTone }[] = [
  { value: "not_due", label: "Not yet due", tone: "muted" },
  { value: "under_30", label: "Up to 30 days late", tone: "info" },
  { value: "under_60", label: "30 to 60 days late", tone: "warning" },
  { value: "over_60", label: "Over 60 days late", tone: "danger" },
];

/**
 * How late an unpaid invoice is.
 *
 * Null when it is settled or has no due date — an invoice nobody dated is not
 * current, it is undated, and putting it in "not yet due" is a claim the
 * record does not support.
 */
export function ageOf(
  invoice: InvoiceRow,
  today = new Date(),
): AgeBucket | null {
  if (outstanding(invoice) <= 0) return null;
  if (!invoice.dueOn) return null;

  const due = new Date(`${invoice.dueOn}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return null;

  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const days = Math.floor((now - due.getTime()) / 86_400_000);

  if (days <= 0) return "not_due";
  if (days <= 30) return "under_30";
  if (days <= 60) return "under_60";
  return "over_60";
}

/** The ledger split by how late it is, in the order it should be read. */
export function ageInvoices<T extends InvoiceRow>(
  invoices: readonly T[],
  today = new Date(),
): { bucket: AgeBucket; label: string; tone: StatusTone; total: number; count: number }[] {
  const totals = new Map<AgeBucket, { total: number; count: number }>();

  for (const invoice of invoices) {
    const bucket = ageOf(invoice, today);
    if (!bucket) continue;
    const current = totals.get(bucket) ?? { total: 0, count: 0 };
    totals.set(bucket, {
      total: current.total + outstanding(invoice),
      count: current.count + 1,
    });
  }

  // Worst last: a list read top to bottom ends on the thing that needs doing.
  return AGE_BUCKETS.filter((entry) => totals.has(entry.value)).map((entry) => ({
    bucket: entry.value,
    label: entry.label,
    tone: entry.tone,
    total: totals.get(entry.value)?.total ?? 0,
    count: totals.get(entry.value)?.count ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

export type BidStatus =
  | "invited"
  | "viewed"
  | "submitted"
  | "under_review"
  | "awarded"
  | "rejected"
  | "withdrawn";

export const BID_STATUSES: {
  value: BidStatus;
  label: string;
  tone: StatusTone;
}[] = [
  { value: "invited", label: "Invited", tone: "muted" },
  { value: "viewed", label: "Opened it", tone: "muted" },
  { value: "submitted", label: "Submitted", tone: "info" },
  { value: "under_review", label: "Under review", tone: "active" },
  { value: "awarded", label: "Awarded", tone: "success" },
  { value: "rejected", label: "Not successful", tone: "neutral" },
  { value: "withdrawn", label: "Withdrawn", tone: "muted" },
];

export function bidStatusLabel(status: BidStatus): string {
  return BID_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

export function bidStatusTone(status: BidStatus): StatusTone {
  return BID_STATUSES.find((entry) => entry.value === status)?.tone ?? "neutral";
}

/**
 * How a set of bids compares.
 *
 * Only bids that were actually priced are compared. An invitation nobody
 * answered has no amount, and counting it as zero would make the lowest bid
 * free — which is exactly the kind of number somebody circles in a meeting.
 *
 * The spread is what the comparison is for: three bids within 2% of each
 * other say the scope is clear, and three that are 40% apart say it is not,
 * and the second is worth knowing before awarding anything.
 */
export function compareBids(
  bids: readonly { amount: number | null; status: BidStatus }[],
): {
  priced: number;
  lowest: number | null;
  highest: number | null;
  average: number | null;
  spreadPercent: number | null;
} {
  const amounts = bids
    .filter(
      (bid) =>
        bid.status !== "withdrawn" &&
        typeof bid.amount === "number" &&
        Number.isFinite(bid.amount),
    )
    .map((bid) => bid.amount as number);

  if (amounts.length === 0) {
    return {
      priced: 0,
      lowest: null,
      highest: null,
      average: null,
      spreadPercent: null,
    };
  }

  const lowest = Math.min(...amounts);
  const highest = Math.max(...amounts);
  const average =
    amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;

  return {
    priced: amounts.length,
    lowest,
    highest,
    average: Math.round(average * 100) / 100,
    // Against the lowest, which is the one being compared to. Null rather
    // than a division by zero when somebody has bid nothing at all.
    spreadPercent:
      lowest > 0 ? Math.round(((highest - lowest) / lowest) * 100) : null,
  };
}

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

export type TimesheetRow = {
  workerName: string;
  companyName: string | null;
  workedOn: string;
  hours: number;
  overtimeHours: number;
};

/**
 * Hours by day, newest first, with each day's crew size.
 *
 * A site is managed by the day, and "how many were on site on the twelfth" is
 * a question a dispute turns on. Counting distinct names rather than rows: two
 * entries for one person on one day is a split shift, not two people.
 */
export function hoursByDay<T extends TimesheetRow>(
  rows: readonly T[],
): { day: string; rows: T[]; hours: number; overtime: number; workers: number }[] {
  const days = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = days.get(row.workedOn);
    if (bucket) bucket.push(row);
    else days.set(row.workedOn, [row]);
  }

  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, dayRows]) => ({
      day,
      rows: dayRows,
      hours: dayRows.reduce((sum, row) => sum + row.hours, 0),
      overtime: dayRows.reduce((sum, row) => sum + row.overtimeHours, 0),
      workers: new Set(dayRows.map((row) => row.workerName.toLowerCase())).size,
    }));
}

// ---------------------------------------------------------------------------
// Plant
// ---------------------------------------------------------------------------

export type EquipmentStatus =
  | "available"
  | "in_use"
  | "maintenance"
  | "off_hire"
  | "broken";

export const EQUIPMENT_STATUSES: {
  value: EquipmentStatus;
  label: string;
  tone: StatusTone;
}[] = [
  { value: "in_use", label: "In use", tone: "active" },
  { value: "available", label: "Available", tone: "success" },
  { value: "maintenance", label: "Being serviced", tone: "warning" },
  { value: "broken", label: "Broken down", tone: "danger" },
  { value: "off_hire", label: "Off hire", tone: "muted" },
];

export function equipmentStatusLabel(status: EquipmentStatus): string {
  return (
    EQUIPMENT_STATUSES.find((entry) => entry.value === status)?.label ?? status
  );
}

export function equipmentStatusTone(status: EquipmentStatus): StatusTone {
  return (
    EQUIPMENT_STATUSES.find((entry) => entry.value === status)?.tone ?? "neutral"
  );
}

/**
 * Whether a machine is due a service.
 *
 * True on the day itself, not the day after. A service due today that reads as
 * "not yet" is how a machine goes another week, and the cost of being a day
 * early is nothing.
 */
export function serviceDue(
  nextServiceOn: string | null,
  today = new Date(),
): boolean {
  if (!nextServiceOn) return false;
  const due = new Date(`${nextServiceOn}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return false;
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return now >= due.getTime();
}

/**
 * What is actually working, as a percentage of what is on the project.
 *
 * Off-hire plant is excluded from both halves: it has gone back, and leaving
 * it in the denominator makes a site look idle for machines it no longer has.
 * Null when nothing is on the project, rather than zero.
 */
export function plantInUsePercent(
  items: readonly { status: EquipmentStatus }[],
): number | null {
  const here = items.filter((item) => item.status !== "off_hire");
  if (here.length === 0) return null;
  const working = here.filter((item) => item.status === "in_use").length;
  return Math.round((working / here.length) * 100);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/**
 * Whether an invoice has been agreed and is therefore a real claim.
 *
 * Re-exported through `isAgreed` rather than restated, so the report and the
 * invoice screen cannot come to different answers about what counts.
 */
export function isClaimable(status: MoneyStatus): boolean {
  return isAgreed(status) || status === "partially_paid";
}
