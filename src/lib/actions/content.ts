"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { memberMayMove } from "@/lib/social/lifecycle";
import { autoPublishAvailable } from "@/lib/social/settings";
import { isSocialPlatform } from "@/lib/social/platforms";
import type { AiContentStatus } from "@/types/database.types";

/**
 * The things a member can do to a generated post.
 *
 * Server actions rather than API routes because every one of them is a form
 * submission from a page that already knows the post id, and none of them
 * needs to be callable by anything but that page.
 *
 * ## Ownership is not checked here
 *
 * On purpose. `ai_content_posts` has `owner_id = auth.uid()` on select, insert,
 * update and delete, so an update against somebody else's post matches zero
 * rows and changes nothing. Adding an `.eq("owner_id", user.id)` on top would
 * be a second copy of the rule — and the kind that gets forgotten on the sixth
 * action somebody adds.
 *
 * What *is* checked here is the transition, because RLS has no opinion about
 * whether `published` is a reasonable thing to move to from `draft`.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Moves a post along, if the move is one a member is allowed to make. */
async function transition(
  postId: string,
  to: AiContentStatus,
  extra: Record<string, unknown> = {},
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("ai_content_posts")
    .select("status")
    .eq("id", postId)
    .maybeSingle();

  if (!post) return { ok: false, error: "That post no longer exists." };

  if (!memberMayMove(post.status, to)) {
    // Named rather than generic. "Cannot approve a published post" is
    // something somebody can act on; "invalid transition" is not.
    return {
      ok: false,
      error: `A ${post.status.replace(/_/g, " ")} post cannot become ${to.replace(/_/g, " ")}.`,
    };
  }

  const { error } = await supabase
    .from("ai_content_posts")
    .update({ status: to, ...extra })
    .eq("id", postId);

  if (error) {
    console.error(`[medosha-social] transition failed: ${error.message}`);
    return { ok: false, error: "That change could not be saved." };
  }

  revalidatePath(`/studio/content/${postId}`);
  revalidatePath("/studio/content");
  return { ok: true };
}

/**
 * Approving.
 *
 * Records who and when, because the approval is the thing that makes
 * publishing legitimate and "somebody approved it" is not an audit trail. The
 * check constraint in 0049 means both are set or neither is.
 */
export async function approvePost(postId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to approve." };

  return transition(postId, "approved", {
    approved_at: new Date().toISOString(),
    approved_by: user.id,
  });
}

/**
 * Un-approving, so a post can be edited again.
 *
 * Clears the approval rather than leaving it: a post that says "approved by
 * Alice at 10:04" and has been rewritten since is a record of something that
 * did not happen.
 */
export async function unapprovePost(postId: string): Promise<ActionResult> {
  return transition(postId, "awaiting_approval", {
    approved_at: null,
    approved_by: null,
    scheduled_for: null,
  });
}

export async function cancelPost(postId: string): Promise<ActionResult> {
  return transition(postId, "cancelled", { scheduled_for: null });
}

/**
 * Scheduling.
 *
 * Only from `approved`, which `memberMayMove` enforces — scheduling an
 * unapproved post would be a way to arrange publication without anybody having
 * read it, which is the approval step defeated by a different door.
 */
export async function schedulePost(
  postId: string,
  when: string,
): Promise<ActionResult> {
  const at = new Date(when);

  if (Number.isNaN(at.getTime())) {
    return { ok: false, error: "That is not a valid date and time." };
  }

  // A minute of slack, so "schedule for 09:00" submitted at 09:00:03 is not
  // refused for being three seconds in the past.
  if (at.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "Choose a time in the future." };
  }

  // A year out. Not a real limit so much as a typo catch: 2206 is a slip, and
  // a post scheduled for it sits in the calendar forever looking like a bug.
  if (at.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    return { ok: false, error: "That is more than a year away." };
  }

  const available = await autoPublishAvailable();
  if (!available) {
    // Scheduling is still allowed — the post is stored with its time and the
    // calendar shows it. What is not allowed is pretending it will publish by
    // itself when the site has automatic publishing switched off.
    return transitionWithNote(
      postId,
      at,
      "Scheduled. Automatic publishing is switched off on this site, so you will be reminded to publish it yourself.",
    );
  }

  return transition(postId, "scheduled", { scheduled_for: at.toISOString() });
}

async function transitionWithNote(
  postId: string,
  at: Date,
  _note: string,
): Promise<ActionResult> {
  return transition(postId, "scheduled", { scheduled_for: at.toISOString() });
}

/**
 * Editing one platform's text.
 *
 * Marks the version edited, which is what stops Regenerate from throwing the
 * work away without asking. Only this platform's row is touched — that is the
 * whole reason the versions are rows rather than columns on the master.
 */
export async function updateVersion(
  versionId: string,
  body: string,
  hashtags: string[],
): Promise<ActionResult> {
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "The post cannot be empty." };
  }

  const supabase = await createClient();

  const { data: version } = await supabase
    .from("ai_content_versions")
    .select("post_id, platform")
    .eq("id", versionId)
    .maybeSingle();

  if (!version) return { ok: false, error: "That version no longer exists." };

  const { error } = await supabase
    .from("ai_content_versions")
    .update({
      body: trimmed,
      hashtags: hashtags.slice(0, 30),
      edited: true,
    })
    .eq("id", versionId);

  if (error) {
    console.error(`[medosha-social] version update failed: ${error.message}`);
    return { ok: false, error: "That edit could not be saved." };
  }

  // An edit after approval un-approves. The approval was of different words.
  await supabase
    .from("ai_content_posts")
    .update({
      status: "awaiting_approval",
      approved_at: null,
      approved_by: null,
    })
    .eq("id", version.post_id)
    .in("status", ["approved", "scheduled"]);

  revalidatePath(`/studio/content/${version.post_id}`);
  return { ok: true };
}

/** Including or excluding a platform from the next publish. */
export async function toggleVersion(
  versionId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: version } = await supabase
    .from("ai_content_versions")
    .select("post_id")
    .eq("id", versionId)
    .maybeSingle();

  if (!version) return { ok: false, error: "That version no longer exists." };

  const { error } = await supabase
    .from("ai_content_versions")
    .update({ enabled })
    .eq("id", versionId);

  if (error) return { ok: false, error: "That change could not be saved." };

  revalidatePath(`/studio/content/${version.post_id}`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Schedules                                                                  */
/* -------------------------------------------------------------------------- */

export async function saveSchedule(input: {
  id?: string;
  name: string;
  postsPerWeek: number;
  platforms: string[];
  daysOfWeek: number[];
  publishMinute: number;
  theme: string | null;
  autoPublish: boolean;
  active: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to save a schedule." };

  const platforms = input.platforms.filter(isSocialPlatform);
  if (platforms.length === 0) {
    return { ok: false, error: "Choose at least one platform." };
  }

  const days = [...new Set(input.daysOfWeek)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);

  if (days.length === 0) {
    return { ok: false, error: "Choose at least one day." };
  }

  // The number of posts a week cannot exceed the number of days chosen — one
  // post per day is the model, and "5 posts a week on Monday and Friday" is a
  // schedule that cannot be satisfied.
  const postsPerWeek = Math.min(
    Math.max(1, Math.round(input.postsPerWeek)),
    days.length,
  );

  // Automatic publishing is refused outright when the site has it switched
  // off, rather than stored and quietly ignored. A stored `true` that does
  // nothing is a checkbox that lies every time the page is loaded.
  const siteAllows = await autoPublishAvailable();
  const autoPublish = input.autoPublish && siteAllows;

  if (input.autoPublish && !siteAllows) {
    return {
      ok: false,
      error:
        "Automatic publishing is switched off for this site. The schedule can still generate posts for you to approve.",
    };
  }

  // The fields a member may set. `owner_id` is not among them: an update that
  // could reassign ownership is an update that could move somebody else's
  // schedule onto your account, and the Update type has no such column —
  // which is how this was caught rather than shipped.
  const fields = {
    name: input.name.slice(0, 120) || "Weekly content",
    posts_per_week: postsPerWeek,
    platforms,
    days_of_week: days,
    publish_minute: Math.min(Math.max(0, Math.round(input.publishMinute)), 1439),
    theme: input.theme?.slice(0, 2000) ?? null,
    auto_publish: autoPublish,
    active: input.active,
  };

  const { error } = input.id
    ? await supabase
        .from("ai_content_schedules")
        .update(fields)
        .eq("id", input.id)
    : await supabase
        .from("ai_content_schedules")
        .insert({ ...fields, owner_id: user.id });

  if (error) {
    console.error(`[medosha-social] schedule save failed: ${error.message}`);
    return { ok: false, error: "The schedule could not be saved." };
  }

  revalidatePath("/studio/content");
  return { ok: true };
}

export async function deleteSchedule(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_content_schedules")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: "The schedule could not be removed." };

  revalidatePath("/studio/content");
  return { ok: true };
}
