"use server";

import { revalidatePath } from "next/cache";

import {
  CHANGE_REASONS,
  CONTRACT_PARTIES,
  MONEY_STATUSES,
  type ChangeReason,
  type ContractParty,
  type MoneyStatus,
} from "@/lib/agenda/money";
import { createClient } from "@/lib/supabase/server";

/**
 * Writing to the commercial record.
 *
 * As with the site actions, nothing here checks whether the caller may see the
 * money. 0091's policies gate every one of these tables on `agenda_is_member`
 * *and* on `agenda_can_view_finance` or `agenda_can_view_contracts`, so a site
 * engineer's insert is refused by the database. A second check here would be a
 * second thing to keep correct, and it is always the copy that drifts.
 *
 * Generated columns are never written. `amount`, `revised_budget`,
 * `remaining_budget` and a contract's `current_value` are computed by the
 * database from the columns beside them, and PostgreSQL refuses an insert that
 * names one — which is the behaviour that keeps a stored copy from being wrong.
 */

export type Result = { error?: string; ok?: boolean };

function text(value: FormDataEntryValue | null, max = 200): string | null {
  const trimmed = String(value ?? "").trim().slice(0, max);
  return trimmed || null;
}

function date(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/**
 * An amount of money, or zero.
 *
 * Commas and spaces are stripped because "4,200,000" is how a site office
 * writes it and `Number("4,200,000")` is NaN. Negative is allowed: a credit
 * change order is a real thing, and refusing one would mean recording a
 * reduction as an increase somewhere else.
 */
function money(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").replace(/[,\s]/g, "").trim();
  if (!raw) return 0;
  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

/** A quantity. Three decimals, because a bill measures in m3 and tonnes. */
function quantity(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").replace(/[,\s]/g, "").trim();
  if (!raw) return 0;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 1000) / 1000
    : 0;
}

/** An amount that may genuinely be absent, as opposed to zero. */
function optionalMoney(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").replace(/[,\s]/g, "").trim();
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function whole(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function reference(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function currency(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : "ETB";
}

function moneyStatus(value: FormDataEntryValue | null): MoneyStatus {
  const raw = String(value ?? "");
  return MONEY_STATUSES.some((entry) => entry.value === raw)
    ? (raw as MoneyStatus)
    : "draft";
}

/** Turns a refusal into a sentence somebody can act on. */
function explain(message: string, fallback: string): string {
  if (
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return "You do not have access to the money on this project. Ask the client to grant it.";
  }
  if (message.includes("duplicate key")) {
    return "That number is already used on this project.";
  }
  if (message.includes("generated")) {
    // A generated column named in an insert. A bug rather than a user error,
    // but a sentence beats a PostgreSQL message about GENERATED ALWAYS.
    return "That figure is worked out by the system and cannot be set by hand.";
  }
  return fallback;
}

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refresh(projectId: string) {
  revalidatePath(`/agenda/projects/${projectId}`, "layout");
}

/** The next number for a kind of record, from the counter 0092 created. */
async function nextNumber(
  supabase: Awaited<ReturnType<typeof actor>>["supabase"],
  projectId: string,
  kind: string,
  prefix: string,
): Promise<string | null> {
  const { data } = await supabase.rpc("agenda_next_number", {
    target_project: projectId,
    record_kind: kind,
    prefix,
    width: 3,
  });
  return typeof data === "string" ? data : null;
}

// ---------------------------------------------------------------------------
// Bill of quantities
// ---------------------------------------------------------------------------

/**
 * Adds a line to the bill.
 *
 * `amount` is not sent. It is `quantity * unit_price` as a generated column,
 * and 0091 made it one precisely so a stored copy cannot be wrong.
 */
export async function addBoqItem(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const description = text(formData.get("description"), 500);
  const section = text(formData.get("section"), 120);
  if (!description || !section) {
    return { error: "A bill line needs a section and a description." };
  }

  const { count } = await supabase
    .from("agenda_boq_items")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { error } = await supabase.from("agenda_boq_items").insert({
    project_id: projectId,
    section,
    code: text(formData.get("code"), 40),
    description,
    unit: text(formData.get("unit"), 20) ?? "pcs",
    quantity: quantity(formData.get("quantity")),
    unit_price: money(formData.get("unitPrice")),
    currency: currency(formData.get("currency")),
    position: count ?? 0,
  });

  if (error) {
    return { error: explain(error.message, "That line was not added.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Records what a bill line actually came to.
 *
 * Kept apart from adding the line, because measuring what was built is a
 * different act from pricing what was drawn, and they are done months apart by
 * different people. Both figures stay on the row: the variance between them is
 * the reason 0091 put them side by side.
 */
export async function recordBoqActual(
  projectId: string,
  itemId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from("agenda_boq_items")
    .update({
      actual_quantity: optionalMoney(formData.get("actualQuantity")),
      actual_cost: optionalMoney(formData.get("actualCost")),
    })
    .eq("id", itemId);

  if (error) {
    return { error: explain(error.message, "That figure was not recorded.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export async function saveBudgetItem(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const costCode = text(formData.get("costCode"), 40);
  const name = text(formData.get("name"), 200);
  if (!costCode || !name) {
    return { error: "A budget line needs a cost code and a name." };
  }

  const { error } = await supabase.from("agenda_budget_items").insert({
    project_id: projectId,
    cost_code: costCode,
    name,
    original_budget: money(formData.get("originalBudget")),
    currency: currency(formData.get("currency")),
  });

  if (error) {
    return { error: explain(error.message, "That budget line was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Updates what a budget line has cost and committed.
 *
 * `revised_budget` and `remaining_budget` are not sent: both are generated
 * from the columns this writes, so they follow automatically and cannot
 * disagree with the parts they are made of.
 */
export async function updateBudgetCosts(
  projectId: string,
  itemId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from("agenda_budget_items")
    .update({
      approved_changes: money(formData.get("approvedChanges")),
      committed_cost: money(formData.get("committedCost")),
      actual_cost: money(formData.get("actualCost")),
      pending_cost: money(formData.get("pendingCost")),
      forecast_cost: money(formData.get("forecastCost")),
    })
    .eq("id", itemId);

  if (error) {
    return { error: explain(error.message, "Those figures were not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export async function addContract(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const companyName = text(formData.get("companyName"), 200);
  if (!companyName) return { error: "A contract needs the other party's name." };

  const number =
    text(formData.get("number"), 40) ??
    (await nextNumber(supabase, projectId, "contract", "CON"));
  if (!number) {
    return {
      error: explain("", "Could not take a number for that contract."),
    };
  }

  const party = String(formData.get("party") ?? "");

  const { error } = await supabase.from("agenda_contracts").insert({
    project_id: projectId,
    number,
    party: CONTRACT_PARTIES.some((entry) => entry.value === party)
      ? (party as ContractParty)
      : "subcontractor",
    company_name: companyName,
    scope: text(formData.get("scope"), 2000),
    original_value: money(formData.get("originalValue")),
    currency: currency(formData.get("currency")),
    start_date: date(formData.get("startDate")),
    end_date: date(formData.get("endDate")),
    status: moneyStatus(formData.get("status")),
  });

  if (error) {
    return { error: explain(error.message, "That contract was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Commitments and purchase orders
// ---------------------------------------------------------------------------

export async function addCommitment(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const title = text(formData.get("title"), 200);
  if (!title) return { error: "A commitment needs a title." };

  const number =
    text(formData.get("number"), 40) ??
    (await nextNumber(supabase, projectId, "commitment", "COM"));
  if (!number) {
    return { error: "Could not take a number for that commitment." };
  }

  const { error } = await supabase.from("agenda_commitments").insert({
    project_id: projectId,
    contract_id: reference(formData.get("contractId")),
    budget_item_id: reference(formData.get("budgetItemId")),
    number,
    title,
    company_name: text(formData.get("companyName"), 200),
    original_amount: money(formData.get("originalAmount")),
    currency: currency(formData.get("currency")),
    status: moneyStatus(formData.get("status")),
  });

  if (error) {
    return { error: explain(error.message, "That commitment was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Raises a purchase order, with its lines.
 *
 * `submittalId` is the brief's third chain: submittal, material approval,
 * purchase order, delivery, daily log. Ordering material against the revision
 * that was approved is what stops the wrong thing arriving on site.
 *
 * Lines arrive as one per row of a small table, parsed by index. Sent in the
 * same call as the order so a purchase order with no lines cannot exist — an
 * order for nothing is a number somebody has to chase.
 */
export async function raisePurchaseOrder(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const supplierName = text(formData.get("supplierName"), 200);
  if (!supplierName) return { error: "A purchase order needs a supplier." };

  const lines: {
    description: string;
    unit: string;
    quantity: number;
    unit_price: number;
  }[] = [];

  for (let index = 0; index < 30; index += 1) {
    const description = text(formData.get(`line.${index}.description`), 500);
    if (!description) continue;
    lines.push({
      description,
      unit: text(formData.get(`line.${index}.unit`), 20) ?? "pcs",
      quantity: quantity(formData.get(`line.${index}.quantity`)),
      unit_price: money(formData.get(`line.${index}.unitPrice`)),
    });
  }

  if (lines.length === 0) {
    return { error: "Add at least one line to the order." };
  }

  const number =
    text(formData.get("number"), 40) ??
    (await nextNumber(supabase, projectId, "purchase_order", "PO"));
  if (!number) return { error: "Could not take a number for that order." };

  const { data: order, error } = await supabase
    .from("agenda_purchase_orders")
    .insert({
      project_id: projectId,
      commitment_id: reference(formData.get("commitmentId")),
      number,
      supplier_name: supplierName,
      submittal_id: reference(formData.get("submittalId")),
      delivery_date: date(formData.get("deliveryDate")),
      delivery_location: text(formData.get("deliveryLocation"), 200),
      currency: currency(formData.get("currency")),
      requested_by: user.id,
      status: moneyStatus(formData.get("status")),
    })
    .select("id")
    .single();

  if (error || !order) {
    return { error: explain(error?.message ?? "", "That order was not raised.") };
  }

  const { error: linesError } = await supabase
    .from("agenda_purchase_order_items")
    .insert(
      lines.map((line, index) => ({
        purchase_order_id: order.id,
        project_id: projectId,
        ...line,
        position: index,
      })),
    );

  if (linesError) {
    return {
      error:
        "The order was raised but its lines were not saved. Open it and add them.",
    };
  }

  refresh(projectId);
  return { ok: true };
}

/** Records what actually turned up against a line of an order. */
export async function recordDelivery(
  projectId: string,
  lineId: string,
  delivered: number,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from("agenda_purchase_order_items")
    .update({
      delivered_quantity: Math.max(Math.round(delivered * 1000) / 1000, 0),
    })
    .eq("id", lineId);

  if (error) {
    return { error: explain(error.message, "That delivery was not recorded.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Change events and change orders
// ---------------------------------------------------------------------------

/**
 * Raises a change event: a thing that *might* cost money.
 *
 * 0091's own words: it exists so the cost is visible while it is still an
 * argument, rather than appearing fully formed as a change order nobody saw
 * coming. So the potential cost is optional — "we do not know yet" is a real
 * answer and zero is not the same as unknown.
 */
export async function raiseChangeEvent(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const title = text(formData.get("title"), 200);
  if (!title) return { error: "A change event needs a title." };

  const number =
    text(formData.get("number"), 40) ??
    (await nextNumber(supabase, projectId, "change_event", "CE"));
  if (!number) return { error: "Could not take a number for that change." };

  const reason = String(formData.get("reason") ?? "");
  const days = formData.get("potentialScheduleDays");

  const { error } = await supabase.from("agenda_change_events").insert({
    project_id: projectId,
    number,
    title,
    description: text(formData.get("description"), 4000),
    reason: CHANGE_REASONS.some((entry) => entry.value === reason)
      ? (reason as ChangeReason)
      : "other",
    rfi_id: reference(formData.get("rfiId")),
    potential_cost: optionalMoney(formData.get("potentialCost")),
    potential_schedule_days:
      String(days ?? "").trim() === "" ? null : whole(days),
    currency: currency(formData.get("currency")),
    responsible_party: text(formData.get("responsibleParty"), 200),
    created_by: user.id,
    status: moneyStatus(formData.get("status")),
  });

  if (error) {
    return { error: explain(error.message, "That change was not raised.") };
  }

  refresh(projectId);
  return { ok: true };
}

export async function raiseChangeOrder(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const title = text(formData.get("title"), 200);
  if (!title) return { error: "A change order needs a title." };

  const number =
    text(formData.get("number"), 40) ??
    (await nextNumber(supabase, projectId, "change_order", "CO"));
  if (!number) return { error: "Could not take a number for that order." };

  const { error } = await supabase.from("agenda_change_orders").insert({
    project_id: projectId,
    contract_id: reference(formData.get("contractId")),
    change_event_id: reference(formData.get("changeEventId")),
    number,
    title,
    description: text(formData.get("description"), 4000),
    cost_impact: money(formData.get("costImpact")),
    schedule_impact_days: whole(formData.get("scheduleImpactDays")),
    currency: currency(formData.get("currency")),
    // Always draft. An order that arrives already approved has moved a
    // contract sum without anybody deciding to, and 0091's trigger fires on
    // insert as well as update — so the decision is a separate act.
    status: "draft",
  });

  if (error) {
    return { error: explain(error.message, "That change order was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Decides a change order.
 *
 * The contract sum is not touched here. `agenda_sync_contract_changes` in 0091
 * recomputes `approved_changes` from every approved order on the contract, so
 * approving, reversing and re-approving cannot drift — and a decision made any
 * other way moves the sum too.
 */
export async function decideChangeOrder(
  projectId: string,
  orderId: string,
  decision: "approved" | "rejected",
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from("agenda_change_orders")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq("id", orderId);

  if (error) {
    return { error: explain(error.message, "That decision was not recorded.") };
  }

  refresh(projectId);
  return { ok: true };
}

/** Moves a contract, commitment, order or change along its status. */
export async function setMoneyStatus(
  projectId: string,
  table:
    | "agenda_contracts"
    | "agenda_commitments"
    | "agenda_purchase_orders"
    | "agenda_change_events",
  rowId: string,
  status: FormDataEntryValue | null,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from(table)
    .update({ status: moneyStatus(status) })
    .eq("id", rowId);

  if (error) {
    return { error: explain(error.message, "That change was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}
