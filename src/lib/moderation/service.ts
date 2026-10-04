import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { watermarkForPublishing } from "@/lib/images/watermark-pipeline";

import {
  activeProvider,
  isModerationConfigured,
  type ProviderVerdict,
} from "./provider";
import {
  isPublishable,
  type ContentKind,
  type ModerationCategory,
  type ModerationOutcome,
  type ModerationStatus,
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
    // The record could not be written. That used to return `review` with no
    // item id, and the upload path refused anything without one — so a
    // database that was momentarily unavailable, or an install where this
    // table had not been migrated yet, failed every image upload on the site
    // with "Could not publish that image. Tap retry." Retrying did not help,
    // because nothing about the image was wrong.
    //
    // The real verdict is returned instead, so a `blocked` image is still
    // refused when its record cannot be written — refusing is the safety-
    // critical direction and that one still fails closed. Everything else
    // publishes, unaudited, which is the correct trade for content no check
    // objected to.
    console.error("[moderation] could not record decision:", error?.message);
    return { status: verdict.status, category: verdict.category };
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

  // Not having looked at something is not a reason to suspect it.
  //
  // This returned `review`, and `review` is what every upload on an install
  // with no classifier key therefore became — the setup help said so in as
  // many words: "every upload goes to review rather than being published".
  // Every photograph of a finished kitchen went into a moderators' queue that,
  // on a site with no provider configured, nobody was ever going to empty.
  //
  // Nothing is loosened by this. With no provider there is no verdict, so
  // nothing was ever going to be blocked either way; the only difference is
  // whether ordinary work waits in a queue first.
  if (!provider) {
    return {
      status: "safe",
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
      // An outage is not a finding. Failing to `review` here meant that on a
      // day the provider was down, every upload on the platform went to a
      // person — which is both the queue nobody can clear and the delay
      // nobody can explain.
      console.error("[moderation] text check failed:", error);
      verdicts.push({
        status: "safe",
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
        status: "safe",
        provider: provider.name,
        reason: "image check unavailable",
      });
    }
  }

  if (verdicts.length === 0) {
    // Something this provider cannot check — a video with no frame
    // extraction, say. Same reasoning as the two above: the reason is
    // recorded on the row, so these are findable later, but an unchecked
    // upload is not held in front of a moderator as though it were suspect.
    return {
      status: "safe",
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
 * Approving a quarantined file: mark it, copy it to the public bucket, record
 * the paths.
 *
 * The copy happens here and nowhere else, which is what makes "published"
 * mean "cleared". The database will refuse a public path on a row that is not
 * safe, so even a bug in this function cannot produce a published-but-unchecked
 * file — it can only fail to publish a clean one.
 *
 * It is also the only place where a private file becomes a public one, which
 * makes it the only place a watermark can be applied and be certain to cover
 * every surface. Eight upload components call this; none of them needs to know
 * the feature exists.
 */
export async function publishApproved(
  client: SupabaseClient,
  /**
   * The moderation record, when there is one.
   *
   * Null means nothing could be recorded — the table was unreachable, or an
   * install has not migrated it yet. That is not a reason to refuse somebody's
   * photograph, so this publishes without it. The caller has already refused
   * anything a check objected to; what arrives here with no id is content no
   * check objected to and no row could be written for.
   */
  itemId: string | null,
  quarantinePath: string,
  publicBucket: string,
  /** The sniffed type, not the browser's claim. */
  mime?: string,
  /**
   * Who is publishing, for the watermark, when there is no record to read it
   * from. Ignored when `itemId` is set: the row is the better source.
   */
  fallback?: { userId: string | null; contentType: ContentKind },
): Promise<string | null> {
  let owner: string | null = fallback?.userId ?? null;
  let kind: ContentKind | undefined = fallback?.contentType;

  if (itemId) {
    const { data: item } = await client
      .from("moderation_items")
      .select("status, user_id, content_type")
      .eq("id", itemId)
      .maybeSingle();

    // `review` publishes too. This read `item.status !== "safe"`, which is
    // what made an earlier change in `upload-actions.ts` do nothing: the
    // caller stopped refusing a review verdict and then asked this to publish
    // it, and got null back. `blocked` and `pending` still return nothing,
    // and the database constraint says the same thing independently.
    if (!item || !isPublishable(item.status as ModerationStatus)) return null;

    owner = item.user_id as string | null;
    kind = item.content_type as ContentKind;
  }

  const download = await client.storage
    .from("moderation-quarantine")
    .download(quarantinePath);

  if (download.error || !download.data) {
    console.error("[moderation] could not read quarantined file");
    return null;
  }

  const original = new Uint8Array(await download.data.arrayBuffer());
  const contentType = mime ?? download.data.type ?? "image/jpeg";

  const marked = kind
    ? await watermarkForPublishing({
        client,
        userId: owner,
        contentType: kind,
        bytes: original,
        mime: contentType,
      })
    : null;

  // Same filename, new bucket. Keeping the name means a path that was recorded
  // before approval still resolves afterwards — and it means the original in
  // the private bucket sits at the path its published copy can be found by.
  const publicPath = quarantinePath;
  const upload = await client.storage
    .from(publicBucket)
    .upload(publicPath, marked ? marked.buffer : download.data, {
      upsert: false,
      contentType: marked ? marked.mime : contentType,
    });

  if (upload.error) {
    console.error("[moderation] could not publish:", upload.error.message);
    return null;
  }

  const {
    data: { publicUrl },
  } = client.storage.from(publicBucket).getPublicUrl(publicPath);

  // The unmarked file is only kept when the published one actually differs
  // from it. Without this the author would have handed over their photograph
  // and got back only the copy with a name written across it.
  let originalPath: string | null = null;
  if (marked?.watermarked) {
    const kept = await client.storage
      .from("image-originals")
      .upload(publicPath, download.data, { upsert: true, contentType });
    if (kept.error) {
      console.error("[moderation] could not keep original:", kept.error.message);
    } else {
      originalPath = publicPath;
    }
  }

  if (itemId) {
    await client
      .from("moderation_items")
      .update({
        public_path: publicPath,
        watermarked: marked?.watermarked ?? false,
        original_path: originalPath,
      })
      .eq("id", itemId);
  }

  // The quarantine copy is not kept. It has served its purpose and holding a
  // second copy of every image on the platform is storage nobody needs.
  await client.storage.from("moderation-quarantine").remove([quarantinePath]);

  return publicUrl;
}

/**
 * Taking a reported file out of view.
 *
 * `hidden_at` on its own hides nothing: the file is in a public bucket and the
 * pages that render it hold its URL, not a join to the moderation row. So this
 * moves the bytes back to quarantine — private, folder-scoped, unreachable by
 * URL — and clears `public_path`. A direct link stops working, which is the
 * only version of "hidden" worth the name.
 *
 * The original is left where it is. Nothing has been decided yet, and a
 * moderator who clears this needs something to put back.
 *
 * Never throws. A report that fails to hide must still be recorded, and it
 * has been by the time this runs.
 */
export async function hideReported(
  client: SupabaseClient,
  itemId: string,
  publicBucket: string,
): Promise<boolean> {
  const { data: item } = await client
    .from("moderation_items")
    .select("public_path, hidden_at")
    .eq("id", itemId)
    .maybeSingle();

  if (!item?.public_path || !item.hidden_at) return false;

  const path = item.public_path as string;

  try {
    const download = await client.storage.from(publicBucket).download(path);
    if (download.error || !download.data) return false;

    // Put it somewhere only a moderator and its author can reach before
    // taking it out of the public bucket, so a failure here cannot lose it.
    const kept = await client.storage
      .from("moderation-quarantine")
      .upload(path, download.data, { upsert: true });
    if (kept.error) {
      console.error("[moderation] could not re-quarantine:", kept.error.message);
      return false;
    }

    const removed = await client.storage.from(publicBucket).remove([path]);
    if (removed.error) {
      console.error("[moderation] could not unpublish:", removed.error.message);
      return false;
    }

    await client
      .from("moderation_items")
      .update({ public_path: null, quarantine_path: path })
      .eq("id", itemId);

    return true;
  } catch (error) {
    console.error("[moderation] hide failed:", error);
    return false;
  }
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
