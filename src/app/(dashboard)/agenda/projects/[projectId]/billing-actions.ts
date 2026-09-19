"use server";

import { revalidatePath } from "next/cache";

import {
  BID_STATUSES,
  EQUIPMENT_STATUSES,
  type BidStatus,
  type EquipmentStatus,
} from "@/lib/agenda/billing";
import {
  CONTRACT_PARTIES,
  MONEY_STATUSES,
  type ContractParty,
  type MoneyStatus,
} from "@/lib/agenda/money";
import { createClient } from "@/lib/supabase/server";

/**
 * Writing invoices, payments, bids, hours and plant.
 *
 * Nothing here decides who may write. 0091's policies do, and they differ by
 * table: invoices, payments and bids need `agenda_can_view_finance`, while
 * timesheets and plant are site records any member may record — which is the
 * right split, because the storeman who notes a crane arriving should not need
 * to be shown the contract sum first.
 *
 * `total_amount` on an invoice is generated and never written. An invoice's
 * status follows its payments through `agenda_sync_invoice_status` in 0091,
 * so recording a payment is the whole act: there is no second step where
 * somebody remembers to mark it paid.
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

function money(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").replace(/[,\s]/g, "").trim();
  if (!raw) return 0;
  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function optionalMoney(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").replace(/[,\s]/g, "").trim();
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

/** Hours, to two decimals, inside the range the table's own check allows. */
function hours(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.round(n * 100) / 100, 0), 24);
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

function explain(message: string, fallback: string): string {
  if (
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return "You do not have access to this part of the project. Ask the client to grant it.";
  }
  if (message.includes("duplicate key") && message.includes("bid_once")) {
    return "That bidder is already on this package.";
  }
  if (message.includes("duplicate key")) {
    return "That number is already used on this project.";
  }
  if (message.includes("agenda_payment_positive")) {
    return "A payment has to be more than nothing.";
  }
  if (message.includes("agenda_timesheet_hours_sane")) {
    return "Hours have to be between 0 and 24.";
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
// Invoices
// ---------------------------------------------------------------------------

/**
 * Raises an invoice.
 *
 * Retention is a field of its own rather than a deduction somebody applies to
 * the amount, because it is money *earned* and withheld until handover. The
 * generated `total_amount` subtracts it, so the claim and what is payable now
 * are both on the record and a subcontractor can be shown why they differ.
 */
export async function raiseInvoice(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const companyName = text(formData.get("companyName"), 200);
  if (!companyName) return { error: "An invoice needs whose it is." };

  const number =
    text(formData.get("number"), 40) ??
    (await nextNumber(supabase, projectId, "invoice", "INV"));
  if (!number) return { error: "Could not take a number for that invoice." };

  const party = String(formData.get("party") ?? "");

  const { error } = await supabase.from("agenda_invoices").insert({
    project_id: projectId,
    contract_id: reference(formData.get("contractId")),
    commitment_id: reference(formData.get("commitmentId")),
    number,
    party: CONTRACT_PARTIES.some((entry) => entry.value === party)
      ? (party as ContractParty)
      : "subcontractor",
    company_name: companyName,
    issued_on: date(formData.get("issuedOn")) ?? new Date().toISOString().slice(0, 10),
    due_on: date(formData.get("dueOn")),
    amount: money(formData.get("amount")),
    tax_amount: money(formData.get("taxAmount")),
    retention_amount: money(formData.get("retentionAmount")),
    currency: currency(formData.get("currency")),
    status: moneyStatus(formData.get("status")),
  });

  if (error) {
    return { error: explain(error.message, "That invoice was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

export async function setInvoiceStatus(
  projectId: string,
  invoiceId: string,
  status: FormDataEntryValue | null,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from("agenda_invoices")
    .update({ status: moneyStatus(status) })
    .eq("id", invoiceId);

  if (error) {
    return { error: explain(error.message, "That change was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Records a payment.
 *
 * Recorded, not processed — 0091's own words. Nothing in Medosha moves money,
 * and a screen that implied otherwise would be a promise the system cannot
 * keep. What this does is write the fact, after which the invoice's status
 * follows by trigger.
 */
export async function recordPayment(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const payeeName = text(formData.get("payeeName"), 200);
  if (!payeeName) return { error: "A payment needs a payee." };

  const amount = money(formData.get("amount"));
  if (amount <= 0) return { error: "A payment has to be more than nothing." };

  const { error } = await supabase.from("agenda_payments").insert({
    project_id: projectId,
    invoice_id: reference(formData.get("invoiceId")),
    payee_name: payeeName,
    paid_on: date(formData.get("paidOn")) ?? new Date().toISOString().slice(0, 10),
    amount,
    currency: currency(formData.get("currency")),
    method: text(formData.get("method"), 60),
    reference: text(formData.get("reference"), 120),
    approved_by: user.id,
  });

  if (error) {
    return { error: explain(error.message, "That payment was not recorded.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

export async function openBidPackage(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const title = text(formData.get("title"), 200);
  if (!title) return { error: "A package needs a title." };

  const number =
    text(formData.get("number"), 40) ??
    (await nextNumber(supabase, projectId, "bid_package", "BID"));
  if (!number) return { error: "Could not take a number for that package." };

  const dueDate = date(formData.get("dueAt"));

  const { error } = await supabase.from("agenda_bid_packages").insert({
    project_id: projectId,
    number,
    title,
    scope: text(formData.get("scope"), 4000),
    // End of the day, not midnight at the start of it. A package "due on the
    // 12th" that closes as the 12th begins loses a day nobody agreed to.
    due_at: dueDate ? `${dueDate}T23:59:00Z` : null,
    created_by: user.id,
    status: moneyStatus(formData.get("status")),
  });

  if (error) {
    return { error: explain(error.message, "That package was not opened.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Invites a bidder, or records what they came back with.
 *
 * One row per bidder per package, which the table enforces. A price is
 * optional: an invitation with no number is a bidder who has not answered, and
 * storing zero for that would make them the cheapest.
 */
export async function saveBid(
  projectId: string,
  packageId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const bidderName = text(formData.get("bidderName"), 200);
  if (!bidderName) return { error: "A bid needs a bidder." };

  const status = String(formData.get("status") ?? "");
  const amount = optionalMoney(formData.get("amount"));

  const { error } = await supabase.from("agenda_bids").insert({
    package_id: packageId,
    project_id: projectId,
    bidder_name: bidderName,
    amount,
    currency: currency(formData.get("currency")),
    status: BID_STATUSES.some((entry) => entry.value === status)
      ? (status as BidStatus)
      : "invited",
    // Submitted when there is a price, because that is what submitting means.
    submitted_at: amount === null ? null : new Date().toISOString(),
    notes: text(formData.get("notes"), 2000),
  });

  if (error) {
    return { error: explain(error.message, "That bid was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}

/**
 * Awards a package to one bidder.
 *
 * The others are marked unsuccessful in the same act. Awarding without closing
 * the rest leaves three bidders all believing they are still in it, which is
 * how a tender turns into a complaint.
 */
export async function awardBid(
  projectId: string,
  packageId: string,
  bidId: string,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const { error } = await supabase
    .from("agenda_bids")
    .update({ status: "awarded" })
    .eq("id", bidId);
  if (error) {
    return { error: explain(error.message, "That award was not recorded.") };
  }

  const { error: othersError } = await supabase
    .from("agenda_bids")
    .update({ status: "rejected" })
    .eq("package_id", packageId)
    .neq("id", bidId)
    // A bidder who withdrew was never in the running, and one already marked
    // unsuccessful does not need saying twice.
    .in("status", ["invited", "viewed", "submitted", "under_review"]);
  if (othersError) {
    return {
      error:
        "The award was recorded, but the other bidders still read as in the running.",
    };
  }

  const { error: packageError } = await supabase
    .from("agenda_bid_packages")
    .update({ status: "closed" })
    .eq("id", packageId);
  if (packageError) {
    return { error: "The award was recorded, but the package is still open." };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

/**
 * Records a day's work.
 *
 * A site record rather than a money one, which is why any member may write it:
 * the person who knows who was on site is the supervisor, not the accountant,
 * and requiring finance access to say so is how the record stops being kept.
 */
export async function recordHours(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const workerName = text(formData.get("workerName"), 200);
  if (!workerName) return { error: "Say who worked." };

  const { error } = await supabase.from("agenda_timesheets").insert({
    project_id: projectId,
    worker_name: workerName,
    company_name: text(formData.get("companyName"), 200),
    worked_on: date(formData.get("workedOn")) ?? new Date().toISOString().slice(0, 10),
    hours: hours(formData.get("hours")),
    overtime_hours: hours(formData.get("overtimeHours")),
    activity: text(formData.get("activity"), 300),
    schedule_item_id: reference(formData.get("scheduleItemId")),
    recorded_by: user.id,
  });

  if (error) {
    return { error: explain(error.message, "Those hours were not recorded.") };
  }

  refresh(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Plant
// ---------------------------------------------------------------------------

export async function saveEquipment(
  projectId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const name = text(formData.get("name"), 200);
  if (!name) return { error: "The machine needs a name." };

  const status = String(formData.get("status") ?? "");

  const { error } = await supabase.from("agenda_equipment").insert({
    project_id: projectId,
    name,
    category: text(formData.get("category"), 80),
    owner_company: text(formData.get("ownerCompany"), 200),
    operator_name: text(formData.get("operatorName"), 200),
    status: EQUIPMENT_STATUSES.some((entry) => entry.value === status)
      ? (status as EquipmentStatus)
      : "available",
    hours_used: Math.max(Number(formData.get("hoursUsed") ?? 0) || 0, 0),
    last_service_on: date(formData.get("lastServiceOn")),
    next_service_on: date(formData.get("nextServiceOn")),
  });

  if (error) {
    return { error: explain(error.message, "That machine was not added.") };
  }

  refresh(projectId);
  return { ok: true };
}

/** Moves a machine's state, and clocks up its hours while somebody is there. */
export async function updateEquipment(
  projectId: string,
  equipmentId: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await actor();
  if (!user) return { error: "Your session expired. Log in again." };

  const status = String(formData.get("status") ?? "");
  const hoursUsed = Number(formData.get("hoursUsed") ?? Number.NaN);

  const { error } = await supabase
    .from("agenda_equipment")
    .update({
      status: EQUIPMENT_STATUSES.some((entry) => entry.value === status)
        ? (status as EquipmentStatus)
        : "available",
      // Left alone when the field was blank, rather than reset to zero. A
      // machine's hours only ever go up, and a blank box is not "no hours".
      ...(Number.isFinite(hoursUsed) && hoursUsed >= 0
        ? { hours_used: Math.round(hoursUsed * 10) / 10 }
        : {}),
      next_service_on: date(formData.get("nextServiceOn")),
    })
    .eq("id", equipmentId);

  if (error) {
    return { error: explain(error.message, "That change was not saved.") };
  }

  refresh(projectId);
  return { ok: true };
}
