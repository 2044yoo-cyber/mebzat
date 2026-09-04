"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/auth/admin";
import { audit, publishApproved } from "@/lib/moderation/service";
import { strikeFor } from "@/lib/moderation/strikes";
import type { ModerationCategory } from "@/lib/moderation/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Moderator actions.
 *
 * Every one of these re-checks isAdmin() rather than trusting that the page
 * rendered. A server action is a public endpoint with a URL; the fact that the
 * only button pointing at it lives behind a gate is not the gate.
 */

export type ModResult = { ok: boolean; message: string };

const DENIED: ModResult = { ok: false, message: "Not permitted." };

async function operator() {
  if (!(await isAdmin())) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/** Let it through. The override that exists because automated checks are wrong
 * often enough that a moderator needs the last word. */
export async function approveItem(itemId: string): Promise<ModResult> {
  const ctx = await operator();
  if (!ctx) return DENIED;

  const { data: item } = await ctx.supabase
    .from("moderation_items")
    .select("id, category, content_type, quarantine_path")
    .eq("id", itemId)
    .maybeSingle();

  // The one decision a moderator cannot make. The check constraint in the
  // migration refuses it at the database too; this is the readable half.
  if (item?.category === "sexual_minors") {
    return {
      ok: false,
      message: "This category cannot be approved.",
    };
  }

  const { error } = await ctx.supabase
    .from("moderation_items")
    .update({
      status: "safe",
      last_action: "moderator_approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: ctx.user.id,
    })
    .eq("id", itemId);

  if (error) return { ok: false, message: "Could not approve that." };

  await audit(ctx.supabase, itemId, ctx.user.id, "safe", { via: "queue" });

  // Approving used to set the status and stop, while the message said
  // "Approved and published". The file stayed in quarantine, which is private,
  // so an approved image was as invisible as a rejected one. Publishing is the
  // half that makes the decision mean anything.
  const published = await publishItemFile(ctx.supabase, item);

  revalidatePath("/admin/moderation");
  return {
    ok: true,
    message: published
      ? "Approved and published."
      : "Approved. The file could not be published — check the logs.",
  };
}

/**
 * Move an approved file out of quarantine, and point whatever was waiting on
 * it at the published copy.
 *
 * A 360° scene is the case that needs the second half. Its row was written
 * before the verdict, holding a quarantine path instead of a URL, and the row
 * policy keeps it hidden from everyone but its owner until that URL exists.
 * Filling it in is what makes the room appear for visitors.
 */
async function publishItemFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  item: { id: string; content_type: string; quarantine_path: string | null } | null,
): Promise<boolean> {
  if (!item?.quarantine_path) return true;

  const bucket = PUBLIC_BUCKETS[item.content_type];
  if (!bucket) return true;

  const publicUrl = await publishApproved(
    supabase,
    item.id,
    item.quarantine_path,
    bucket,
  );
  if (!publicUrl) return false;

  if (item.content_type === "floor_plan") {
    const { error } = await supabase
      .from("floor_plans")
      .update({ file_url: publicUrl, quarantine_path: null })
      .eq("moderation_item_id", item.id);

    if (error) {
      console.error("[moderation] published the file but could not update the plan:", error);
      return false;
    }
  }

  if (item.content_type === "panorama") {
    const { error } = await supabase
      .from("tour_scenes")
      .update({ panorama_url: publicUrl, quarantine_path: null })
      .eq("moderation_item_id", item.id);

    if (error) {
      console.error("[moderation] published the file but could not update the scene:", error);
      return false;
    }

    // A tour whose first room was pending has no thumbnail yet.
    const { data: scene } = await supabase
      .from("tour_scenes")
      .select("tour_id")
      .eq("moderation_item_id", item.id)
      .maybeSingle();

    if (scene) {
      await supabase
        .from("tours")
        .update({ thumbnail_url: publicUrl })
        .eq("id", scene.tour_id)
        .is("thumbnail_url", null);
    }
  }

  return true;
}

/** Where each kind of upload lives once it has been cleared. */
const PUBLIC_BUCKETS: Record<string, string | undefined> = {
  panorama: "panoramas",
  floor_plan: "floor-plans",
  product_image: "product-images",
  profile_avatar: "avatars",
  profile_cover: "covers",
};

/** Take it out of public view and record a strike against the author. */
export async function removeItem(
  itemId: string,
  reason: string,
): Promise<ModResult> {
  const ctx = await operator();
  if (!ctx) return DENIED;

  const { data: item } = await ctx.supabase
    .from("moderation_items")
    .select("id, user_id, category")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return { ok: false, message: "That item no longer exists." };

  const { error } = await ctx.supabase
    .from("moderation_items")
    .update({
      status: "blocked",
      // public_path must be cleared: the check constraint refuses a public
      // path on anything that is not safe, and the file must stop being
      // reachable the moment the decision is made.
      public_path: null,
      last_action: "moderator_removed",
      reviewed_at: new Date().toISOString(),
      reviewed_by: ctx.user.id,
      reason: reason.slice(0, 500) || null,
    })
    .eq("id", itemId);

  if (error) return { ok: false, message: "Could not remove that." };

  if (item.user_id) {
    await strikeFor({
      client: ctx.supabase,
      userId: item.user_id,
      itemId: item.id,
      category: (item.category as ModerationCategory | null) ?? "other",
      issuedBy: ctx.user.id,
      reason,
    });
  }

  await audit(ctx.supabase, itemId, ctx.user.id, "blocked", { via: "queue" });
  revalidatePath("/admin/moderation");
  return { ok: true, message: "Removed. A strike was recorded." };
}

export async function resolveReports(itemId: string): Promise<ModResult> {
  const ctx = await operator();
  if (!ctx) return DENIED;

  const { error } = await ctx.supabase
    .from("moderation_items")
    .update({
      report_count: 0,
      reviewed_at: new Date().toISOString(),
      reviewed_by: ctx.user.id,
    })
    .eq("id", itemId);

  if (error) return { ok: false, message: "Could not resolve that." };
  revalidatePath("/admin/moderation");
  return { ok: true, message: "Reports marked resolved." };
}

export async function decideAppeal(
  itemId: string,
  granted: boolean,
  note: string,
): Promise<ModResult> {
  const ctx = await operator();
  if (!ctx) return DENIED;

  const now = new Date().toISOString();

  const { error } = await ctx.supabase
    .from("moderation_appeals")
    .update({
      status: granted ? "granted" : "denied",
      decided_by: ctx.user.id,
      decided_at: now,
      decision_note: note.slice(0, 1000) || null,
    })
    .eq("item_id", itemId)
    .eq("status", "open");

  if (error) return { ok: false, message: "Could not record that decision." };

  await ctx.supabase
    .from("moderation_items")
    .update({
      appeal_status: granted ? "granted" : "denied",
      // A granted appeal restores the content; a denied one changes nothing
      // about its status, only the appeal's.
      ...(granted
        ? {
            status: "safe",
            last_action: "appeal_granted",
            reviewed_at: now,
            reviewed_by: ctx.user.id,
          }
        : { last_action: "appeal_denied" }),
    })
    .eq("id", itemId);

  await audit(
    ctx.supabase,
    itemId,
    ctx.user.id,
    granted ? "safe" : "blocked",
    { via: "appeal" },
  );
  revalidatePath("/admin/moderation");
  return {
    ok: true,
    message: granted ? "Appeal granted, content restored." : "Appeal denied.",
  };
}
