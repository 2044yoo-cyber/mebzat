import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  activeProvider,
  isModerationConfigured,
  type ProviderVerdict,
} from "./provider";
import type {
  ContentKind,
  ModerationCategory,
  ModerationOutcome,
  ModerationStatus,
} from "./types";

/**
 * The one function every surface calls.
 *
 * Community posts, comments, property listings, marketplace listings, profile
 * images, videos and whatever comes next all go through `moderate()`. The
 * alternative — a check bolted onto each upload component — is five
 * implementations that drift, and the sixth feature someone adds without one.
 *
 * ## Failure is never silence
 *
 * Three ways this can go wrong and all three resolve the same way. No provider
 * configured, the provider errored, the provider timed out: the content goes to
 * `review`. Never `safe`. A moderation system that publishes when its checker
 * is unavailable is a system that fails open, which is the only unforgivable
 * way for one to fail.
 *
 * ## Nothing sensitive is stored
 *
 * The record holds a status, a category and a score. Not the text, not the
 * image, not a thumbnail. A moderation table containing copies of what it
 * rejected would be a database full of exactly the material it exists to keep
 * off the platform.
 */

const MAX_TEXT = 20_000;

export type ModerateInput = {
  client: SupabaseClient;
  userId: string;
  contentType: ContentKind;
  contentId?: string;
  /** Title, body, caption — whatever a person typed. */
  text?: string;
  /** A data URL or an https URL. Quarantined before this is called. */
  image?: string;
  /** Where the file is waiting, if there is one. */
  quarantinePath?: string;
  signal?: AbortSignal;
};

export async function moderate(input: ModerateInput): Promise<ModerationOutcome> {
  const verdict = await runChecks(input);

  // Written before anything is published, so there is a record even if the
  // caller crashes immediately afterwards.
  const { data, error } = await input.client
    .from("moderation_items")
    .insert({
      content_type: input.contentType,
      content_id: input.contentId ?? null,
      user_id: input.userId,
      status: verdict.status,
      category: verdict.category ?? null,
      reason: verdict.reason?.slice(0, 500) ?? null,
      confidence: verdict.confidence ?? null,
      provider: verdict.provider,
      model: verdict.model ?? null,
      quarantine_path: input.quarantinePath ?? null,
      last_action:
        verdict.status === "safe"
          ? "auto_approved"
          : verdict.status === "blocked"
            ? "auto_blocked"
            : "auto_flagged",
    })
    .select("id")
    .single();

  if (error || !data) {
    // The record could not be written, so nothing may be published — there
    // would be no way to review, appeal or audit it afterwards.
    console.error("[moderation] could not record decision:", error?.message);
    return { status: "review" };
  }

  await audit(input.client, data.id, null, verdict.status, verdict);

  return {
    status: verdict.status,
    category: verdict.category,
    itemId: data.id,
  };
}

/**
 * The checks themselves.
 *
 * Text and image both, when both are present, and the worse verdict wins — a
 * clean photograph with a solicitation in the caption is not clean.
 */
async function runChecks(input: ModerateInput): Promise<ProviderVerdict> {
  const provider = activeProvider();

  if (!provider) {
    return {
      status: "review",
      provider: "none",
      reason: "no moderation provider configured",
    };
  }

  const verdicts: ProviderVerdict[] = [];

  if (input.text?.trim() && provider.moderateText) {
    try {
      verdicts.push(
        await provider.moderateText(input.text.slice(0, MAX_TEXT), input.signal),
      );
    } catch (error) {
      console.error("[moderation] text check failed:", error);
      verdicts.push({
        status: "review",
        provider: provider.name,
        reason: "text check unavailable",
      });
    }
  }

  if (input.image && provider.moderateImage) {
    try {
      verdicts.push(await provider.moderateImage(input.image, input.signal));
    } catch (error) {
      console.error("[moderation] image check failed:", error);
      verdicts.push({
        status: "review",
        provider: provider.name,
        reason: "image check unavailable",
      });
    }
  }

  if (verdicts.length === 0) {
    // Something was submitted that this provider cannot check — a video with
    // no frame extraction, say. Reviewed by a person rather than waved through.
    return {
      status: "review",
      provider: provider.name,
      reason: "nothing checkable for this provider",
    };
  }

  return worst(verdicts);
}

/** Severity order. `safe` only survives if every check agreed. */
const RANK: Record<ModerationStatus, number> = {
  safe: 0,
  pending: 1,
  review: 2,
  blocked: 3,
};

export function worst(verdicts: ProviderVerdict[]): ProviderVerdict {
  return verdicts.reduce((worstSoFar, candidate) =>
    RANK[candidate.status] > RANK[worstSoFar.status] ? candidate : worstSoFar,
  );
}

/**
 * Approving a quarantined file: copy to the public bucket, record the path.
 *
 * The copy happens here and nowhere else, which is what makes "published"
 * mean "cleared". The database will refuse a public path on a row that is not
 * safe, so even a bug in this function cannot produce a published-but-unchecked
 * file — it can only fail to publish a clean one.
 */
export async function publishApproved(
  client: SupabaseClient,
  itemId: string,
  quarantinePath: string,
  publicBucket: string,
): Promise<string | null> {
  const { data: item } = await client
    .from("moderation_items")
    .select("status, user_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item || item.status !== "safe") return null;

  const download = await client.storage
    .from("moderation-quarantine")
    .download(quarantinePath);

  if (download.error || !download.data) {
    console.error("[moderation] could not read quarantined file");
    return null;
  }

  // Same filename, new bucket. Keeping the name means a path that was recorded
  // before approval still resolves afterwards.
  const publicPath = quarantinePath;
  const upload = await client.storage
    .from(publicBucket)
    .upload(publicPath, download.data, { upsert: false });

  if (upload.error) {
    console.error("[moderation] could not publish:", upload.error.message);
    return null;
  }

  const {
    data: { publicUrl },
  } = client.storage.from(publicBucket).getPublicUrl(publicPath);

  await client
    .from("moderation_items")
    .update({ public_path: publicPath })
    .eq("id", itemId);

  // The quarantine copy is not kept. It has served its purpose and holding a
  // second copy of every image on the platform is storage nobody needs.
  await client.storage.from("moderation-quarantine").remove([quarantinePath]);

  return publicUrl;
}

/** Appends to the trail. Never throws — a failed audit must not fail a decision. */
export async function audit(
  client: SupabaseClient,
  itemId: string | null,
  actorId: string | null,
  status: ModerationStatus,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const action =
    actorId === null
      ? status === "safe"
        ? "auto_approved"
        : status === "blocked"
          ? "auto_blocked"
          : "auto_flagged"
      : status === "safe"
        ? "moderator_approved"
        : "moderator_removed";

  try {
    await client.from("moderation_audit").insert({
      item_id: itemId,
      actor_id: actorId,
      action,
      // Scores and categories only. Never the content that was judged.
      detail: {
        status,
        category: (detail as { category?: ModerationCategory }).category ?? null,
        confidence: (detail as { confidence?: number }).confidence ?? null,
        provider: (detail as { provider?: string }).provider ?? null,
      },
    });
  } catch (error) {
    console.error("[moderation] audit write failed:", error);
  }
}

export { isModerationConfigured };
