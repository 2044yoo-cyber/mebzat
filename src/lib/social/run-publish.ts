import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { idempotencyKey, publish } from "./publishers";
import { PLATFORM_SPECS, type SocialPlatform } from "./platforms";
import type { Database } from "@/types/database.types";

/**
 * Publishing one post to every platform it targets.
 *
 * Extracted so the route a person clicks and the cron job a clock fires run
 * *the same code*. The route's own comment promised that and did not deliver
 * it — the scheduler would have been a second implementation of the rule that
 * only approved posts go out, and the second implementation is the one that
 * gets it wrong at three in the morning with nobody watching.
 *
 * ## What this function assumes has already happened
 *
 * The caller has established that the post may be published: it exists, it
 * belongs to whoever asked, and its status is one of approved / scheduled /
 * failed. This function does not re-check that, because its two callers check
 * it differently and both correctly — the route reads the row through the
 * member's own client so RLS decides ownership, and the scheduler claims the
 * row atomically so two workers cannot both proceed.
 *
 * What this function *does* own is the part that must not vary: claim before
 * calling, log every outcome, never let one platform's failure stop another.
 */

type Client = SupabaseClient<Database>;

export type PublishOutcome = {
  platform: SocialPlatform;
  ok: boolean;
  error: string | null;
  /** True when the attempt was skipped because it had already been made. */
  duplicate: boolean;
};

export type RunPublishOptions = {
  postId: string;
  ownerId: string;
  companyId: string | null;
  imageUrl: string | null;
  sourceType: string;
  sourceId: string | null;
  /** Reads and writes the member's own rows. RLS applies. */
  client: Client;
  /**
   * Writes the publish log. Must be the service role.
   *
   * `social_publish_log` grants members no insert policy — a log its subject
   * can write is not a log — so passing the member's client here makes every
   * claim match zero rows. Separate parameter rather than created inside, so
   * the caller cannot accidentally pass one client for both.
   */
  logger: Client;
  /**
   * The window this attempt belongs to.
   *
   * Part of the idempotency key, and the reason a retry is safe. A manual
   * publish uses the minute; a scheduled one uses its scheduled time, so a
   * cron that runs twice for the same slot collides instead of double-posting.
   */
  slot: string;
};

export async function runPublish(
  options: RunPublishOptions,
): Promise<PublishOutcome[]> {
  const { data: versions } = await options.client
    .from("ai_content_versions")
    .select("*")
    .eq("post_id", options.postId)
    .eq("enabled", true);

  if (!versions || versions.length === 0) return [];

  const outcomes: PublishOutcome[] = [];

  for (const version of versions) {
    const key = idempotencyKey(options.postId, version.platform, options.slot);

    // The claim goes in before the platform is called. Claiming afterwards
    // cannot prevent a double post — by then the post exists.
    const { error: claimError } = await options.logger
      .from("social_publish_log")
      .insert({
        post_id: options.postId,
        version_id: version.id,
        owner_id: options.ownerId,
        platform: version.platform,
        ok: false,
        error: "in progress",
        idempotency_key: key,
      });

    if (claimError) {
      // 23505 is unique_violation: this exact attempt has already been made.
      // Not an error — it is the mechanism working.
      if (claimError.code === "23505") {
        outcomes.push({
          platform: version.platform,
          ok: false,
          error: "Already attempted for this slot — not sent again.",
          duplicate: true,
        });
        continue;
      }

      console.error(`[medosha-social] claim failed: ${claimError.message}`);
      outcomes.push({
        platform: version.platform,
        ok: false,
        error: "Could not start publishing.",
        duplicate: false,
      });
      continue;
    }

    const result = await publish({
      postId: options.postId,
      versionId: version.id,
      ownerId: options.ownerId,
      platform: version.platform,
      body: version.body,
      hashtags: version.hashtags,
      imageUrl: version.image_url ?? options.imageUrl,
      companyId: options.companyId,
      sourceType: options.sourceType,
      sourceId: options.sourceId,
      client: options.client,
    });

    // The claim row is completed with the outcome, never deleted. A failed
    // attempt is a thing that happened and belongs in the history.
    await options.logger
      .from("social_publish_log")
      .update({
        ok: result.ok,
        external_post_id: result.ok ? result.externalPostId : null,
        external_url: result.ok ? result.externalUrl : null,
        error: result.ok ? null : result.error,
        error_code: result.ok ? null : result.code,
      })
      .eq("idempotency_key", key);

    await options.client
      .from("ai_content_versions")
      .update(
        result.ok
          ? {
              status: "published" as const,
              published_at: new Date().toISOString(),
              external_post_id: result.externalPostId,
              external_url: result.externalUrl,
            }
          : { status: "failed" as const },
      )
      .eq("id", version.id);

    outcomes.push({
      platform: version.platform,
      ok: result.ok,
      error: result.ok ? null : result.error,
      duplicate: false,
    });
  }

  return outcomes;
}

/**
 * The master status after a run.
 *
 * Published when any platform took it. A post that reached Medosha but not
 * Instagram is published *and* carries a failure in its history — which is why
 * the per-platform log exists and why the master status is not the whole
 * story.
 *
 * A run that did nothing but collide with itself leaves the status alone: it
 * was already handled, and marking it failed would turn a working safeguard
 * into a red badge.
 */
export function statusAfter(
  outcomes: PublishOutcome[],
): "published" | "failed" | null {
  if (outcomes.length === 0) return null;
  if (outcomes.some((outcome) => outcome.ok)) return "published";
  if (outcomes.every((outcome) => outcome.duplicate)) return null;
  return "failed";
}

/** One notification for the run, naming what failed and why. */
export async function notifyPublishResult(
  client: Client,
  userId: string,
  postId: string,
  outcomes: PublishOutcome[],
): Promise<void> {
  if (outcomes.length === 0) return;

  const succeeded = outcomes.filter((outcome) => outcome.ok);
  const failed = outcomes.filter((outcome) => !outcome.ok && !outcome.duplicate);

  if (succeeded.length === 0 && failed.length === 0) return;

  const names = (list: PublishOutcome[]) =>
    list.map((entry) => PLATFORM_SPECS[entry.platform].label).join(", ");

  const title =
    failed.length === 0
      ? `Published to ${names(succeeded)}`
      : succeeded.length === 0
        ? "Your post could not be published"
        : `Published to ${names(succeeded)} — ${failed.length} failed`;

  await client.from("notifications").insert({
    user_id: userId,
    kind: "ai_alert",
    title,
    // The first failure's reason. A notification saying "1 failed" with no
    // reason makes somebody open the page to learn what they could have been
    // told here.
    body: failed[0]?.error ?? null,
    href: `/studio/content/${postId}`,
  });
}
