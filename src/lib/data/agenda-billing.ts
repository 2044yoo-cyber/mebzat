import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { BidStatus, EquipmentStatus } from "@/lib/agenda/billing";
import type { ContractParty, MoneyStatus } from "@/lib/agenda/money";

/**
 * Reads for billing, bidding, the workforce and the plant.
 *
 * As everywhere in Agenda, the policies decide who sees what. Invoices,
 * payments and bids are money and need `agenda_can_view_finance`; timesheets
 * and plant are site records that any member reads, which 0091 chose
 * deliberately — knowing a crane is on site is not knowing what it cost.
 */

const PAGE = 400;

type Row = Record<string, string | number | null>;

function unwrap<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

// ---------------------------------------------------------------------------
// Invoices and payments
// ---------------------------------------------------------------------------

export type Invoice = {
  id: string;
  number: string;
  party: ContractParty;
  companyName: string;
  issuedOn: string | null;
  dueOn: string | null;
  amount: number;
  taxAmount: number;
  retentionAmount: number;
  /** Generated in the database: amount + tax − retention. */
  totalAmount: number;
  /** Summed from the payments against it, which is what drives its status. */
  paidAmount: number;
  currency: string;
  status: MoneyStatus;
  contractId: string | null;
  contractNumber: string | null;
};

/**
 * Every invoice, with what has been paid against it.
 *
 * The payments are embedded and summed here rather than asked for per invoice:
 * a ledger of sixty invoices would otherwise be sixty-one queries, and what is
 * outstanding is the only reason the screen is opened.
 */
export async function getInvoices(projectId: string): Promise<Invoice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_invoices")
    .select(
      `id, number, party, company_name, issued_on, due_on, amount, tax_amount,
       retention_amount, total_amount, currency, status, contract_id,
       contract:agenda_contracts!agenda_invoices_contract_id_fkey(number),
       agenda_payments(amount)`,
    )
    .eq("project_id", projectId)
    .order("issued_on", { ascending: false, nullsFirst: false })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as (Row & {
      contract: { number: string } | { number: string }[] | null;
      agenda_payments: { amount: number }[] | null;
    })[]
  ).map((row) => ({
    id: String(row.id),
    number: String(row.number),
    party: row.party as ContractParty,
    companyName: String(row.company_name),
    issuedOn: row.issued_on === null ? null : String(row.issued_on),
    dueOn: row.due_on === null ? null : String(row.due_on),
    amount: Number(row.amount),
    taxAmount: Number(row.tax_amount),
    retentionAmount: Number(row.retention_amount),
    totalAmount: Number(row.total_amount),
    paidAmount: (row.agenda_payments ?? []).reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    ),
    currency: String(row.currency),
    status: row.status as MoneyStatus,
    contractId: row.contract_id === null ? null : String(row.contract_id),
    contractNumber: unwrap(row.contract)?.number ?? null,
  }));
}

export type Payment = {
  id: string;
  payeeName: string;
  paidOn: string;
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
};

export async function getPayments(projectId: string): Promise<Payment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_payments")
    .select(
      `id, payee_name, paid_on, amount, currency, method, reference, invoice_id,
       invoice:agenda_invoices!agenda_payments_invoice_id_fkey(number)`,
    )
    .eq("project_id", projectId)
    .order("paid_on", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as (Row & {
      invoice: { number: string } | { number: string }[] | null;
    })[]
  ).map((row) => ({
    id: String(row.id),
    payeeName: String(row.payee_name),
    paidOn: String(row.paid_on),
    amount: Number(row.amount),
    currency: String(row.currency),
    method: row.method === null ? null : String(row.method),
    reference: row.reference === null ? null : String(row.reference),
    invoiceId: row.invoice_id === null ? null : String(row.invoice_id),
    invoiceNumber: unwrap(row.invoice)?.number ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

export type Bid = {
  id: string;
  bidderName: string;
  amount: number | null;
  currency: string;
  status: BidStatus;
  submittedAt: string | null;
  notes: string | null;
};

export type BidPackage = {
  id: string;
  number: string;
  title: string;
  scope: string | null;
  dueAt: string | null;
  status: MoneyStatus;
  bids: Bid[];
};

export async function getBidPackages(
  projectId: string,
): Promise<BidPackage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_bid_packages")
    .select(
      `id, number, title, scope, due_at, status,
       agenda_bids(id, bidder_name, amount, currency, status, submitted_at, notes)`,
    )
    .eq("project_id", projectId)
    .order("number", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as (Row & { agenda_bids: Row[] | null })[]
  ).map((row) => ({
    id: String(row.id),
    number: String(row.number),
    title: String(row.title),
    scope: row.scope === null ? null : String(row.scope),
    dueAt: row.due_at === null ? null : String(row.due_at),
    status: row.status as MoneyStatus,
    bids: (row.agenda_bids ?? [])
      .map((bid) => ({
        id: String(bid.id),
        bidderName: String(bid.bidder_name),
        amount: bid.amount === null ? null : Number(bid.amount),
        currency: String(bid.currency),
        status: bid.status as BidStatus,
        submittedAt: bid.submitted_at === null ? null : String(bid.submitted_at),
        notes: bid.notes === null ? null : String(bid.notes),
      }))
      // Cheapest first among those that priced; unpriced invitations last,
      // because a comparison is read from the number that wins.
      .sort((a, b) => {
        if (a.amount === b.amount) return 0;
        if (a.amount === null) return 1;
        if (b.amount === null) return -1;
        return a.amount - b.amount;
      }),
  }));
}

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

export type Timesheet = {
  id: string;
  workerName: string;
  companyName: string | null;
  workedOn: string;
  hours: number;
  overtimeHours: number;
  activity: string | null;
  scheduleItemId: string | null;
  scheduleItemName: string | null;
};

export async function getTimesheets(
  projectId: string,
): Promise<Timesheet[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_timesheets")
    .select(
      `id, worker_name, company_name, worked_on, hours, overtime_hours, activity,
       schedule_item_id,
       activity_item:agenda_schedule_items!agenda_timesheets_schedule_item_id_fkey(name)`,
    )
    .eq("project_id", projectId)
    .order("worked_on", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as (Row & {
      activity_item: { name: string } | { name: string }[] | null;
    })[]
  ).map((row) => ({
    id: String(row.id),
    workerName: String(row.worker_name),
    companyName: row.company_name === null ? null : String(row.company_name),
    workedOn: String(row.worked_on),
    hours: Number(row.hours),
    overtimeHours: Number(row.overtime_hours),
    activity: row.activity === null ? null : String(row.activity),
    scheduleItemId:
      row.schedule_item_id === null ? null : String(row.schedule_item_id),
    scheduleItemName: unwrap(row.activity_item)?.name ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Plant
// ---------------------------------------------------------------------------

export type Equipment = {
  id: string;
  name: string;
  category: string | null;
  ownerCompany: string | null;
  operatorName: string | null;
  status: EquipmentStatus;
  hoursUsed: number;
  lastServiceOn: string | null;
  nextServiceOn: string | null;
};

export async function getEquipment(projectId: string): Promise<Equipment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_equipment")
    .select(
      `id, name, category, owner_company, operator_name, status, hours_used,
       last_service_on, next_service_on`,
    )
    .eq("project_id", projectId)
    .order("name", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (data as unknown as Row[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    category: row.category === null ? null : String(row.category),
    ownerCompany:
      row.owner_company === null ? null : String(row.owner_company),
    operatorName:
      row.operator_name === null ? null : String(row.operator_name),
    status: row.status as EquipmentStatus,
    hoursUsed: Number(row.hours_used),
    lastServiceOn:
      row.last_service_on === null ? null : String(row.last_service_on),
    nextServiceOn:
      row.next_service_on === null ? null : String(row.next_service_on),
  }));
}
