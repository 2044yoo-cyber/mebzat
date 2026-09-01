import "server-only";

import { createClient } from "@/lib/supabase/server";
import { PLATFORM_SPECS, SOCIAL_PLATFORMS, type SocialPlatform } from "./platforms";
import type { AccountPlan } from "@/lib/billing/operations";

/**
 * The admin-configurable limits, read at request time.
 *
 * Everything here is a row in `platform_settings`, not a constant. The brief
 * was explicit — "the exact pricing should be configurable from the admin
 * dashboard", "do not hard-code these numbers" — and the reason is the same
 * one that applies to credit prices: a limit written into a file is a limit
 * that needs a deploy, at which point somebody edits it in the wrong
 * environment instead.
 *
 * The fallbacks below exist for one case only: the settings row is missing
 * because the migration has not been applied yet. They are deliberately the
 * most restrictive reading, so a half-deployed site refuses rather than gives
 * away unlimited posting.
 */

type SettingsRow = { key: string; value: unknown };

async function readSettings(keys: string[]): Promise<Map<string, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", keys);

  return new Map((data ?? []).map((row: SettingsRow) => [row.key, row.value]));
}

/**
 * Platforms a user may actually choose.
 *
 * Two conditions, and both must hold:
 *
 *   1. The admin has switched it on in `enabled_platforms`.
 *   2. The server has the app credentials for it.
 *
 * The second is not something an admin can toggle their way past, and that is
 * the point. Offering a Facebook button on a deployment with no Meta app
 * produces an OAuth redirect to an error page, and the user reasonably
 * concludes Medosha is broken. Section 23 asked for exactly this: do not build
 * a UI that claims to publish when the platform access has not been
 * configured.
 */
export async function enabledPlatforms(): Promise<SocialPlatform[]> {
  const settings = await readSettings(["enabled_platforms"]);
  const configured = settings.get("enabled_platforms");

  const admitted: string[] = Array.isArray(configured)
    ? configured.filter((entry): entry is string => typeof entry === "string")
    : // No row: Medosha only. It needs no credentials and cannot mislead.
      ["medosha"];

  return SOCIAL_PLATFORMS.filter(
    (platform) => admitted.includes(platform) && hasCredentials(platform),
  );
}

/**
 * Whether the server can talk to a platform at all.
 *
 * Medosha is this application, so it is always ready. Everything else needs
 * its variables present — checked by name from the spec, so adding a platform
 * does not mean remembering to extend a switch statement here.
 */
export function hasCredentials(platform: SocialPlatform): boolean {
  const spec = PLATFORM_SPECS[platform];
  if (spec.credentialVars.length === 0) return true;
  return spec.credentialVars.every((name) => {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
}

/** Which platforms are unavailable, and why, for the connection screen. */
export async function platformAvailability(): Promise<
  { platform: SocialPlatform; available: boolean; reason: string | null }[]
> {
  const settings = await readSettings(["enabled_platforms"]);
  const configured = settings.get("enabled_platforms");
  const admitted: string[] = Array.isArray(configured)
    ? configured.filter((entry): entry is string => typeof entry === "string")
    : ["medosha"];

  return SOCIAL_PLATFORMS.map((platform) => {
    if (!hasCredentials(platform)) {
      return {
        platform,
        available: false,
        reason: `Not configured on this site. The owner needs to set ${PLATFORM_SPECS[platform].credentialVars.join(" and ")}.`,
      };
    }
    if (!admitted.includes(platform)) {
      return {
        platform,
        available: false,
        reason: "Switched off by the site administrator.",
      };
    }
    return { platform, available: true, reason: null };
  });
}

/* -------------------------------------------------------------------------- */
/* Posting limits                                                             */
/* -------------------------------------------------------------------------- */

export type Allowance =
  | { ok: true; used: number; limit: number; window: "week" | "month" }
  | { ok: false; reason: string; used: number; limit: number; window: "week" | "month" };

/** Reads a per-plan number out of a jsonb object, restrictively. */
function planNumber(value: unknown, plan: AccountPlan, fallback: number): number {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entry = (value as Record<string, unknown>)[plan];
    if (typeof entry === "number" && Number.isFinite(entry)) return entry;
  }
  return fallback;
}

/**
 * Whether this member may publish another post.
 *
 * Both windows are checked, weekly first, because the weekly one is the one a
 * user will hit and the message should name it. Counting is done by the
 * database function, over successful publishes only — a failed Instagram call
 * has cost the user nothing and must not cost them their allowance either.
 *
 * The zero case is a refusal with a plan name in it rather than a bare "limit
 * reached": a free account is not rate-limited, it is not entitled, and those
 * are different sentences.
 */
export async function postingAllowance(userId: string): Promise<Allowance> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, is_admin")
    .eq("id", userId)
    .maybeSingle();

  // An admin is not metered. They are the ones testing whether metering works.
  if (profile?.is_admin) {
    return { ok: true, used: 0, limit: Number.MAX_SAFE_INTEGER, window: "week" };
  }

  const plan = (profile?.plan ?? "free") as AccountPlan;
  const settings = await readSettings(["weekly_post_limit", "monthly_post_limit"]);

  const weekLimit = planNumber(settings.get("weekly_post_limit"), plan, 0);
  const monthLimit = planNumber(settings.get("monthly_post_limit"), plan, 0);

  const [week, month] = await Promise.all([
    countPublished(userId, 7),
    countPublished(userId, 30),
  ]);

  if (weekLimit <= 0) {
    return {
      ok: false,
      reason:
        "AI posting is not included in your plan. Upgrade to Pro or above to create posts with Medosha AI.",
      used: week,
      limit: 0,
      window: "week",
    };
  }

  if (week >= weekLimit) {
    return {
      ok: false,
      reason: `You have published ${week} of ${weekLimit} posts this week. The allowance resets as older posts pass seven days.`,
      used: week,
      limit: weekLimit,
      window: "week",
    };
  }

  if (monthLimit > 0 && month >= monthLimit) {
    return {
      ok: false,
      reason: `You have published ${month} of ${monthLimit} posts this month.`,
      used: month,
      limit: monthLimit,
      window: "month",
    };
  }

  return { ok: true, used: week, limit: weekLimit, window: "week" };
}

async function countPublished(userId: string, days: number): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_posts_published_in_window", {
    member: userId,
    window_days: days,
  });

  // An unreadable count must not become an unlimited allowance. Returning a
  // large number here fails closed: the member is told to try again rather
  // than being quietly let through a limit nobody could read.
  if (error) {
    console.error(`[medosha-social] allowance query failed: ${error.message}`);
    return Number.MAX_SAFE_INTEGER;
  }

  return typeof data === "number" ? data : 0;
}

/** Whether automatic publishing is offered on this site at all. */
export async function autoPublishAvailable(): Promise<boolean> {
  const settings = await readSettings(["auto_publish_available"]);
  return settings.get("auto_publish_available") === true;
}
