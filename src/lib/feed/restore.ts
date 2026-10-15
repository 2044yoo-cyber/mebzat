import type { FeedCursor, FeedPost } from "@/lib/feed/types";

/**
 * Where somebody was in the feed, so that opening a card and coming back
 * returns them to the same card rather than to a new first page at the top.
 *
 * Only a return restores. A fresh visit — a link to Home, a reload, a new
 * tab — starts a new reading, because that is the moment the feed should
 * change. A return is told apart by the history entry: the Navigation API
 * gives each entry a key that survives going back and forward and nothing
 * else, and where a browser lacks it, a `popstate` moments before the feed
 * mounted stands in. A reload keeps the entry's key, so the first mount in a
 * document never restores; it is the server's page being hydrated, and the
 * server has already ranked a new one.
 *
 * sessionStorage, as for the signed-out seen list: a tab's memory, gone with
 * the tab. Every access is wrapped, because a private window or a webview
 * throws here rather than returning nothing.
 */

export type FeedSnapshot = {
  scope: string;
  entry: string | null;
  /** The chip that was selected. */
  filter: string;
  savedAt: number;
  posts: FeedPost[];
  cursor: FeedCursor | null;
  exhausted: boolean;
  /** The reading's clock, which sightings are recorded against. */
  session: string | null;
  /** The signed-out session's frozen seen list, so page two ranks as page one did. */
  seen: string[] | null;
  /** The card at the top of the screen, and how far its top was below the screen's. */
  anchor: { id: string; offset: number } | null;
  heights: [string, number][];
};

const KEY = "medosha.feed.snapshot";
/** Long enough to read a listing and come back; short enough not to resurrect yesterday. */
const MAX_AGE_MS = 30 * 60 * 1000;
/** More than this many cards and the snapshot is skipped rather than risk the storage quota. */
const MAX_POSTS = 300;

let booted = false;
let traversedAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    traversedAt = Date.now();
  });
}

type NavigationLike = { currentEntry?: { key?: string } | null };

/**
 * The history entry the feed is showing in. Read once, when it mounts: by the
 * time a navigation unmounts it the browser is already on the next entry.
 */
export function entryKey(): string | null {
  if (typeof window === "undefined") return null;
  const navigation = (window as unknown as { navigation?: NavigationLike }).navigation;
  return navigation?.currentEntry?.key ?? null;
}

/** Marks the document as past its first render. Called from the feed's mount effect. */
export function markBooted(): void {
  booted = true;
}

/** The snapshot for this scope, when this mount is a return to it. Pure: safe to call twice. */
export function takeSnapshot(scope: string): FeedSnapshot | null {
  if (typeof window === "undefined" || !booted) return null;
  let snapshot: FeedSnapshot | null = null;
  try {
    const raw = sessionStorage.getItem(KEY);
    snapshot = raw ? (JSON.parse(raw) as FeedSnapshot) : null;
  } catch {
    return null;
  }
  if (!snapshot || snapshot.scope !== scope || !Array.isArray(snapshot.posts)) return null;
  if (Date.now() - snapshot.savedAt > MAX_AGE_MS) return null;

  const key = entryKey();
  const returning = key !== null && snapshot.entry !== null
    ? key === snapshot.entry
    : Date.now() - traversedAt < 10_000;
  return returning ? snapshot : null;
}

export function saveSnapshot(snapshot: Omit<FeedSnapshot, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    if (snapshot.posts.length === 0 || snapshot.posts.length > MAX_POSTS) {
      sessionStorage.removeItem(KEY);
      return;
    }
    const full: FeedSnapshot = { ...snapshot, savedAt: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    // Full or blocked: coming back starts a new reading instead.
  }
}

/** Which feed a snapshot belongs to: the page, what it is fixed to show, and who is reading. */
export function feedScope(parts: { path: string; savedOnly: boolean; followingOnly: boolean; authorKey: string | null; signedIn: boolean }): string {
  return [parts.path, parts.savedOnly ? "saved" : "", parts.followingOnly ? "following" : "", parts.authorKey ?? "", parts.signedIn ? "in" : "out"].join("|");
}

/**
 * Forgets the snapshot. After the reader changes what the feed should lean
 * towards, going back to Home must start a reading with those settings, not
 * resume one ranked without them.
 */
export function clearSnapshot(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored, or storage blocked: either way nothing to resume.
  }
}
