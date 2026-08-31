"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type {
  BriefBidStatus,
  BriefStatus,
  BudgetKind,
  ContractShape,
} from "@/types/database.types";

export type HireResult = { error?: string; id?: string; invited?: number };

async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}

export type BriefInput = {
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  requiredSkills?: string[];
  contractShape: ContractShape;
  budgetKind: BudgetKind;
  budgetMin?: number | null;
  budgetMax?: number | null;
  locationCity?: string;
  latitude?: number | null;
  longitude?: number | null;
  startsOn?: string | null;
  deadlineOn?: string | null;
  bidsCloseOn?: string | null;
};

/**
 * Publishes a brief and notifies the professionals it matches.
 *
 * Matching runs after the insert rather than by trigger, because a draft
 * should not wake anybody and the client may still be editing. The count comes
 * back so the page can say how many were told.
 */
export async function createBrief(input: BriefInput): Promise<HireResult> {
  const { supabase, user } = await requireUser("/hire/new");

  const title = input.title.trim();
  if (title.length < 6) return { error: "Give the project a clear title." };
  if (title.length > 200) return { error: "That title is too long." };

  const description = input.description.trim();
  if (description.length < 20) {
    return { error: "Describe the work in a little more detail." };
  }
  if (!input.category.trim()) return { error: "Pick a category." };

  const min = input.budgetMin ?? null;
  const max = input.budgetMax ?? null;
  for (const value of [min, max]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return { error: "Enter a valid budget." };
    }
  }
  if (min !== null && max !== null && max < min) {
    return { error: "The upper budget must be at or above the lower one." };
  }
  if (
    input.startsOn &&
    input.deadlineOn &&
    input.deadlineOn < input.startsOn
  ) {
    return { error: "The deadline cannot be before the start date." };
  }

  const base = slugify(title).slice(0, 60) || "project";
  const { data: existing } = await supabase
    .from("project_briefs")
    .select("slug")
    .eq("client_id", user.id)
    .like("slug", `${base}%`);

  const taken = new Set((existing ?? []).map((row) => row.slug));
  let slug = base;
  let suffix = 2;
  while (taken.has(slug)) slug = `${base}-${suffix++}`;

  const { data, error } = await supabase
    .from("project_briefs")
    .insert({
      client_id: user.id,
      title,
      slug,
      description,
      category: input.category.trim(),
      subcategory: input.subcategory?.trim() || null,
      required_skills: input.requiredSkills ?? [],
      contract_shape: input.contractShape,
      budget_kind: input.budgetKind,
      budget_min: min,
      budget_max: max,
      location_city: input.locationCity?.trim() || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      starts_on: input.startsOn || null,
      deadline_on: input.deadlineOn || null,
      bids_close_on: input.bidsCloseOn || null,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not publish that project." };

  // Best effort: a brief that publishes but fails to notify is still a brief.
  const { data: invited } = await supabase.rpc(
    "invite_matching_professionals",
    { target_brief_id: data.id, max_invites: 15 },
  );

  revalidatePath("/hire");
  return { id: data.id, invited: Number(invited ?? 0) };
}

export type BidInput = {
  price: number;
  priceNote?: string;
  timelineDays?: number | null;
  canStartOn?: string | null;
  teamSize?: number | null;
  proposal: string;
  warrantyMonths?: number | null;
  materialIncluded: boolean;
  labourIncluded: boolean;
  serviceId?: string | null;
};

/**
 * Places or improves a bid.
 *
 * Upserts on the unique (brief_id, bidder_id): bidding again is an improved
 * offer, not a second entry in the client's comparison table.
 */
export async function submitBid(
  briefId: string,
  input: BidInput,
): Promise<HireResult> {
  const { supabase, user } = await requireUser(`/hire/${briefId}`);

  if (!Number.isFinite(input.price) || input.price <= 0) {
    return { error: "Enter a price above zero." };
  }
  if (input.price > 1_000_000_000) {
    return { error: "That price looks wrong — check the figure." };
  }

  const proposal = input.proposal.trim();
  if (proposal.length < 20) {
    return { error: "Write a short proposal so the client can compare." };
  }

  const { data: brief } = await supabase
    .from("project_briefs")
    .select("client_id, status")
    .eq("id", briefId)
    .maybeSingle();

  if (!brief) return { error: "That project no longer exists." };
  if (brief.status !== "open") {
    return { error: "This project is no longer taking bids." };
  }
  if (brief.client_id === user.id) {
    return { error: "You cannot bid on your own project." };
  }

  // A bid may only be attributed to a service the bidder actually owns.
  let serviceId: string | null = null;
  if (input.serviceId) {
    const { data: service } = await supabase
      .from("services")
      .select("id")
      .eq("id", input.serviceId)
      .eq("provider_id", user.id)
      .maybeSingle();
    serviceId = service?.id ?? null;
  }

  const { error } = await supabase.from("brief_bids").upsert(
    {
      brief_id: briefId,
      bidder_id: user.id,
      service_id: serviceId,
      price: input.price,
      price_note: input.priceNote?.slice(0, 500) || null,
      timeline_days: input.timelineDays ?? null,
      can_start_on: input.canStartOn || null,
      team_size: input.teamSize ?? null,
      proposal: proposal.slice(0, 5000),
      warranty_months: input.warrantyMonths ?? null,
      material_included: input.materialIncluded,
      labour_included: input.labourIncluded,
      status: "submitted",
    },
    { onConflict: "brief_id,bidder_id" },
  );

  if (error) return { error: "Could not submit that bid." };

  revalidatePath(`/hire/${briefId}`);
  return {};
}

/**
 * The client shortlists, declines, or hires.
 *
 * Accepting also moves the brief to awarded and records which bid won, so the
 * comparison table stops inviting further decisions.
 */
export async function decideBid(
  bidId: string,
  status: BriefBidStatus,
): Promise<HireResult> {
  const { supabase, user } = await requireUser("/hire");

  const { data: bid } = await supabase
    .from("brief_bids")
    .select("id, brief_id")
    .eq("id", bidId)
    .maybeSingle();

  if (!bid) return { error: "That bid no longer exists." };

  const { data: brief } = await supabase
    .from("project_briefs")
    .select("id, client_id")
    .eq("id", bid.brief_id)
    .maybeSingle();

  if (!brief || brief.client_id !== user.id) {
    return { error: "Only the client can decide on bids." };
  }

  const { error } = await supabase
    .from("brief_bids")
    .update({ status })
    .eq("id", bidId);

  if (error) return { error: "Could not update that bid." };

  if (status === "accepted") {
    await supabase
      .from("project_briefs")
      .update({ status: "awarded", awarded_bid_id: bidId })
      .eq("id", brief.id);

    // Everyone else is declined, so nobody is left waiting on an answer.
    await supabase
      .from("brief_bids")
      .update({ status: "declined" })
      .eq("brief_id", brief.id)
      .neq("id", bidId)
      .in("status", ["submitted", "shortlisted"]);
  }

  revalidatePath(`/hire/${bid.brief_id}`);
  return {};
}

export async function withdrawBid(briefId: string): Promise<HireResult> {
  const { supabase, user } = await requireUser(`/hire/${briefId}`);

  const { error } = await supabase
    .from("brief_bids")
    .update({ status: "withdrawn" })
    .eq("brief_id", briefId)
    .eq("bidder_id", user.id);

  if (error) return { error: "Could not withdraw that bid." };

  revalidatePath(`/hire/${briefId}`);
  return {};
}

export async function setBriefStatus(
  briefId: string,
  status: BriefStatus,
): Promise<HireResult> {
  const { supabase, user } = await requireUser("/hire");

  const { error } = await supabase
    .from("project_briefs")
    .update({ status })
    .eq("id", briefId)
    .eq("client_id", user.id);

  if (error) return { error: "Could not update that project." };

  revalidatePath(`/hire/${briefId}`);
  return {};
}
