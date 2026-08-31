import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  AiContentPost,
  AiContentSchedule,
  AiContentStatus,
  AiContentVersion,
  SocialAccountPublic,
  SocialPublishLogEntry,
} from "@/types/database.types";

/**
 * Reads for the AI content pages.
 *
 * Like `billing.ts`, none of these filters by owner. `ai_content_posts` has a
 * select policy of `owner_id = auth.uid()` and the versions reach it through
 * an existence check, so the filter is already applied underneath. A second
 * copy in the query would be a second place for the rule to drift.
 *
 * The one place an id *is* passed is `getContentPost`, and that is a lookup,
 * not a permission: RLS decides whether the row comes back.
 */

export type ContentPostDetail = {
  post: AiContentPost;
  versions: AiContentVersion[];
  /** Every attempt, newest first. Empty until something has been published. */
  attempts: SocialPublishLogEntry[];
};

export async function getContentPost(
  id: string,
): Promise<ContentPostDetail | null> {
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("ai_content_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!post) return null;

  const [versions, attempts] = await Promise.all([
    supabase
      .from("ai_content_versions")
      .select("*")
      .eq("post_id", id)
      // Medosha first, then the outside platforms. The one that always works
      // is the one somebody reads first.
      .order("platform", { ascending: true }),
    supabase
      .from("social_publish_log")
      .select("*")
      .eq("post_id", id)
      .order("attempted_at", { ascending: false }),
  ]);

  return {
    post,
    versions: versions.data ?? [],
    attempts: attempts.data ?? [],
  };
}

export type ContentListItem = AiContentPost & {
  /** Which platforms this post targets, for the calendar cell. */
  platforms: string[];
};

/**
 * The calendar's rows.
 *
 * One query for the posts and one for their versions, joined in memory. A
 * PostgREST embed would do it in one round trip, but it also returns every
 * version's full body — four platform captions per post, for thirty posts, to
 * render a grid that shows platform names. The two-query version transfers a
 * fraction of that.
 */
export async function listContentPosts(options: {
  from?: Date;
  to?: Date;
  status?: AiContentStatus[];
  limit?: number;
} = {}): Promise<ContentListItem[]> {
  const supabase = await createClient();

  let builder = supabase
    .from("ai_content_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 60);

  if (options.status?.length) builder = builder.in("status", options.status);

  // Bounded by the scheduled date where there is one. A post with no schedule
  // is a draft and belongs in the list regardless of the window.
  if (options.from) {
    builder = builder.or(
      `scheduled_for.gte.${options.from.toISOString()},scheduled_for.is.null`,
    );
  }
  if (options.to) {
    builder = builder.or(
      `scheduled_for.lte.${options.to.toISOString()},scheduled_for.is.null`,
    );
  }

  const { data: posts } = await builder;
  if (!posts || posts.length === 0) return [];

  const { data: versions } = await supabase
    .from("ai_content_versions")
    .select("post_id, platform, enabled")
    .in(
      "post_id",
      posts.map((post) => post.id),
    );

  const byPost = new Map<string, string[]>();
  for (const version of versions ?? []) {
    if (!version.enabled) continue;
    const list = byPost.get(version.post_id) ?? [];
    list.push(version.platform);
    byPost.set(version.post_id, list);
  }

  return posts.map((post) => ({
    ...post,
    platforms: byPost.get(post.id) ?? [],
  }));
}

/**
 * The member's connected accounts.
 *
 * Reads the view, never the table. The table carries access tokens and grants
 * no select policy; the view carries the same rows without those columns. A
 * page that reached for `social_accounts` directly would get nothing back,
 * which is the intended failure — but reaching for it is still the mistake, so
 * this function exists to make the right call the easy one.
 */
export async function getConnectedAccounts(): Promise<SocialAccountPublic[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("social_accounts_public")
    .select("*")
    .order("platform", { ascending: true });

  return data ?? [];
}

export async function getSchedules(): Promise<AiContentSchedule[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_content_schedules")
    .select("*")
    .order("created_at", { ascending: false });

  return data ?? [];
}

/** Publishing history across every post, for the history page. */
export async function getPublishHistory(
  limit = 50,
): Promise<SocialPublishLogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("social_publish_log")
    .select("*")
    .order("attempted_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}
