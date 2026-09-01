import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  FEED_PAGE_SIZE,
  isFeedKind,
  isFeedTopic,
  type FeedKind,
  type FeedTopic,
} from "@/lib/feed/constants";
import type {
  FeedAuthorSummary,
  FeedComment,
  FeedCursor,
  FeedFile,
  FeedMedia,
  FeedPage,
  FeedPost,
  TrendingTag,
} from "@/lib/feed/types";

/**
 * Reading the Smart Discovery Feed.
 *
 * All of the ranking lives in `feed_page` in the database, which is where it
 * belongs: the score depends on the reader's likes, saves, follows and view
 * history, and pulling all of that to the server to sort in JavaScript would
 * mean four extra round trips per page of twelve cards.
 *
 * Nothing here throws. A missing migration returns `available: false` so the
 * homepage can explain what to run, and a query failure returns an empty page
 * rather than a 500 — an empty feed is a bad homepage, an error page is a
 * broken one.
 */

const UNDEFINED_FUNCTION = "42883";
const UNDEFINED_TABLE = "42P01";

/** Postgres's row shape from `feed_page`. */
type FeedPageRow = {
  id: string;
  kind: string;
  topic: string;
  title: string;
  body: string | null;
  author_id: string | null;
  author_key: string;
  author_name: string | null;
  author_username: string | null;
  author_role: string | null;
  author_avatar_url: string | null;
  author_location: string | null;
  author_verified: boolean;
  company_id: string | null;
  link_href: string | null;
  link_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  price_amount: string | number | null;
  price_currency: string | null;
  price_unit: string | null;
  price_change: string | number | null;
  city: string | null;
  region: string | null;
  tags: string[] | null;
  like_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
  view_count: number;
  download_count: number;
  is_demo: boolean;
  published_at: string;
  media: unknown;
  files: unknown;
  viewer_liked: boolean;
  viewer_saved: boolean;
  viewer_follows: boolean;
  score: string | number;
};

/** Numerics arrive as strings from PostgREST to avoid float rounding. */
function num(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function media(value: unknown): FeedMedia[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): FeedMedia[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.url !== "string") return [];
    return [
      {
        id: row.id,
        kind: row.kind === "video" ? "video" : "image",
        url: row.url,
        posterUrl: typeof row.posterUrl === "string" ? row.posterUrl : null,
        alt: typeof row.alt === "string" ? row.alt : null,
        label: typeof row.label === "string" ? row.label : null,
        durationSeconds:
          typeof row.durationSeconds === "number" ? row.durationSeconds : null,
        width: typeof row.width === "number" ? row.width : null,
        height: typeof row.height === "number" ? row.height : null,
      },
    ];
  });
}

function files(value: unknown): FeedFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): FeedFile[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.url !== "string" ||
      typeof row.name !== "string"
    ) {
      return [];
    }
    return [
      {
        id: row.id,
        fileKind: (typeof row.fileKind === "string"
          ? row.fileKind
          : "pdf") as FeedFile["fileKind"],
        name: row.name,
        url: row.url,
        sizeBytes: typeof row.sizeBytes === "number" ? row.sizeBytes : null,
        downloadCount:
          typeof row.downloadCount === "number" ? row.downloadCount : 0,
      },
    ];
  });
}

/**
 * One database row to one card.
 *
 * Rows whose kind or topic the client does not recognise are dropped rather
 * than rendered as an unknown card — that happens when the database is ahead
 * of the deployed build, and a blank card is worse than one fewer card.
 */
function normalize(row: FeedPageRow): FeedPost | null {
  if (!isFeedKind(row.kind) || !isFeedTopic(row.topic)) return null;

  return {
    id: row.id,
    kind: row.kind,
    topic: row.topic,
    title: row.title,
    body: row.body,
    authorId: row.author_id,
    authorKey: row.author_key,
    authorName: row.author_name ?? "Medosha member",
    authorUsername: row.author_username,
    authorRole: row.author_role,
    authorAvatarUrl: row.author_avatar_url,
    authorLocation: row.author_location,
    authorVerified: row.author_verified,
    companyId: row.company_id,
    linkHref: row.link_href,
    linkLabel: row.link_label,
    entityType: row.entity_type,
    entityId: row.entity_id,
    priceAmount: num(row.price_amount),
    priceCurrency: row.price_currency ?? "ETB",
    priceUnit: row.price_unit,
    priceChange: num(row.price_change),
    city: row.city,
    region: row.region,
    tags: row.tags ?? [],
    likeCount: row.like_count,
    commentCount: row.comment_count,
    saveCount: row.save_count,
    shareCount: row.share_count,
    viewCount: row.view_count,
    downloadCount: row.download_count,
    isDemo: row.is_demo,
    publishedAt: row.published_at,
    media: media(row.media),
    files: files(row.files),
    viewerLiked: row.viewer_liked,
    viewerSaved: row.viewer_saved,
    viewerFollows: row.viewer_follows,
    score: String(row.score),
  };
}

export type FeedQuery = {
  limit?: number;
  cursor?: FeedCursor | null;
  kinds?: FeedKind[] | null;
  topics?: FeedTopic[] | null;
  authorKey?: string | null;
  savedOnly?: boolean;
  followingOnly?: boolean;
  search?: string | null;
};

export async function getFeedPage(query: FeedQuery = {}): Promise<FeedPage> {
  const {
    limit = FEED_PAGE_SIZE,
    cursor = null,
    kinds = null,
    topics = null,
    authorKey = null,
    savedOnly = false,
    followingOnly = false,
    search = null,
  } = query;

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("feed_page", {
    p_limit: limit,
    // The first page fixes the clock; every page after it reuses that value
    // so the age term cannot move a post across a page boundary mid-scroll.
    p_now: cursor?.now ?? new Date().toISOString(),
    // The cursor carries the score as a string so it survives the query
    // string unchanged; p_after_score is numeric.
    p_after_score: cursor ? Number(cursor.score) : null,
    p_after_id: cursor?.id ?? null,
    p_kinds: kinds && kinds.length > 0 ? kinds : null,
    p_topics: topics && topics.length > 0 ? topics : null,
    p_author_key: authorKey,
    p_saved_only: savedOnly,
    p_following_only: followingOnly,
    p_search: search && search.trim().length > 1 ? search.trim() : null,
  });

  if (error) {
    const missing =
      error.code === UNDEFINED_FUNCTION ||
      error.code === UNDEFINED_TABLE ||
      /could not find the function|schema cache/i.test(error.message);

    // A transport failure and a database failure look the same in the log
    // otherwise, and they have nothing in common. supabase-js reports a
    // request that never completed as "TypeError: fetch failed" with no code;
    // anything the database actually answered carries a PostgREST code.
    const transport = !error.code && /fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(error.message);

    if (transport) {
      // supabase-js puts the real reason in details, not message: message is
      // always the generic "TypeError: fetch failed" while details carries the
      // "Caused by: ... (ENOTFOUND | ECONNREFUSED | CERT_* | ETIMEDOUT)" line
      // that actually identifies the failure. Logging only message is what
      // made this take so long to pin down.
      console.error(
        `[medosha:feed] feed_page could not reach Supabase: ${error.message}\n` +
          `${error.details || "(no cause reported)"}`,
      );
    } else {
      console.error(
        `[medosha:feed] feed_page failed (${error.code ?? "no code"}): ${error.message}`,
      );
    }

    return { posts: [], cursor: null, available: !missing };
  }

  const rows = (data ?? []) as FeedPageRow[];
  const posts = rows.flatMap((row) => {
    const post = normalize(row);
    return post ? [post] : [];
  });

  // A short page is the end of the feed. Asking for one more page to find an
  // empty one is a wasted round trip on every reader who scrolls to the
  // bottom, which on a feed is most of them.
  const last = rows.length === limit ? rows[rows.length - 1] : undefined;

  return {
    posts,
    cursor: last
      ? {
          score: String(last.score),
          id: last.id,
          now: cursor?.now ?? new Date().toISOString(),
        }
      : null,
    available: true,
  };
}

/** A single post, for the permalink page. */
export async function getFeedPost(id: string): Promise<FeedPost | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("feed_posts")
    .select(
      `*, media:feed_media(*), files:feed_files(*)`,
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as Record<string, unknown>;

  // The permalink does not go through `feed_page`, so the viewer's own state
  // has to be fetched separately. Two tiny indexed lookups.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let liked = false;
  let saved = false;
  let follows = false;

  if (user) {
    const [likeRow, saveRow, followRow] = await Promise.all([
      supabase
        .from("feed_likes")
        .select("post_id")
        .eq("post_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("feed_saves")
        .select("post_id")
        .eq("post_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("feed_follows")
        .select("author_key")
        .eq("author_key", String(row.author_key ?? ""))
        .eq("follower_id", user.id)
        .maybeSingle(),
    ]);
    liked = Boolean(likeRow.data);
    saved = Boolean(saveRow.data);
    follows = Boolean(followRow.data);
  }

  // `feed_media`/`feed_files` come back snake_cased from PostgREST, unlike the
  // jsonb the ranking function builds, so they are mapped to the same shape
  // here before `normalize` sees them.
  const mediaRows = Array.isArray(row.media) ? row.media : [];
  const fileRows = Array.isArray(row.files) ? row.files : [];

  return normalize({
    ...(row as unknown as FeedPageRow),
    media: mediaRows
      .map((entry) => entry as Record<string, unknown>)
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        url: entry.url,
        posterUrl: entry.poster_url,
        alt: entry.alt,
        label: entry.label,
        durationSeconds: entry.duration_seconds,
        width: entry.width,
        height: entry.height,
      })),
    files: fileRows
      .map((entry) => entry as Record<string, unknown>)
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .map((entry) => ({
        id: entry.id,
        fileKind: entry.file_kind,
        name: entry.name,
        url: entry.url,
        sizeBytes: entry.size_bytes,
        downloadCount: entry.download_count,
      })),
    viewer_liked: liked,
    viewer_saved: saved,
    viewer_follows: follows,
    score: "0",
  });
}

export async function getFeedComments(postId: string): Promise<FeedComment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("feed_comment_tree", {
    p_post: postId,
    p_limit: 200,
  });

  if (error) {
    console.error(`[medosha:feed] comment tree failed: ${error.message}`);
    return [];
  }

  type Row = {
    id: string;
    parent_id: string | null;
    depth: number;
    body: string;
    image_url: string | null;
    like_count: number;
    created_at: string;
    author_id: string | null;
    author_name: string | null;
    author_username: string | null;
    author_avatar_url: string | null;
    is_demo: boolean;
    viewer_liked: boolean;
  };

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    depth: row.depth,
    body: row.body,
    imageUrl: row.image_url,
    likeCount: row.like_count,
    createdAt: row.created_at,
    authorId: row.author_id,
    authorName: row.author_name ?? "Medosha member",
    authorUsername: row.author_username,
    authorAvatarUrl: row.author_avatar_url,
    isDemo: row.is_demo,
    viewerLiked: row.viewer_liked,
  }));
}

export async function getSuggestedAuthors(
  limit = 6,
): Promise<FeedAuthorSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("feed_suggested_authors", {
    p_limit: limit,
  });

  if (error) return [];

  type Row = {
    author_key: string;
    author_id: string | null;
    name: string | null;
    role: string | null;
    avatar_url: string | null;
    location: string | null;
    verified: boolean;
    post_count: number;
    follower_count: number;
    contribution_score: number;
  };

  return ((data ?? []) as Row[]).map((row) => ({
    authorKey: row.author_key,
    authorId: row.author_id,
    name: row.name ?? "Medosha member",
    role: row.role,
    avatarUrl: row.avatar_url,
    location: row.location,
    verified: row.verified,
    postCount: row.post_count,
    followerCount: row.follower_count,
    contributionScore: row.contribution_score,
  }));
}

export async function getTrendingTags(limit = 12): Promise<TrendingTag[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("feed_trending_tags", {
    p_limit: limit,
  });

  if (error) return [];

  type Row = { tag: string; post_count: number; engagement: number };

  return ((data ?? []) as Row[]).map((row) => ({
    tag: row.tag,
    postCount: row.post_count,
    engagement: row.engagement,
  }));
}
