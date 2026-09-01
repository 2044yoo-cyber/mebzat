"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/auth/admin";
import { audit } from "@/lib/moderation/service";
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
    .select("id, category")
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
  revalidatePath("/admin/moderation");
  return { ok: true, message: "Approved and published." };
}

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
