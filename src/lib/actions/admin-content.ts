"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/auth/admin";
import { SOCIAL_PLATFORMS, isSocialPlatform } from "@/lib/social/platforms";
import {
  AI_OPERATION_IDS,
  PLAN_ORDER,
  type AccountPlan,
} from "@/lib/billing/operations";
import { createClient } from "@/lib/supabase/server";

/**
 * The operator's controls for AI posting.
 *
 * Two tables, and the split is deliberate: credit *prices* and plan floors are
 * `ai_operation_costs`, which already governs every other paid operation, and
 * everything that is not a price — posting limits, which platforms are on,
 * whether automatic publishing is offered — is `platform_settings`.
 *
 * ## The guard is here as well as in the policy
 *
 * Both tables have an admin-only RLS policy, so a non-admin's write matches
 * zero rows and changes nothing. That is the control. The `isAdmin()` check
 * below is so a non-admin gets *told* rather than watching a form silently do
 * nothing — a save that reports success and saves nothing is worse than a
 * refusal.
 */

export type AdminResult = { ok: true } | { ok: false; error: string };

const DENIED: AdminResult = {
  ok: false,
  error: "Only an administrator can change these settings.",
};

/** Sets the credit price and minimum plan for one operation. */
export async function setOperationCost(input: {
  operation: string;
  credits: number;
  minPlan: string;
  active: boolean;
}): Promise<AdminResult> {
  if (!(await isAdmin())) return DENIED;

  // The operation must be one the code knows. An arbitrary string here would
  // create a priced row that nothing ever charges against — invisible, and
  // impossible to debug from the admin screen that created it.
  if (!(AI_OPERATION_IDS as readonly string[]).includes(input.operation)) {
    return { ok: false, error: "That is not a known AI operation." };
  }

  if (!(PLAN_ORDER as readonly string[]).includes(input.minPlan)) {
    return { ok: false, error: "That is not a known plan." };
  }

  const credits = Math.round(input.credits);
  if (!Number.isFinite(credits) || credits < 0 || credits > 10_000) {
    return {
      ok: false,
      error: "The price must be between 0 and 10,000 credits.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_operation_costs")
    .update({
      credits,
      min_plan: input.minPlan as AccountPlan,
      active: input.active,
    })
    .eq("operation", input.operation);

  if (error) {
    console.error(`[medosha-admin] cost update failed: ${error.message}`);
    return { ok: false, error: "That price could not be saved." };
  }

  revalidatePath("/admin/content");
  return { ok: true };
}

/**
 * Sets a per-plan limit.
 *
 * Every plan must be present. A partial map would read as zero for the missing
 * ones — `planNumber` treats absent as not-permitted, which is the right
 * default for a missing settings row and the wrong one for a plan an admin
 * simply did not type into a form.
 */
export async function setPlanLimits(
  key:
    | "weekly_post_limit"
    | "monthly_post_limit"
    | "included_posts_per_month"
    | "max_connected_accounts",
  limits: Record<string, number>,
): Promise<AdminResult> {
  if (!(await isAdmin())) return DENIED;

  const value: Record<string, number> = {};

  for (const plan of PLAN_ORDER) {
    const number = Math.round(Number(limits[plan]));

    if (!Number.isFinite(number) || number < 0 || number > 100_000) {
      return {
        ok: false,
        error: `The limit for ${plan} must be a number between 0 and 100,000.`,
      };
    }

    value[plan] = number;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({ value })
    .eq("key", key);

  if (error) {
    console.error(`[medosha-admin] limit update failed: ${error.message}`);
    return { ok: false, error: "Those limits could not be saved." };
  }

  revalidatePath("/admin/content");
  return { ok: true };
}

/**
 * Switching a platform on or off for the whole site.
 *
 * Turning one *on* does not make it work: `enabledPlatforms()` also requires
 * the server to hold that platform's app credentials, and no admin toggle can
 * conjure a Meta app. The page says so beside the switch rather than letting
 * somebody enable Instagram, watch it stay unavailable, and conclude the
 * toggle is broken.
 */
export async function setEnabledPlatforms(
  platforms: string[],
): Promise<AdminResult> {
  if (!(await isAdmin())) return DENIED;

  // Medosha cannot be switched off. It is this application's own feed, it is
  // the only platform that always works, and a site with no platforms at all
  // is a content engine with nowhere to publish.
  const value = [
    ...new Set(["medosha", ...platforms.filter(isSocialPlatform)]),
  ].filter((platform) =>
    (SOCIAL_PLATFORMS as readonly string[]).includes(platform),
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({ value })
    .eq("key", "enabled_platforms");

  if (error) {
    console.error(`[medosha-admin] platform update failed: ${error.message}`);
    return { ok: false, error: "That change could not be saved." };
  }

  revalidatePath("/admin/content");
  revalidatePath("/studio/content");
  return { ok: true };
}

/**
 * Whether automatic publishing is offered at all.
 *
 * A site-wide master switch above every member's own setting. With it false,
 * `saveSchedule` refuses to store `auto_publish` and the scheduler stops before
 * reading the queue — two independent places, because this is the control that
 * decides whether a machine may post to somebody's business account with no
 * human in the loop.
 */
export async function setAutoPublishAvailable(
  available: boolean,
): Promise<AdminResult> {
  if (!(await isAdmin())) return DENIED;

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({ value: available })
    .eq("key", "auto_publish_available");

  if (error) {
    console.error(`[medosha-admin] auto-publish update failed: ${error.message}`);
    return { ok: false, error: "That change could not be saved." };
  }

  revalidatePath("/admin/content");
  return { ok: true };
}
