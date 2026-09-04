"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { fromOurPlans, ownsQuarantinePath } from "@/lib/tour/validate";

/**
 * Saving and removing a floor plan.
 *
 * Separate from the tour actions because a plan is not part of a tour. It is a
 * document about a place that usually sits beside one — deleting the tour
 * leaves the plan, and a plan can exist for a building floor that has no tour
 * at all.
 *
 * As everywhere else here, the file's location is checked rather than trusted:
 * the browser sends a URL or a quarantine path, and neither is taken on faith.
 */

export type PlanResult = { error?: string; id?: string };

export type FloorPlanInput = {
  title: string;
  /** A published URL in `floor-plans`, when the upload cleared review. */
  fileUrl?: string | null;
  /** A quarantine path, when it did not. Exactly one of the two. */
  quarantinePath?: string | null;
  moderationItemId?: string | null;
  mediaType: "image" | "pdf";
  width?: number | null;
  height?: number | null;
  floorNumber?: number | null;
  tourId?: string | null;
  propertyId?: string | null;
  buildingId?: string | null;
  projectId?: string | null;
  position?: number;
};

export async function addFloorPlan(input: FloorPlanInput): Promise<PlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=%2Ftours");

  const title = input.title.trim();
  if (!title) return { error: "Give the plan a name." };
  if (title.length > 200) return { error: "That name is too long." };

  const pending = Boolean(input.quarantinePath);

  if (pending) {
    if (!ownsQuarantinePath(input.quarantinePath!, user.id)) {
      return { error: "That plan could not be verified." };
    }
  } else if (!input.fileUrl || !fromOurPlans(input.fileUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return { error: "That plan was not uploaded through Medosha." };
  }

  const { data, error } = await supabase
    .from("floor_plans")
    .insert({
      owner_id: user.id,
      title,
      file_url: pending ? null : input.fileUrl,
      quarantine_path: pending ? input.quarantinePath : null,
      moderation_item_id: pending ? (input.moderationItemId ?? null) : null,
      media_type: input.mediaType,
      width: input.width ?? null,
      height: input.height ?? null,
      floor_number: input.floorNumber ?? null,
      tour_id: input.tourId ?? null,
      property_id: input.propertyId ?? null,
      building_id: input.buildingId ?? null,
      project_id: input.projectId ?? null,
      position: input.position ?? 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: reportFailure("addFloorPlan", error, "Could not save that plan.") };
  }

  if (input.tourId) revalidatePath(`/tour/${input.tourId}`);
  if (input.propertyId) revalidatePath(`/property/${input.propertyId}`);
  return { id: data.id };
}

export async function renameFloorPlan(id: string, title: string): Promise<PlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to do that." };

  const trimmed = title.trim();
  if (!trimmed) return { error: "Give the plan a name." };

  // Scoped by owner as well as id. The policy says the same thing; a check
  // that lives only in the policy is one service_role mistake from gone.
  const { error } = await supabase
    .from("floor_plans")
    .update({ title: trimmed })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return { error: reportFailure("renameFloorPlan", error, "Could not rename that plan.") };
  }
  return { id };
}

export async function removeFloorPlan(id: string): Promise<PlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to do that." };

  const { data: plan } = await supabase
    .from("floor_plans")
    .select("tour_id, property_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!plan) return { error: "That plan could not be found." };

  const { error } = await supabase
    .from("floor_plans")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return { error: reportFailure("removeFloorPlan", error, "Could not remove that plan.") };
  }

  if (plan.tour_id) revalidatePath(`/tour/${plan.tour_id}`);
  if (plan.property_id) revalidatePath(`/property/${plan.property_id}`);
  return { id };
}
