"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/moderation/service";
import {
  type ContentKind,
  type ModerationCategory,
  MODERATION_CATEGORIES,
  CONTENT_KINDS,
} from "@/lib/moderation/types";
import { createClient } from "@/lib/supabase/server";

/**
 * What a reader can do about content, and what an author can do about a
 * decision. Two actions, both written from the reporter's or author's side of
 * the glass: neither ever learns the moderation state of anything.
 *
 * Reporting is the one path by which content that passed automated checks can
 * still be pulled out of public view, so it has to work for somebody who is
 * angry, on a phone, and not signed in — which is why the signed-out case
 * returns a prompt rather than an error.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; needsAuth?: boolean };

/** Reports one person may file per hour. Generous for a reader, useless for
 * somebody trying to bury a competitor's listing under a pile of reports. */
const REPORTS_PER_HOUR = 20;

function isCategory(value: string): value is ModerationCategory {
  return (MODERATION_CATEGORIES as readonly string[]).includes(value);
}

function isContentKind(value: string): value is ContentKind {
  return (CONTENT_KINDS as readonly string[]).includes(value);
}

export async function reportContent(input: {
  contentType: string;
  contentId: string;
  ownerId?: string | null;
  category: string;
  note?: string;
  path?: string;
}): Promise<ActionResult> {
  if (!isContentKind(input.contentType) || !isCategory(input.category)) {
    return { ok: false, message: "That report could not be submitted." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reports carry weight, so they carry a name. Anonymous reporting is a
  // brigading tool.
  if (!user) {
    return {
      ok: false,
      needsAuth: true,
      message: "Sign in to report this.",
    };
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await supabase
    .from("moderation_reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", user.id)
    .gte("created_at", hourAgo);

  if ((recent ?? 0) >= REPORTS_PER_HOUR) {
    return {
      ok: false,
      message: "You have reported a lot recently. Try again later.",
    };
  }

  // One item per piece of content. A second reporter joins the first one's
  // item rather than opening a parallel case for the same post.
  const { data: existing } = await supabase
    .from("moderation_items")
    .select("id, status, report_count")
    .eq("content_type", input.contentType)
    .eq("content_id", input.contentId)
    .maybeSingle();

  let itemId = existing?.id ?? null;

  if (!itemId) {
    const { data: created, error } = await supabase
      .from("moderation_items")
      .insert({
        content_type: input.contentType,
        content_id: input.contentId,
        user_id: input.ownerId ?? null,
        // A report is a reason to look, not a finding. It opens the item in
        // review, never blocked: one stranger's click must not unpublish
        // somebody's listing.
        status: "review",
        category: input.category,
        last_action: "user_reported",
      })
      .select("id")
      .single();

    if (error || !created) {
      return { ok: false, message: "That report could not be submitted." };
    }
    itemId = created.id;
  } else if (existing && existing.status === "safe") {
    await supabase
      .from("moderation_items")
      .update({ status: "review", last_action: "user_reported" })
      .eq("id", itemId);
  }

  const { error: reportError } = await supabase
    .from("moderation_reports")
    .insert({
      item_id: itemId,
      reporter_id: user.id,
      category: input.category,
      note: input.note?.slice(0, 1000) || null,
    });

  // The unique constraint on (item_id, reporter_id) means a second report
  // from the same person lands here. That is not a failure worth showing.
  const duplicate = reportError?.code === "23505";
  if (reportError && !duplicate) {
    return { ok: false, message: "That report could not be submitted." };
  }

  if (!duplicate) {
    await supabase
      .from("moderation_items")
      .update({ report_count: (existing?.report_count ?? 0) + 1 })
      .eq("id", itemId);
  }

  await audit(supabase, itemId, user.id, "review", {
    via: "user_report",
    category: input.category,
  });

  if (input.path) revalidatePath(input.path);

  // Identical whether this was the first report or a duplicate: telling a
  // reporter that somebody got there first tells them the state of a case
  // they are not party to.
  return {
    ok: true,
    message: "Thanks — our moderators will take a look.",
  };
}

export async function submitAppeal(input: {
  itemId: string;
  reason: string;
}): Promise<ActionResult> {
  const reason = input.reason.trim();
  if (reason.length < 10) {
    return { ok: false, message: "Please explain a little more." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, needsAuth: true, message: "Sign in to appeal." };

  // Only the author of the content may appeal it, and only a decision that
  // actually went against them.
  const { data: item } = await supabase
    .from("moderation_items")
    .select("id, user_id, status, appeal_status")
    .eq("id", input.itemId)
    .maybeSingle();

  if (!item || item.user_id !== user.id) {
    return { ok: false, message: "That decision cannot be appealed." };
  }
  if (item.status !== "blocked" && item.status !== "review") {
    return { ok: false, message: "There is nothing to appeal here." };
  }
  if (item.appeal_status === "open") {
    return { ok: true, message: "Your appeal is already with a moderator." };
  }

  const { error } = await supabase.from("moderation_appeals").insert({
    item_id: item.id,
    user_id: user.id,
    reason: reason.slice(0, 2000),
  });

  if (error && error.code !== "23505") {
    return { ok: false, message: "That appeal could not be submitted." };
  }

  await supabase
    .from("moderation_items")
    .update({ appeal_status: "open" })
    .eq("id", item.id);

  await audit(supabase, item.id, user.id, "review", { via: "appeal" });

  return { ok: true, message: "Your appeal has been submitted." };
}
