import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Hashtag, Post, PostComment, PostKind } from "@/types/database.types";

/**
 * Reads for the Community.
 *
 * Every list returns `available: false` rather than throwing when the tables
 * are missing, so a page can explain that migration 0010 has not been applied
 * instead of rendering an empty feed as though nobody had posted.
 */

export const PAGE_SIZE = 20;

export type PostAuthor = {
  id: string;
  username: string | null;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  account_type: string | null;
};

export type PostRow = Post & {
  author: PostAuthor | null;
  company: { id: string; name: string; slug: string; logo_url: string | null } | null;
  images: { id: string; url: string; video_url: string | null; alt: string | null }[];
};

export type PostFeed = {
  posts: PostRow[];
  total: number;
  available: boolean;
};

export type PostSort = "recent" | "popular" | "discussed";

const COLUMNS = `
  *,
  author:profiles!author_id(id, username, full_name, company_name, avatar_url, account_type),
  company:companies(id, name, slug, logo_url),
  images:post_images(id, url, video_url, alt)
`;

const SORTS: Record<PostSort, { column: string; ascending: boolean }> = {
  recent: { column: "created_at", ascending: false },
  popular: { column: "like_count", ascending: false },
  discussed: { column: "comment_count", ascending: false },
};

export async function getPosts(options: {
  kind?: PostKind;
  tag?: string;
  authorId?: string;
  sort?: PostSort;
  page?: number;
  pageSize?: number;
} = {}): Promise<PostFeed> {
  const {
    kind,
    tag,
    authorId,
    sort = "recent",
    page = 1,
    pageSize = PAGE_SIZE,
  } = options;

  const supabase = await createClient();

  // A tag filter needs the join table first: PostgREST cannot filter a parent
  // by a many-to-many child without an inner join, and resolving the ids up
  // front keeps the feed query itself simple.
  let postIds: string[] | null = null;
  if (tag) {
    const { data: hashtag } = await supabase
      .from("hashtags")
      .select("id")
      .eq("tag", tag.toLowerCase().replace(/^#/, ""))
      .maybeSingle();

    if (!hashtag) return { posts: [], total: 0, available: true };

    const { data: links } = await supabase
      .from("post_hashtags")
      .select("post_id")
      .eq("hashtag_id", hashtag.id)
      .limit(500);

    postIds = (links ?? []).map((link) => link.post_id);
    if (postIds.length === 0) return { posts: [], total: 0, available: true };
  }

  let builder = supabase
    .from("posts")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "published");

  if (kind) builder = builder.eq("kind", kind);
  if (authorId) builder = builder.eq("author_id", authorId);
  if (postIds) builder = builder.in("id", postIds);

  const order = SORTS[sort];
  const from = (page - 1) * pageSize;

  const { data, count, error } = await builder
    .order(order.column, { ascending: order.ascending })
    .range(from, from + pageSize - 1);

  if (error) return { posts: [], total: 0, available: false };

  return {
    posts: (data ?? []) as unknown as PostRow[],
    total: count ?? 0,
    available: true,
  };
}

export async function getPost(id: string): Promise<PostRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as PostRow;
}

export type CommentRow = PostComment & {
  author: PostAuthor | null;
};

/**
 * All comments on a post, flat.
 *
 * Threading is applied in the component from `parent_id` rather than by a
 * recursive query: one level of nesting over at most a few hundred rows is
 * cheaper to arrange in memory than in SQL.
 */
export async function getComments(postId: string): Promise<CommentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("post_comments")
    .select(
      "*, author:profiles!author_id(id, username, full_name, company_name, avatar_url, account_type)",
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(300);

  return (data ?? []) as unknown as CommentRow[];
}

/** Which of these posts the viewer has already liked. */
export async function likedPostIds(
  postIds: string[],
  userId: string | null,
): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);

  return new Set((data ?? []).map((row) => row.post_id));
}

/** The most-used tags, for the trending rail. */
export async function getTrendingHashtags(limit = 12): Promise<Hashtag[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hashtags")
    .select("*")
    .gt("post_count", 0)
    .order("post_count", { ascending: false })
    .limit(limit);

  return (data ?? []) as Hashtag[];
}
