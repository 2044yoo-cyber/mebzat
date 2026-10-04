import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PLATFORM_SPECS, type SocialPlatform } from "./platforms";
import { hasCredentials } from "./settings";
import { refreshToken } from "./oauth";
import {
  publishFacebook,
  publishInstagram,
  publishTikTok,
} from "./platform-api";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database.types";

/**
 * Sending a post to a platform.
 *
 * One adapter per platform, all with the same signature, so the publishing
 * route has no per-platform branches and the scheduler has none either.
 *
 * ## Three of these four are not implemented, and say so
 *
 * Section 23 of the brief: do not fake API integrations, and do not build a UI
 * that claims to publish when the platform access has not been configured.
 *
 * Facebook, Instagram and TikTok all need an app that has been through the
 * platform's review — Meta will not grant `pages_manage_posts` or
 * `instagram_content_publish` to an unreviewed app, and TikTok publishes every
 * post privately until an audit passes. None of that can be written here; it
 * is paperwork the site owner does with the platform.
 *
 * So those three adapters return a refusal that names exactly what is missing,
 * and the row that goes into the publish log says the same thing. What they do
 * not do is pretend: there is no code below that posts to a mock endpoint, no
 * "simulated success", and no adapter that returns ok without having sent
 * anything. A publish log full of successes that never happened is worse than
 * an empty one.
 *
 * Medosha's own feed is fully implemented, because it is this application and
 * needs no permission from anybody.
 */

export type PublishRequest = {
  postId: string;
  versionId: string;
  ownerId: string;
  platform: SocialPlatform;
  body: string;
  hashtags: string[];
  imageUrl: string | null;
  /** The company to post as, when the member chose one. */
  companyId: string | null;
  /** What the post is about, for the Medosha feed's context columns. */
  sourceType: string;
  sourceId: string | null;
  client: SupabaseClient<Database>;
};

export type PublishResult =
  | {
      ok: true;
      externalPostId: string | null;
      externalUrl: string | null;
      /**
       * A caveat about a post that succeeded.
       *
       * TikTok publishes privately until the app passes audit — the call
       * succeeds and nobody but the creator can see the result. Recording that
       * beside the success is the difference between a log that is true and
       * one that merely says "published".
       */
      note?: string;
    }
  | {
      ok: false;
      /** Shown to the member. Never a raw API body. */
      error: string;
      /** The platform's own code, for support. */
      code: string | null;
      /**
       * Whether trying again could work.
       *
       * A rate limit is worth retrying; a personal Instagram account is not,
       * and retrying it hourly for a week helps nobody.
       */
      retryable: boolean;
    };

/* -------------------------------------------------------------------------- */
/* Medosha                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Publishing to Medosha's own community feed.
 *
 * Writes an ordinary row into `posts` — the table the feed has always read.
 * The feed does not know or care that a machine drafted it, which is the point
 * of not having built a second posts table.
 *
 * The hashtags are appended to the body rather than stored separately, because
 * `posts` has no hashtag column and adding one to serve this feature would be
 * a schema change for a formatting preference.
 */
async function publishToMedosha(
  request: PublishRequest,
): Promise<PublishResult> {
  const body = [
    request.body,
    request.hashtags.length > 0
      ? request.hashtags.map((tag) => `#${tag}`).join(" ")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // `posts.body` is checked between 1 and 20000 characters. Trimming here
  // rather than letting the insert fail turns a hard error into a post that is
  // very slightly shorter than intended.
  const trimmed = body.slice(0, 20_000);

  // `context_type` is the `message_context` enum: project, product, company,
  // profile. A property post has no matching value, so it carries no context
  // rather than being mislabelled as something it is not.
  const contextType =
    request.sourceType === "project" ||
    request.sourceType === "product" ||
    request.sourceType === "company" ||
    request.sourceType === "profile"
      ? request.sourceType
      : null;

  const { data, error } = await request.client
    .from("posts")
    .insert({
      author_id: request.ownerId,
      company_id: request.companyId,
      kind: "post",
      body: trimmed,
      context_type: contextType,
      context_id: contextType ? request.sourceId : null,
      status: "published",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(`[medosha-social] feed insert failed: ${error?.message}`);
    return {
      ok: false,
      error: "The post could not be added to the Medosha feed.",
      code: error?.code ?? null,
      retryable: true,
    };
  }

  return {
    ok: true,
    externalPostId: data.id,
    externalUrl: `/feed/${data.id}`,
  };
}

/* -------------------------------------------------------------------------- */
/* The platforms that need app review                                         */
/* -------------------------------------------------------------------------- */

/**
 * The refusal an unconfigured platform returns.
 *
 * Names the variables and the requirement, because "publishing failed" sends
 * somebody to a support form and this sends them to the fix. `retryable` is
 * false: nothing about waiting will make an unconfigured app configured.
 */
function notConfigured(platform: SocialPlatform): PublishResult {
  const spec = PLATFORM_SPECS[platform];
  return {
    ok: false,
    error:
      `${spec.label} publishing is not set up on this site. ` +
      `The site owner needs to configure ${spec.credentialVars.join(" and ")} ` +
      `and complete ${spec.label}'s app review.`,
    code: "not_configured",
    retryable: false,
  };
}

/**
 * Facebook, Instagram and TikTok.
 *
 * One function because the checks in front of the call are identical for all
 * three — credentials, a connection, the right status, an image where the
 * platform demands one — and only the last step differs. The per-platform
 * calls live in `platform-api.ts`.
 *
 * The token is read here, with the service role, and passed down. It is the
 * only place in the application that reads `social_accounts.access_token`, and
 * it never returns it to the caller.
 */
async function publishToExternal(
  request: PublishRequest,
): Promise<PublishResult> {
  if (!hasCredentials(request.platform)) {
    return notConfigured(request.platform);
  }

  const spec = PLATFORM_SPECS[request.platform];

  // The token-bearing row. Service role, because members have no select policy
  // on this table — which is the whole point of the table's design.
  const service = createServiceClient();

  const { data: account } = await service
    .from("social_accounts")
    .select(
      "status, display_name, external_id, page_id, access_token, refresh_token, token_expires_at",
    )
    .eq("owner_id", request.ownerId)
    .eq("platform", request.platform)
    .maybeSingle();

  if (!account || !account.access_token) {
    return {
      ok: false,
      error: `No ${spec.label} account is connected. Connect one in Settings.`,
      code: "not_connected",
      retryable: false,
    };
  }

  if (account.status === "revoked" || account.status === "expired") {
    return {
      ok: false,
      error: `Medosha's access to ${spec.label} has ended. Reconnect the account.`,
      code: account.status,
      retryable: false,
    };
  }

  if (account.status === "permission_required") {
    return {
      ok: false,
      error:
        `${spec.label} has not granted the permission needed to publish. ` +
        spec.requirements[0],
      code: "permission_required",
      retryable: false,
    };
  }

  let token = account.access_token;

  // Refresh before publishing rather than after a failure. Only TikTok needs
  // it; the helper returns null for the others, which is the correct answer
  // and not a gap — a Meta Page token from a long-lived user token does not
  // expire.
  if (
    account.token_expires_at &&
    account.refresh_token &&
    new Date(account.token_expires_at).getTime() - Date.now() < 10 * 60 * 1000
  ) {
    const refreshed = await refreshToken(request.platform, account.refresh_token);

    if (refreshed) {
      token = refreshed.accessToken;
      await service
        .from("social_accounts")
        .update({
          access_token: refreshed.accessToken,
          refresh_token: refreshed.refreshToken,
          token_expires_at: refreshed.expiresAt,
        })
        .eq("owner_id", request.ownerId)
        .eq("platform", request.platform);
    } else {
      // The refresh failed, so the stored token is about to stop working.
      // Marked, so the connection card says "reconnect" rather than the user
      // discovering it on their next scheduled post.
      await service
        .from("social_accounts")
        .update({ status: "expired", last_error: "The access token could not be refreshed." })
        .eq("owner_id", request.ownerId)
        .eq("platform", request.platform);

      return {
        ok: false,
        error: `${spec.label} access has expired and could not be renewed. Reconnect the account.`,
        code: "refresh_failed",
        retryable: false,
      };
    }
  }

  const caption = [
    request.body,
    request.hashtags.length > 0
      ? request.hashtags.map((tag) => `#${tag}`).join(" ")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result =
    request.platform === "facebook"
      ? await publishFacebook({
          pageId: account.page_id ?? account.external_id ?? "",
          accessToken: token,
          message: caption,
          imageUrl: request.imageUrl,
        })
      : request.platform === "instagram"
        ? await publishInstagram({
            igUserId: account.external_id ?? "",
            accessToken: token,
            caption,
            imageUrl: request.imageUrl,
          })
        : await publishTikTok({
            accessToken: token,
            caption,
            imageUrl: request.imageUrl,
            // Opt-in, and false by default. Claiming audit that has not
            // happened would publish privately while telling the user it was
            // public.
            audited: process.env.TIKTOK_AUDITED === "true",
          });

  // A token the platform has rejected is recorded, so the next attempt refuses
  // early and the connection card explains itself.
  if (!result.ok && (result.code === "token_expired" || result.code === "access_token_invalid")) {
    await service
      .from("social_accounts")
      .update({ status: "expired", last_error: result.error })
      .eq("owner_id", request.ownerId)
      .eq("platform", request.platform);
  }

  if (!result.ok && result.code === "permission_denied") {
    await service
      .from("social_accounts")
      .update({ status: "permission_required", last_error: result.error })
      .eq("owner_id", request.ownerId)
      .eq("platform", request.platform);
  }

  return result;
}

/* -------------------------------------------------------------------------- */

const ADAPTERS: Record<
  SocialPlatform,
  (request: PublishRequest) => Promise<PublishResult>
> = {
  medosha: publishToMedosha,
  facebook: publishToExternal,
  instagram: publishToExternal,
  tiktok: publishToExternal,
};

export async function publish(
  request: PublishRequest,
): Promise<PublishResult> {
  try {
    return await ADAPTERS[request.platform](request);
  } catch (error) {
    // An adapter that throws must not take the whole publish run with it —
    // Facebook failing should not stop Instagram being attempted.
    console.error(
      `[medosha-social] ${request.platform} adapter threw:`,
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      error: `Publishing to ${PLATFORM_SPECS[request.platform].label} failed unexpectedly.`,
      code: null,
      retryable: true,
    };
  }
}

/**
 * The key that makes a publish attempt happen at most once.
 *
 * Post, platform and the scheduled slot. Including the slot rather than the
 * clock means a retry within the same slot collides — which is the intent —
 * while a deliberate republish to a new schedule does not.
 */
export function idempotencyKey(
  postId: string,
  platform: SocialPlatform,
  slot: string,
): string {
  return `${postId}:${platform}:${slot}`;
}
