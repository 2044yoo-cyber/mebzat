import type { FeedComment, FeedCursor, FeedPage } from "@/lib/feed/types";

/**
 * The browser's half of the feed.
 *
 * Every card would otherwise carry its own fetch, its own error handling and
 * its own idea of what the API returns. These are the only functions that talk
 * to `/api/feed`, and each one returns a plain result the caller can act on
 * rather than throwing into an event handler where nothing catches it.
 */

export type InteractResult =
  | { ok: true; liked?: boolean; saved?: boolean; following?: boolean; count?: number }
  | { ok: false; error: string; needsAuth?: boolean };

async function post(body: Record<string, unknown>): Promise<InteractResult> {
  try {
    const response = await fetch("/api/feed/interact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      return {
        ok: false,
        error:
          typeof data.error === "string"
            ? data.error
            : "That did not go through.",
        needsAuth: data.needsAuth === true,
      };
    }

    return {
      ok: true,
      liked: typeof data.liked === "boolean" ? data.liked : undefined,
      saved: typeof data.saved === "boolean" ? data.saved : undefined,
      following:
        typeof data.following === "boolean" ? data.following : undefined,
      count: typeof data.count === "number" ? data.count : undefined,
    };
  } catch {
    // Offline, or the request was aborted by a navigation. Neither is worth
    // a stack trace in the console of a phone on a weak connection.
    return { ok: false, error: "You appear to be offline." };
  }
}

export const feedApi = {
  like: (postId: string) => post({ action: "like", postId }),
  save: (postId: string) => post({ action: "save", postId }),
  follow: (authorKey: string) => post({ action: "follow", authorKey }),
  share: (postId: string) => post({ action: "share", postId }),
  hide: (postId: string) => post({ action: "hide", postId }),
  download: (fileId: string) => post({ action: "download", fileId }),
  likeComment: (commentId: string) => post({ action: "comment-like", commentId }),
  report: (postId: string, reason: string, detail?: string) =>
    post({ action: "report", postId, reason, detail }),
  /** Impressions, sent in batches. Failure is silent by design. */
  view: (postIds: string[]) => post({ action: "view", postIds }),
};

/**
 * What this browser has already been shown, for a reader who is not signed in.
 *
 * sessionStorage rather than localStorage: it is a reading session's memory,
 * not a profile. Closing the tab forgets it, which is the right lifetime for
 * something the reader never agreed to and cannot see or clear from the page.
 *
 * Every read and write is wrapped, because a private window, a browser set to
 * block site data, and an embedded webview all throw here rather than
 * returning nothing — and a feed that crashes because it could not remember
 * what it showed is worse than one that repeats itself.
 */
const SEEN_KEY = "medosha.feed.seen";
const SEEN_LIMIT = 400;

export function rememberSeen(ids: string[]): void {
  if (typeof sessionStorage === "undefined" || ids.length === 0) return;
  try {
    const kept = new Set(recallSeen());
    for (const id of ids) kept.add(id);
    // Oldest first out. A session that reads for an hour should not be pinned
    // to whatever it happened to see in the first minute.
    const list = [...kept].slice(-SEEN_LIMIT);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    // Storage is full, or blocked. The feed still works, it just repeats more.
  }
}

export function recallSeen(): string[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((one): one is string => typeof one === "string")
      : [];
  } catch {
    return [];
  }
}

export type FeedRequest = {
  cursor?: FeedCursor | null;
  /** Ids this session has been shown. Sent only when signed out — the server
   *  ignores it otherwise, and a signed-in reader's history is the database's. */
  seenIds?: string[] | null;
  filter?: string;
  authorKey?: string | null;
  savedOnly?: boolean;
  followingOnly?: boolean;
  search?: string | null;
  limit?: number;
  signal?: AbortSignal;
};

export async function fetchFeedPage(request: FeedRequest): Promise<FeedPage> {
  const params = new URLSearchParams();

  if (request.cursor) {
    params.set("score", request.cursor.score);
    params.set("after", request.cursor.id);
    params.set("now", request.cursor.now);
    params.set("seed", String(request.cursor.seed));
  }
  if (request.filter && request.filter !== "for-you") {
    params.set("filter", request.filter);
  }
  if (request.authorKey) params.set("author", request.authorKey);
  if (request.savedOnly) params.set("saved", "1");
  if (request.followingOnly) params.set("following", "1");
  if (request.search) params.set("q", request.search);
  if (request.limit) params.set("limit", String(request.limit));

  // POST only when there is a list to send: four hundred uuids do not fit in
  // a URL. Everything else stays a plain GET.
  const seen = request.seenIds ?? [];
  const response = seen.length > 0
    ? await fetch(`/api/feed?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seen }),
        signal: request.signal,
      })
    : await fetch(`/api/feed?${params.toString()}`, { signal: request.signal });

  if (!response.ok) {
    return { posts: [], cursor: null, available: true };
  }

  return (await response.json()) as FeedPage;
}

export async function fetchComments(postId: string): Promise<FeedComment[]> {
  const response = await fetch(
    `/api/feed/comments?postId=${encodeURIComponent(postId)}`,
  );
  if (!response.ok) return [];
  const data = (await response.json()) as { comments?: FeedComment[] };
  return data.comments ?? [];
}

export type PostCommentResult =
  | { ok: true; comments: FeedComment[] }
  | { ok: false; error: string; needsAuth?: boolean };

export async function postComment(input: {
  postId: string;
  parentId?: string | null;
  body: string;
  imageUrl?: string | null;
}): Promise<PostCommentResult> {
  try {
    const response = await fetch("/api/feed/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    const data = (await response.json().catch(() => ({}))) as {
      comments?: FeedComment[];
      error?: string;
      needsAuth?: boolean;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: data.error ?? "The comment did not post.",
        needsAuth: data.needsAuth,
      };
    }

    return { ok: true, comments: data.comments ?? [] };
  } catch {
    return { ok: false, error: "You appear to be offline." };
  }
}

/**
 * Shrink a picked photo before it is attached to a comment.
 *
 * A phone camera produces four megabytes and a comment needs about eighty
 * kilobytes. Doing this in the browser means the upload is small on the
 * connection the reader actually has, which on a mobile network is the whole
 * difference between "posted" and "still posting".
 *
 * WebP where the browser will encode it, JPEG otherwise. `toDataURL` silently
 * falls back to PNG for an unsupported type, so the result is checked rather
 * than assumed.
 */
export async function compressImage(
  file: File,
  maxEdge = 1280,
  quality = 0.72,
): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", quality);
}
