import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ChangeReason,
  ContractParty,
  MoneyStatus,
} from "@/lib/agenda/money";

/**
 * Reads for Agenda's commercial record.
 *
 * As everywhere else in Agenda, nothing here filters by membership or by
 * permission. 0091's policies gate every one of these tables twice — on
 * `agenda_is_member` and again on `agenda_can_view_finance` or
 * `agenda_can_view_contracts` — so an empty list is the correct answer to give
 * somebody who has the project but not the money.
 *
 * ## Except that "empty" is two different sentences
 *
 * "There is no budget on this project yet" and "you may not see the budget on
 * this project" look identical through row-level security, and telling
 * somebody the first when the second is true sends them to add a budget that
 * already exists. `getMoneyAccess` asks the database which one it is — the
 * same two functions the policies ask, so the screen and the policy cannot
 * come to different answers — and the screen says so. The permission is still
 * enforced in the database; this only decides the wording.
 */

const PAGE = 400;

export type MoneyAccess = { finance: boolean; contracts: boolean };

export async function getMoneyAccess(projectId: string): Promise<MoneyAccess> {
  const supabase = await createClient();

  const [finance, contracts] = await Promise.all([
    supabase.rpc("agenda_can_view_finance", { target_project: projectId }),
    supabase.rpc("agenda_can_view_contracts", { target_project: projectId }),
  ]);

  // `=== true` rather than truthiness: an error comes back as data null, and
  // null is falsy, which is the answer we want — but so is `false`, and being
  // explicit says the failure mode was considered rather than relied on.
  return {
    finance: finance.data === true,
    contracts: contracts.data === true,
  };
}

// ---------------------------------------------------------------------------
// Bill of quantities
// ---------------------------------------------------------------------------

export type BoqItem = {
  id: string;
  section: string;
  code: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** Generated in the database: quantity × price. Never written from here. */
  amount: number;
  actualQuantity: number | null;
  actualCost: number | null;
  currency: string;
  position: number;
};

export async function getBoqItems(projectId: string): Promise<BoqItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_boq_items")
    .select(
      `id, section, code, description, unit, quantity, unit_price, amount,
       actual_quantity, actual_cost, currency, position`,
    )
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as {
      id: string;
      section: string;
      code: string | null;
      description: string;
      unit: string;
      quantity: number;
      unit_price: number;
      amount: number;
      actual_quantity: number | null;
      actual_cost: number | null;
      currency: string;
      position: number;
    }[]
  ).map((row) => ({
    id: row.id,
    section: row.section,
    code: row.code,
    description: row.description,
    unit: row.unit,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    amount: Number(row.amount),
    actualQuantity:
      row.actual_quantity === null ? null : Number(row.actual_quantity),
    actualCost: row.actual_cost === null ? null : Number(row.actual_cost),
    currency: row.currency,
    position: row.position,
  }));
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export type BudgetItem = {
  id: string;
  costCode: string;
  name: string;
  originalBudget: number;
  approvedChanges: number;
  committedCost: number;
  actualCost: number;
  pendingCost: number;
  forecastCost: number;
  /** Both generated in the database. */
  revisedBudget: number;
  remainingBudget: number;
  currency: string;
};

export async function getBudgetItems(
  projectId: string,
): Promise<BudgetItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_budget_items")
    .select(
      `id, cost_code, name, original_budget, approved_changes, committed_cost,
       actual_cost, pending_cost, forecast_cost, revised_budget,
       remaining_budget, currency`,
    )
    .eq("project_id", projectId)
    .order("cost_code", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as Record<string, string | number>[]
  ).map((row) => ({
    id: String(row.id),
    costCode: String(row.cost_code),
    name: String(row.name),
    originalBudget: Number(row.original_budget),
    approvedChanges: Number(row.approved_changes),
    committedCost: Number(row.committed_cost),
    actualCost: Number(row.actual_cost),
    pendingCost: Number(row.pending_cost),
    forecastCost: Number(row.forecast_cost),
    revisedBudget: Number(row.revised_budget),
    remainingBudget: Number(row.remaining_budget),
    currency: String(row.currency),
  }));
}

// ---------------------------------------------------------------------------
// Contracts, commitments, purchase orders
// ---------------------------------------------------------------------------

export type Contract = {
  id: string;
  number: string;
  party: ContractParty;
  companyName: string;
  scope: string | null;
  originalValue: number;
  approvedChanges: number;
  /** Generated: original + approved changes. Moved by 0091's trigger. */
  currentValue: number;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  status: MoneyStatus;
};

export async function getContracts(projectId: string): Promise<Contract[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_contracts")
    .select(
      `id, number, party, company_name, scope, original_value, approved_changes,
       current_value, currency, start_date, end_date, status`,
    )
    .eq("project_id", projectId)
    .order("number", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (data as unknown as Record<string, string | number | null>[]).map(
    (row) => ({
      id: String(row.id),
      number: String(row.number),
      party: row.party as ContractParty,
      companyName: String(row.company_name),
      scope: row.scope === null ? null : String(row.scope),
      originalValue: Number(row.original_value),
      approvedChanges: Number(row.approved_changes),
      currentValue: Number(row.current_value),
      currency: String(row.currency),
      startDate: row.start_date === null ? null : String(row.start_date),
      endDate: row.end_date === null ? null : String(row.end_date),
      status: row.status as MoneyStatus,
    }),
  );
}

export type Commitment = {
  id: string;
  number: string;
  title: string;
  companyName: string | null;
  contractId: string | null;
  contractNumber: string | null;
  budgetItemId: string | null;
  originalAmount: number;
  approvedChanges: number;
  currency: string;
  status: MoneyStatus;
};

export async function getCommitments(
  projectId: string,
): Promise<Commitment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_commitments")
    .select(
      `id, number, title, company_name, contract_id, budget_item_id,
       original_amount, approved_changes, currency, status,
       contract:agenda_contracts!agenda_commitments_contract_id_fkey(number)`,
    )
    .eq("project_id", projectId)
    .order("number", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as (Record<string, string | number | null> & {
      contract: { number: string } | { number: string }[] | null;
    })[]
  ).map((row) => ({
    id: String(row.id),
    number: String(row.number),
    title: String(row.title),
    companyName: row.company_name === null ? null : String(row.company_name),
    contractId: row.contract_id === null ? null : String(row.contract_id),
    contractNumber: unwrap(row.contract)?.number ?? null,
    budgetItemId:
      row.budget_item_id === null ? null : String(row.budget_item_id),
    originalAmount: Number(row.original_amount),
    approvedChanges: Number(row.approved_changes),
    currency: String(row.currency),
    status: row.status as MoneyStatus,
  }));
}

export type PurchaseOrderLine = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  deliveredQuantity: number;
  position: number;
};

export type PurchaseOrder = {
  id: string;
  number: string;
  supplierName: string;
  deliveryDate: string | null;
  deliveryLocation: string | null;
  currency: string;
  status: MoneyStatus;
  submittalId: string | null;
  submittalNumber: string | null;
  lines: PurchaseOrderLine[];
};

export async function getPurchaseOrders(
  projectId: string,
): Promise<PurchaseOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_purchase_orders")
    .select(
      `id, number, supplier_name, delivery_date, delivery_location, currency,
       status, submittal_id,
       submittal:agenda_submittals!agenda_purchase_orders_submittal_id_fkey(number),
       agenda_purchase_order_items(id, description, unit, quantity, unit_price,
         amount, delivered_quantity, position)`,
    )
    .eq("project_id", projectId)
    .order("number", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as (Record<string, string | number | null> & {
      submittal: { number: string } | { number: string }[] | null;
      agenda_purchase_order_items:
        | Record<string, string | number>[]
        | null;
    })[]
  ).map((row) => ({
    id: String(row.id),
    number: String(row.number),
    supplierName: String(row.supplier_name),
    deliveryDate: row.delivery_date === null ? null : String(row.delivery_date),
    deliveryLocation:
      row.delivery_location === null ? null : String(row.delivery_location),
    currency: String(row.currency),
    status: row.status as MoneyStatus,
    submittalId: row.submittal_id === null ? null : String(row.submittal_id),
    submittalNumber: unwrap(row.submittal)?.number ?? null,
    lines: (row.agenda_purchase_order_items ?? [])
      .map((line) => ({
        id: String(line.id),
        description: String(line.description),
        unit: String(line.unit),
        quantity: Number(line.quantity),
        unitPrice: Number(line.unit_price),
        amount: Number(line.amount),
        deliveredQuantity: Number(line.delivered_quantity),
        position: Number(line.position),
      }))
      .sort((a, b) => a.position - b.position),
  }));
}

// ---------------------------------------------------------------------------
// Change events and change orders
// ---------------------------------------------------------------------------

export type ChangeEvent = {
  id: string;
  number: string;
  title: string;
  description: string | null;
  reason: ChangeReason;
  potentialCost: number | null;
  potentialScheduleDays: number | null;
  currency: string;
  responsibleParty: string | null;
  status: MoneyStatus;
  rfiId: string | null;
  rfiNumber: string | null;
  createdAt: string;
};

export async function getChangeEvents(
  projectId: string,
): Promise<ChangeEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_change_events")
    .select(
      `id, number, title, description, reason, potential_cost,
       potential_schedule_days, currency, responsible_party, status, rfi_id,
       created_at,
       rfi:agenda_rfis!agenda_change_events_rfi_id_fkey(number)`,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as (Record<string, string | number | null> & {
      rfi: { number: string } | { number: string }[] | null;
    })[]
  ).map((row) => ({
    id: String(row.id),
    number: String(row.number),
    title: String(row.title),
    description: row.description === null ? null : String(row.description),
    reason: row.reason as ChangeReason,
    potentialCost:
      row.potential_cost === null ? null : Number(row.potential_cost),
    potentialScheduleDays:
      row.potential_schedule_days === null
        ? null
        : Number(row.potential_schedule_days),
    currency: String(row.currency),
    responsibleParty:
      row.responsible_party === null ? null : String(row.responsible_party),
    status: row.status as MoneyStatus,
    rfiId: row.rfi_id === null ? null : String(row.rfi_id),
    rfiNumber: unwrap(row.rfi)?.number ?? null,
    createdAt: String(row.created_at),
  }));
}

export type ChangeOrder = {
  id: string;
  number: string;
  title: string;
  description: string | null;
  costImpact: number;
  scheduleImpactDays: number;
  currency: string;
  status: MoneyStatus;
  contractId: string | null;
  contractNumber: string | null;
  changeEventId: string | null;
  changeEventNumber: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export async function getChangeOrders(
  projectId: string,
): Promise<ChangeOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_change_orders")
    .select(
      `id, number, title, description, cost_impact, schedule_impact_days,
       currency, status, contract_id, change_event_id, decided_at, created_at,
       contract:agenda_contracts!agenda_change_orders_contract_id_fkey(number),
       event:agenda_change_events!agenda_change_orders_change_event_id_fkey(number)`,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as (Record<string, string | number | null> & {
      contract: { number: string } | { number: string }[] | null;
      event: { number: string } | { number: string }[] | null;
    })[]
  ).map((row) => ({
    id: String(row.id),
    number: String(row.number),
    title: String(row.title),
    description: row.description === null ? null : String(row.description),
    costImpact: Number(row.cost_impact),
    scheduleImpactDays: Number(row.schedule_impact_days),
    currency: String(row.currency),
    status: row.status as MoneyStatus,
    contractId: row.contract_id === null ? null : String(row.contract_id),
    contractNumber: unwrap(row.contract)?.number ?? null,
    changeEventId:
      row.change_event_id === null ? null : String(row.change_event_id),
    changeEventNumber: unwrap(row.event)?.number ?? null,
    decidedAt: row.decided_at === null ? null : String(row.decided_at),
    createdAt: String(row.created_at),
  }));
}

/**
 * Supabase types an embedded one-to-one relationship as an array when it
 * cannot prove the foreign key is unique. One row either way.
 */
function unwrap<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
