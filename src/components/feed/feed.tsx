"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { FeedCard } from "@/components/feed/feed-card";
import { FeedSkeleton } from "@/components/feed/feed-skeleton";
import { fetchFeedPage, feedApi } from "@/lib/feed/client";
import { FEED_FILTERS } from "@/lib/feed/constants";
import type { FeedPage, FeedPost } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

/**
 * The Smart Discovery Feed.
 *
 * The first page is rendered on the server and handed in, so the homepage
 * paints content rather than a spinner — on a slow mobile connection that is
 * the difference between a site that feels instant and one that feels broken.
 * Everything after it is fetched here.
 *
 * Three things keep it cheap on a phone:
 *
 *  - Loading is driven by an IntersectionObserver on a sentinel a screen and
 *    a half below the fold, not by a scroll handler. A scroll handler fires
 *    on every frame; this fires once.
 *  - Cards more than a few screens away are unmounted and replaced by a box
 *    of the height they occupied, so a reader forty cards deep is still
 *    rendering about a dozen. That is the virtual-scrolling requirement, done
 *    without measuring every card up front.
 *  - Impressions are batched and posted on an idle callback, so the
 *    recommendation signal never competes with the scroll for the main
 *    thread.
 */

/** Cards kept mounted on either side of the visible range. */
const WINDOW = 8;
/** Assumed height of an unmounted card, until one has been measured. */
const ASSUMED_CARD_HEIGHT = 520;

export function Feed({
  initial,
  signedIn,
  viewer,
  filter: initialFilter = "for-you",
  savedOnly = false,
  followingOnly = false,
  authorKey = null,
  showFilters = true,
}: {
  initial: FeedPage;
  signedIn: boolean;
  viewer: { name: string; avatarUrl: string | null } | null;
  filter?: string;
  savedOnly?: boolean;
  followingOnly?: boolean;
  authorKey?: string | null;
  showFilters?: boolean;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [posts, setPosts] = useState<FeedPost[]>(initial.posts);
  const [cursor, setCursor] = useState(initial.cursor);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [exhausted, setExhausted] = useState(initial.cursor === null);

  const root = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // Guards against the observer firing twice before the first request has
  // updated `loading` — React batches that update, the observer does not wait.
  const inFlight = useRef(false);

  const loadMore = useCallback(async () => {
    if (inFlight.current || exhausted || !cursor) return;
    inFlight.current = true;
    setLoading(true);

    const page = await fetchFeedPage({
      cursor,
      filter,
      savedOnly,
      followingOnly,
      authorKey,
    });

    setPosts((current) => {
      // A post can arrive twice when its score moved between pages. Cheaper
      // to drop the duplicate here than to make the ranking immutable.
      const seen = new Set(current.map((post) => post.id));
      return [...current, ...page.posts.filter((post) => !seen.has(post.id))];
    });
    setCursor(page.cursor);
    if (!page.cursor) setExhausted(true);

    setLoading(false);
    inFlight.current = false;
  }, [cursor, exhausted, filter, savedOnly, followingOnly, authorKey]);

  // Infinite scroll. `rootMargin` starts the request a screen and a half
  // early, which is roughly how far a fast thumb travels while a request is
  // in flight on a 3G connection.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "150% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  async function changeFilter(next: string) {
    if (next === filter) return;
    setFilter(next);
    setSwitching(true);
    setExhausted(false);

    const page = await fetchFeedPage({
      filter: next,
      savedOnly,
      followingOnly,
      authorKey,
    });

    setPosts(page.posts);
    setCursor(page.cursor);
    if (!page.cursor) setExhausted(true);
    setSwitching(false);

    // Back to the top of the new feed. Keeping the old scroll position after
    // a filter change lands the reader in the middle of content they have
    // never seen.
    //
    // `scrollIntoView` rather than `window.scrollTo`: the workspace column
    // scrolls, not the window, and scrolling the window would do nothing at
    // all on any route inside the shell.
    root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function hide(postId: string) {
    setPosts((current) => current.filter((post) => post.id !== postId));
  }

  return (
    <div ref={root}>
      {showFilters && (
        <FilterChips value={filter} onChange={(next) => void changeFilter(next)} />
      )}

      {switching ? (
        <FeedSkeleton count={3} />
      ) : posts.length === 0 ? (
        <Empty
          available={initial.available}
          savedOnly={savedOnly}
          followingOnly={followingOnly}
        />
      ) : (
        <>
          <ImpressionTracker posts={posts} signedIn={signedIn} />
          <VirtualList
            posts={posts}
            signedIn={signedIn}
            viewer={viewer}
            onHidden={hide}
          />
        </>
      )}

      <div ref={sentinel} aria-hidden className="h-px" />

      {loading && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Finding more for you…
        </p>
      )}

      {exhausted && posts.length > 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          That is everything for now. Check back later — the feed changes
          through the day.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Virtualisation
// ---------------------------------------------------------------------------

/**
 * Unmounts cards that are far off screen.
 *
 * Each card is wrapped in a slot that reports its own height once, through an
 * IntersectionObserver on the slot rather than a ResizeObserver on every
 * card. When a slot leaves the window its card is replaced by a spacer of the
 * recorded height, so the scrollbar does not move and scrolling back re-mounts
 * it in place.
 *
 * Without IntersectionObserver everything stays mounted — slower on a long
 * feed, but correct, which is the right way round for a fallback.
 */
function VirtualList({
  posts,
  signedIn,
  viewer,
  onHidden,
}: {
  posts: FeedPost[];
  signedIn: boolean;
  viewer: { name: string; avatarUrl: string | null } | null;
  onHidden: (postId: string) => void;
}) {
  const [visible, setVisible] = useState({ first: 0, last: WINDOW * 2 });
  const heights = useRef(new Map<string, number>());
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = container.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        let low = Number.POSITIVE_INFINITY;
        let high = -1;

        for (const entry of entries) {
          const index = Number(
            (entry.target as HTMLElement).dataset.index ?? "-1",
          );
          if (index < 0) continue;
          if (entry.isIntersecting) {
            low = Math.min(low, index);
            high = Math.max(high, index);
          }
        }

        if (high < 0) return;

        setVisible((current) => {
          const first = Math.max(0, low - WINDOW);
          const last = high + WINDOW;
          // Only widen or shift; a narrower window on the same scroll
          // position would unmount a card the reader is looking at.
          if (first >= current.first && last <= current.last) return current;
          return { first: Math.min(first, current.first + WINDOW), last };
        });
      },
      { rootMargin: "100% 0px" },
    );

    for (const slot of node.querySelectorAll("[data-index]")) {
      observer.observe(slot);
    }

    return () => observer.disconnect();
  }, [posts.length]);

  return (
    <div ref={container} className="space-y-3">
      {posts.map((post, index) => {
        const mounted = index >= visible.first && index <= visible.last;

        return (
          <div
            key={post.id}
            data-index={index}
            // The measurement lives entirely in the ref callback. Reading the
            // map during render would mean reading a ref during render, which
            // is both a lint error and a real bug — the value written after
            // the last commit would not be the value this render sees.
            ref={(node) => {
              if (!node) return;
              if (mounted) {
                const height = node.getBoundingClientRect().height;
                if (height > 0) heights.current.set(post.id, height);
                node.style.minHeight = "";
              } else {
                // Hold the space the card occupied so unmounting it does not
                // move the scrollbar under the reader's thumb.
                node.style.minHeight = `${
                  heights.current.get(post.id) ?? ASSUMED_CARD_HEIGHT
                }px`;
              }
            }}
          >
            {mounted && (
              <FeedCard
                post={post}
                signedIn={signedIn}
                viewer={viewer}
                priority={index === 0}
                onHidden={onHidden}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Impressions
// ---------------------------------------------------------------------------

/**
 * What the reader actually saw.
 *
 * A card counts as seen once half of it has been on screen. Ids are collected
 * and flushed in batches — one request per twelve cards rather than one per
 * card — and the flush runs on an idle callback so it never competes with the
 * scroll.
 *
 * Signed out there is nothing to record against, so the whole thing is inert.
 */
function ImpressionTracker({
  posts,
  signedIn,
}: {
  posts: FeedPost[];
  signedIn: boolean;
}) {
  const pending = useRef(new Set<string>());
  const sent = useRef(new Set<string>());

  useEffect(() => {
    if (!signedIn || typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      const batch = [...pending.current];
      pending.current.clear();
      if (batch.length === 0) return;

      const send = () => void feedApi.view(batch);
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(send, { timeout: 2000 });
      } else {
        send();
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.feedPost;
          if (!id || sent.current.has(id)) continue;
          sent.current.add(id);
          pending.current.add(id);
          observer.unobserve(entry.target);
        }

        if (pending.current.size > 0 && timer === null) {
          timer = setTimeout(flush, 1500);
        }
      },
      { threshold: 0.5 },
    );

    for (const card of document.querySelectorAll("[data-feed-post]")) {
      observer.observe(card);
    }

    return () => {
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
      flush();
    };
  }, [posts.length, signedIn]);

  return null;
}

// ---------------------------------------------------------------------------
// Chips and empty states
// ---------------------------------------------------------------------------

function FilterChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter the feed"
      className="sticky top-0 z-20 -mx-3 mb-3 flex gap-2 overflow-x-auto bg-background/85 px-3 py-2 backdrop-blur [scrollbar-width:none] @lg/ws:mx-0 @lg/ws:rounded-2xl @lg/ws:px-2 [&::-webkit-scrollbar]:hidden"
    >
      {FEED_FILTERS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="tab"
          aria-selected={value === chip.id}
          onClick={() => onChange(chip.id)}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
            value === chip.id
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <span aria-hidden>{chip.emoji}</span>
          {chip.label}
        </button>
      ))}
    </div>
  );
}

function Empty({
  available,
  savedOnly,
  followingOnly,
}: {
  available: boolean;
  savedOnly: boolean;
  followingOnly: boolean;
}) {
  if (!available) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <RefreshCw className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          The feed is not set up yet
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Apply migrations 0026 and 0027 in the Supabase SQL editor, then
          reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="text-sm font-medium text-foreground">
        {savedOnly
          ? "Nothing saved yet"
          : followingOnly
            ? "You are not following anyone yet"
            : "Nothing here yet"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {savedOnly
          ? "Tap the bookmark on anything worth keeping and it will appear here."
          : followingOnly
            ? "Follow a few people and their work will show up here first."
            : "Try another filter — there is more going on elsewhere in the feed."}
      </p>
    </div>
  );
}
