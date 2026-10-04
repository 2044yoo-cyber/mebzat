"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type {
  ListingStatus,
  ServicePricing,
  ServiceScope,
  WorkStatus,
} from "@/types/database.types";

export type ServiceResult = { error?: string; id?: string };

const MANAGE_PATH = "/dashboard/services";

async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}

export type ServiceInput = {
  title: string;
  description?: string;
  categoryId?: string | null;
  subcategory?: string;
  pricing: ServicePricing;
  priceFrom?: number | null;
  priceTo?: number | null;
  unit?: string;
  scope: ServiceScope;
  materialIncluded: boolean;
  labourIncluded: boolean;
  minOrder?: number | null;
  maxCapacity?: number | null;
  capacityUnit?: string;
  workStatus: WorkStatus;
  nextAvailableOn?: string | null;
  leadTimeDays?: number | null;
  completionDays?: number | null;
  locationCity?: string;
  serviceRadiusKm?: number | null;
  servesRemotely: boolean;
  yearsExperience?: number | null;
  phone?: string;
  whatsapp?: string;
  coverImageUrl?: string | null;
  videoUrl?: string | null;
  acceptingWork: boolean;
  status?: ListingStatus;
};

/** Pricing methods that are a conversation rather than a figure. */
const NO_FIGURE: ServicePricing[] = ["custom", "negotiable", "on_request"];

function validate(input: ServiceInput): string | null {
  const title = input.title.trim();
  if (title.length < 3) return "Give the service a name.";
  if (title.length > 200) return "That name is too long.";

  if (!NO_FIGURE.includes(input.pricing) && input.priceFrom == null) {
    return "Enter a starting price, or choose negotiable pricing.";
  }
  for (const value of [input.priceFrom, input.priceTo]) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      return "Enter a valid price.";
    }
  }
  if (
    input.priceFrom != null &&
    input.priceTo != null &&
    input.priceTo < input.priceFrom
  ) {
    return "The upper price must be at or above the lower one.";
  }
  if (
    input.minOrder != null &&
    input.maxCapacity != null &&
    input.maxCapacity < input.minOrder
  ) {
    return "Maximum capacity must be at or above the minimum order.";
  }
  return null;
}

/** Shapes the input into a row. Shared by create and update. */
function toRow(input: ServiceInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    category_id: input.categoryId || null,
    subcategory: input.subcategory?.trim() || null,
    pricing: input.pricing,
    price_from: input.priceFrom ?? null,
    price_to: input.priceTo ?? null,
    unit: input.unit?.trim() || null,
    scope: input.scope,
    material_included: input.materialIncluded,
    labour_included: input.labourIncluded,
    min_order: input.minOrder ?? null,
    max_capacity: input.maxCapacity ?? null,
    capacity_unit: input.capacityUnit?.trim() || null,
    work_status: input.workStatus,
    next_available_on: input.nextAvailableOn || null,
    lead_time_days: input.leadTimeDays ?? null,
    completion_days: input.completionDays ?? null,
    location_city: input.locationCity?.trim() || null,
    service_radius_km: input.serviceRadiusKm ?? null,
    serves_remotely: input.servesRemotely,
    years_experience: input.yearsExperience ?? null,
    phone: input.phone?.trim() || null,
    whatsapp: input.whatsapp?.trim() || null,
    cover_image_url: input.coverImageUrl || null,
    video_url: input.videoUrl || null,
    accepting_work: input.acceptingWork,
    status: input.status ?? ("published" as ListingStatus),
  };
}

/**
 * Adds a service.
 *
 * An account may hold any number of these — a studio that also makes wardrobes
 * and prepares BOQs publishes three, and each carries its own pricing,
 * capacity, portfolio and analytics.
 */
export async function createService(
  input: ServiceInput,
): Promise<ServiceResult> {
  const { supabase, user } = await requireUser(`${MANAGE_PATH}/new`);

  const problem = validate(input);
  if (problem) return { error: problem };

  // Slugs are unique per provider, so the suffix only has to disambiguate
  // against this provider's own services.
  const base = slugify(input.title).slice(0, 60) || "service";
  const { data: existing } = await supabase
    .from("services")
    .select("slug")
    .eq("provider_id", user.id)
    .like("slug", `${base}%`);

  const taken = new Set((existing ?? []).map((row) => row.slug));
  let slug = base;
  let suffix = 2;
  while (taken.has(slug)) slug = `${base}-${suffix++}`;

  const { data, error } = await supabase
    .from("services")
    .insert({ provider_id: user.id, slug, ...toRow(input) })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not create that service." };

  revalidatePath("/services");
  revalidatePath(MANAGE_PATH);
  return { id: data.id };
}

export async function updateService(
  serviceId: string,
  input: ServiceInput,
): Promise<ServiceResult> {
  const { supabase, user } = await requireUser(MANAGE_PATH);

  const problem = validate(input);
  if (problem) return { error: problem };

  const { error } = await supabase
    .from("services")
    .update(toRow(input))
    .eq("id", serviceId)
    .eq("provider_id", user.id);

  if (error) return { error: "Could not save those changes." };

  revalidatePath("/services");
  revalidatePath(`/services/${serviceId}`);
  revalidatePath(MANAGE_PATH);
  return { id: serviceId };
}

/**
 * Pauses or resumes a service.
 *
 * Archiving rather than deleting: the analytics, portfolio and past bids
 * attached to it stay meaningful, and a paused service can come back.
 */
export async function setServiceStatus(
  serviceId: string,
  status: ListingStatus,
): Promise<ServiceResult> {
  const { supabase, user } = await requireUser(MANAGE_PATH);

  const { error } = await supabase
    .from("services")
    .update({ status })
    .eq("id", serviceId)
    .eq("provider_id", user.id);

  if (error) return { error: "Could not update that service." };

  revalidatePath("/services");
  revalidatePath(MANAGE_PATH);
  return {};
}

/** Changes live availability without opening the whole form. */
export async function setWorkStatus(
  serviceId: string,
  workStatus: WorkStatus,
  nextAvailableOn?: string | null,
): Promise<ServiceResult> {
  const { supabase, user } = await requireUser(MANAGE_PATH);

  const { error } = await supabase
    .from("services")
    .update({
      work_status: workStatus,
      next_available_on: nextAvailableOn || null,
      // Fully booked and still "accepting work" would contradict itself.
      accepting_work: workStatus !== "fully_booked" && workStatus !== "offline",
    })
    .eq("id", serviceId)
    .eq("provider_id", user.id);

  if (error) return { error: "Could not update availability." };

  revalidatePath(MANAGE_PATH);
  revalidatePath(`/services/${serviceId}`);
  return {};
}

export async function deleteService(serviceId: string): Promise<ServiceResult> {
  const { supabase, user } = await requireUser(MANAGE_PATH);

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("provider_id", user.id);

  if (error) return { error: "Could not delete that service." };

  revalidatePath("/services");
  revalidatePath(MANAGE_PATH);
  return {};
}

/** Sets availability across every service the provider owns, in one go. */
export async function setAllWorkStatus(
  workStatus: WorkStatus,
): Promise<ServiceResult> {
  const { supabase, user } = await requireUser(MANAGE_PATH);

  const [services, profile] = await Promise.all([
    supabase
      .from("services")
      .update({
        work_status: workStatus,
        accepting_work:
          workStatus !== "fully_booked" && workStatus !== "offline",
      })
      .eq("provider_id", user.id),
    supabase
      .from("profiles")
      .update({ work_status: workStatus })
      .eq("id", user.id),
  ]);

  if (services.error || profile.error) {
    return { error: "Could not update availability." };
  }

  revalidatePath(MANAGE_PATH);
  return {};
}

export async function toggleServiceBookmark(
  serviceId: string,
): Promise<ServiceResult> {
  const { supabase, user } = await requireUser(`/services/${serviceId}`);

  const { data: existing } = await supabase
    .from("service_bookmarks")
    .select("service_id")
    .eq("service_id", serviceId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("service_bookmarks")
        .delete()
        .eq("service_id", serviceId)
        .eq("user_id", user.id)
    : await supabase
        .from("service_bookmarks")
        .insert({ service_id: serviceId, user_id: user.id });

  if (error) return { error: "Could not update your bookmarks." };

  revalidatePath(`/services/${serviceId}`);
  return {};
}

export async function toggleServiceFollow(
  serviceId: string,
): Promise<ServiceResult> {
  const { supabase, user } = await requireUser(`/services/${serviceId}`);

  const { data: existing } = await supabase
    .from("service_follows")
    .select("service_id")
    .eq("service_id", serviceId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("service_follows")
        .delete()
        .eq("service_id", serviceId)
        .eq("user_id", user.id)
    : await supabase
        .from("service_follows")
        .insert({ service_id: serviceId, user_id: user.id });

  if (error) return { error: "Could not update your follows." };

  revalidatePath(`/services/${serviceId}`);
  return {};
}

/**
 * Records an analytics event.
 *
 * Goes through the security-definer RPC so a signed-out visitor's view still
 * counts without granting anonymous inserts on the table.
 */
export async function recordServiceEvent(
  serviceId: string,
  kind:
    | "view"
    | "quote_request"
    | "message"
    | "call"
    | "whatsapp"
    | "profile_visit",
): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("record_service_event", {
    target_service_id: serviceId,
    target_kind: kind,
  });
}
