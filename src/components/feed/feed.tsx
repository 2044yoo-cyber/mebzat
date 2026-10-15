"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw, SlidersHorizontal } from "lucide-react";

import { FeedCard } from "@/components/feed/feed-card";
import { FeedSkeleton } from "@/components/feed/feed-skeleton";
import { FEED_CHANGE, fetchFeedPage, feedApi, recallSeen, rememberSeen, type FeedChange } from "@/lib/feed/client";
import { entryKey, feedScope, markBooted, saveSnapshot, takeSnapshot } from "@/lib/feed/restore";
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
/** How long half a card must stay on screen before it counts as read. */
const DWELL_MS = 1000;
/** Assumed height of an unmounted card, until one has been measured. */
/**
 * Only used for a card that has never been on screen.
 *
 * Deliberately generous. Guessing too tall leaves a gap that closes when the
 * card mounts and measures itself; guessing too short shortens the document,
 * and the browser answers that by clamping the scroll offset — which is the
 * reader being thrown up the page. The two errors are not symmetrical, so this
 * errs in the direction that cannot move anybody.
 */
const ASSUMED_CARD_HEIGHT = 720;

export function Feed({
  initial,
  signedIn,
  viewer,
  filter: initialFilter = "for-you",
  savedOnly = false,
  followingOnly = false,
  authorKey = null,
  showFilters = true,
  beforePosts,
  showDiagnostics = false,
}: {
  initial: FeedPage;
  signedIn: boolean;
  viewer: { name: string; avatarUrl: string | null } | null;
  filter?: string;
  savedOnly?: boolean;
  followingOnly?: boolean;
  authorKey?: string | null;
  showFilters?: boolean;
  beforePosts?: ReactNode;
  /**
   * Whether to name the missing migration when the feed tables are absent.
   *
   * Off by default, and passed only for an administrator. A visitor who meets
   * a half-installed deployment learns nothing useful from "apply migrations
   * 0026 and 0027" — it is an instruction they cannot follow, about a system
   * they did not know existed, and it reads as the site being broken by
   * someone careless. They get "nothing here yet"; the operator gets the
   * migration number.
   */
  showDiagnostics?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const scope = feedScope({ path: pathname, savedOnly, followingOnly, authorKey, signedIn });

  // Coming back from a card picks up where the reader was: the same cards, the
  // same cursor, the same place on the screen. Anything else is a new reading
  // and starts from the page the server just ranked.
  const [restored] = useState(() => takeSnapshot(scope));

  const [filter, setFilter] = useState(restored?.filter ?? initialFilter);
  const [posts, setPosts] = useState<FeedPost[]>(restored?.posts ?? initial.posts);
  const [cursor, setCursor] = useState(restored ? restored.cursor : initial.cursor);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  // A page that could not be read. Not the end: the cursor is kept and the
  // reader is offered another try, where an empty answer used to end the feed.
  const [failed, setFailed] = useState(restored ? false : initial.failed === true);
  const [exhausted, setExhausted] = useState(
    restored ? restored.exhausted : initial.cursor === null && initial.failed !== true,
  );

  const root = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // Guards against the observer firing twice before the first request has
  // updated `loading` — React batches that update, the observer does not wait.
  const inFlight = useRef(false);
  const failedNow = useRef(failed);
  const request = useRef<AbortController | null>(null);

  /**
   * The signed-out reader's seen list, frozen for one reading.
   *
   * The ranking treats these as already shown. Sending the list as it grows
   * would re-rank every page against a different list, and a card read on
   * page one would sink below the cursor and come round again. It is taken
   * when a reading starts and sent unchanged with every page of it; what is
   * read meanwhile goes to the next reading.
   */
  const sessionSeen = useRef<string[] | null>(restored?.seen ?? null);
  // When this reading began, as the server ranked it.
  const clock = useRef<string | null>(restored ? restored.session : (initial.session ?? null));

  // Card heights, kept with the snapshot so the cards above the one being
  // returned to hold their real space and the scroll lands where it was.
  const heights = useRef(new Map<string, number>(restored?.heights ?? []));
  const anchor = useRef(restored?.anchor ?? null);
  const entry = useRef<string | null>(restored?.entry ?? null);

  const loadMore = useCallback(async () => {
    if (inFlight.current || failedNow.current || exhausted || !cursor) return;
    inFlight.current = true;
    setLoading(true);
    const controller = new AbortController();
    request.current = controller;

    const page = await fetchFeedPage({
      cursor,
      filter,
      savedOnly,
      followingOnly,
      authorKey,
      // Signed in, the server ignores this and reads feed_views.
      seenIds: signedIn ? null : (sessionSeen.current ?? []),
      signal: controller.signal,
    });
    // Superseded by a filter change or a refresh, which started its own.
    if (controller.signal.aborted) return;

    if (page.failed) {
      failedNow.current = true;
      setFailed(true);
    } else {
      setPosts((current) => {
        // The ranking is pinned for the reading, so a page does not repeat
        // the one before it; this is the belt to that's braces.
        const shown = new Set(current.map((post) => post.id));
        return [...current, ...page.posts.filter((post) => !shown.has(post.id))];
      });
      setCursor(page.cursor);
      if (!page.cursor) setExhausted(true);
    }

    setLoading(false);
    inFlight.current = false;
  }, [cursor, exhausted, filter, savedOnly, followingOnly, authorKey, signedIn]);

  /**
   * A new reading from the top: a different chip, a refresh, a retry of a
   * first page that failed. A fresh clock, so whatever was published since
   * the last one is in it.
   */
  const restart = useCallback(async (next: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    inFlight.current = true;
    failedNow.current = false;
    setFilter(next);
    setSwitching(true);
    setFailed(false);
    setExhausted(false);
    setLoading(false);

    const seenIds = signedIn ? null : recallSeen();
    sessionSeen.current = seenIds;

    const page = await fetchFeedPage({
      filter: next,
      savedOnly,
      followingOnly,
      authorKey,
      seenIds,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;

    if (page.failed) {
      failedNow.current = true;
      setFailed(true);
      setPosts([]);
      setCursor(null);
    } else {
      clock.current = page.session ?? null;
      setPosts(page.posts);
      setCursor(page.cursor);
      setExhausted(page.cursor === null);
    }
    setSwitching(false);
    inFlight.current = false;

    // Back to the top of the new feed. `scrollIntoView` rather than
    // `window.scrollTo`: the workspace column scrolls, not the window.
    root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [signedIn, savedOnly, followingOnly, authorKey]);

  function retry() {
    if (posts.length === 0 && !cursor) {
      void restart(filter);
      return;
    }
    failedNow.current = false;
    setFailed(false);
    void loadMore();
  }

  /**
   * The first page, again, for a signed-out reader who has been here already.
   *
   * The server renders page one before the browser has said anything, so it
   * cannot exclude what this session has already read — a refresh would hand
   * back cards the reader has just scrolled past. This runs once on mount, and
   * only when there is something in the session memory to act on, so a first
   * visit pays nothing and does not flicker.
   */
  useEffect(() => {
    markBooted();
    if (!restored) entry.current = entryKey();
    if (signedIn || restored) return;

    const seenIds = recallSeen();
    sessionSeen.current = seenIds;
    if (seenIds.length === 0) return;

    const controller = new AbortController();
    request.current = controller;
    inFlight.current = true;

    void fetchFeedPage({
      filter,
      savedOnly,
      followingOnly,
      authorKey,
      seenIds,
      signal: controller.signal,
    }).then((page) => {
      if (controller.signal.aborted) return;
      inFlight.current = false;
      if (page.failed || page.posts.length === 0) return;
      clock.current = page.session ?? null;
      setPosts(page.posts);
      setCursor(page.cursor);
      setExhausted(page.cursor === null);
    });

    return () => controller.abort();
    // Mount only: re-running this on a filter change would fight restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back to where the reader was, before the restored page is painted.
  useLayoutEffect(() => {
    if (!restored?.anchor) return;
    const place = () => {
      const workspace = scroller();
      const card = root.current?.querySelector<HTMLElement>(`[data-post-id="${CSS.escape(restored.anchor!.id)}"]`);
      if (!workspace || !card) return;
      const top = workspace === document.scrollingElement ? 0 : workspace.getBoundingClientRect().top;
      workspace.scrollTop += card.getBoundingClientRect().top - top - restored.anchor!.offset;
    };
    place();
    // Once more after the images above it have had a frame to take their size.
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which card is at the top of the screen, kept up to date as the reader
  // scrolls, so the snapshot can be written without reading the page as it is
  // being taken down.
  useEffect(() => {
    const workspace = scroller();
    if (!workspace) return;
    const target: EventTarget = workspace === document.scrollingElement ? window : workspace;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      timer = null;
      const top = workspace === document.scrollingElement ? 0 : workspace.getBoundingClientRect().top;
      for (const slot of root.current?.querySelectorAll<HTMLElement>("[data-post-id]") ?? []) {
        const box = slot.getBoundingClientRect();
        if (box.bottom > top) {
          anchor.current = { id: slot.dataset.postId!, offset: box.top - top };
          return;
        }
      }
    };
    const onScroll = () => {
      if (timer === null) timer = setTimeout(measure, 120);
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  // The snapshot itself: written when the feed is left, by navigation or by
  // the tab going away. Everything it needs is in refs by then.
  const latest = useRef({ posts, cursor, exhausted, filter });
  useEffect(() => {
    latest.current = { posts, cursor, exhausted, filter };
  }, [posts, cursor, exhausted, filter]);
  useEffect(() => {
    const write = () =>
      saveSnapshot({
        scope,
        entry: entry.current,
        ...latest.current,
        seen: sessionSeen.current,
        session: clock.current,
        anchor: anchor.current,
        heights: [...heights.current].filter(([id]) => latest.current.posts.some((post) => post.id === id)),
      });
    window.addEventListener("pagehide", write);
    return () => {
      window.removeEventListener("pagehide", write);
      request.current?.abort();
      write();
    };
  }, [scope]);

  // Infinite scroll. `rootMargin` starts the request a screen and a half
  // early, which is roughly how far a fast thumb travels while a request is
  // in flight on a 3G connection. Measured against the workspace column,
  // which is what scrolls; against the viewport the margin means nothing.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const workspace = scroller();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root: workspace === document.scrollingElement ? null : workspace, rootMargin: "150% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  // Confirmed likes, saves and follows, so the feed's own copy — which is
  // what a return restores — says what the cards say.
  useEffect(() => {
    const listen = (event: Event) => {
      const change = (event as CustomEvent<FeedChange>).detail;
      setPosts((current) =>
        current.map((post) =>
          "postId" in change
            ? post.id === change.postId ? { ...post, ...change.patch } : post
            : post.authorKey === change.authorKey ? { ...post, ...change.patch } : post,
        ),
      );
    };
    window.addEventListener(FEED_CHANGE, listen);
    return () => window.removeEventListener(FEED_CHANGE, listen);
  }, []);

  function hide(postId: string) {
    setPosts((current) => current.filter((post) => post.id !== postId));
  }

  const restoredIndex = restored?.anchor ? Math.max(0, posts.findIndex((post) => post.id === restored.anchor!.id)) : 0;

  return (
    <div ref={root}>
      {showFilters && (
        <FilterChips value={filter} signedIn={signedIn} onChange={(next) => { if (next !== filter) void restart(next); }} />
      )}

      {beforePosts}

      {switching ? (
        <FeedSkeleton count={3} />
      ) : posts.length === 0 ? (
        failed ? null : (
          <Empty
            available={initial.available}
            savedOnly={savedOnly}
            followingOnly={followingOnly}
            showDiagnostics={showDiagnostics}
          />
        )
      ) : (
        <>
          <ImpressionTracker posts={posts} signedIn={signedIn} clock={clock} />
          <VirtualList
            posts={posts}
            signedIn={signedIn}
            viewer={viewer}
            onHidden={hide}
            heights={heights}
            startAt={restoredIndex}
          />
        </>
      )}

      <div ref={sentinel} aria-hidden className="h-px" />

      {loading && (
        <div aria-busy="true" aria-label="Loading more" className="mt-3">
          <FeedSkeleton count={2} />
        </div>
      )}

      {failed && !switching && (
        <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
          <p>{posts.length > 0 ? "More could not be loaded just now." : "The feed could not be loaded just now."}</p>
          <button
            type="button"
            onClick={retry}
            className="flex h-10 items-center gap-2 rounded-full bg-muted px-4 text-sm font-medium text-foreground hover:bg-muted/70"
          >
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </button>
        </div>
      )}

      {exhausted && !failed && posts.length > 0 && (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
          <p>That is everything for now.</p>
          <button
            type="button"
            onClick={() => void restart(filter)}
            className="flex h-10 items-center gap-2 rounded-full bg-muted px-4 text-sm font-medium text-foreground hover:bg-muted/70"
          >
            <RefreshCw className="size-4" aria-hidden />
            Refresh the feed
          </button>
        </div>
      )}
    </div>
  );
}

/** What scrolls: the workspace column inside the shell, the page outside it. */
function scroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("workspace") ?? (document.scrollingElement as HTMLElement | null);
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
  heights,
  startAt = 0,
}: {
  posts: FeedPost[];
  signedIn: boolean;
  viewer: { name: string; avatarUrl: string | null } | null;
  onHidden: (postId: string) => void;
  /** Owned by the feed, so they outlive this list and go into the snapshot. */
  heights: { current: Map<string, number> };
  /** The card a returning reader was at: mounted first, so it can be scrolled to. */
  startAt?: number;
}) {
  const [visible, setVisible] = useState(() => ({ first: Math.max(0, startAt - WINDOW), last: startAt + WINDOW * 2 }));
  const container = useRef<HTMLDivElement>(null);

  /**
   * Heights, kept current while a card is mounted.
   *
   * The ref callback alone measured the card at the moment it attached, which
   * is before its images have loaded. On a phone a feed card is mostly image,
   * so the recorded height came out hundreds of pixels short — and the spacer
   * left behind when the card unmounted was short by the same amount. The
   * document shortened, the browser clamped the scroll, and the reader was
   * thrown up the page. Enough cards collapsing at once sent it to the top.
   *
   * This writes to a ref and never sets state, so it cannot itself re-render
   * anything or feed the IntersectionObserver that drives the window.
   */
  const sizes = useRef<ResizeObserver | null>(null);

  // Built on first use rather than during render. A ref must not be touched
  // while rendering — the same rule the ref callback below was already written
  // to respect — and a ref callback is not render, so this is where it belongs.
  const sizeObserver = useCallback(() => {
    if (sizes.current) return sizes.current;
    if (typeof ResizeObserver === "undefined") return null;
    sizes.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.postId;
        const height = entry.contentRect.height;
        if (id && height > 0) heights.current.set(id, height);
      }
    });
    return sizes.current;
  }, [heights]);

  useEffect(() => () => sizes.current?.disconnect(), []);

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
            data-post-id={post.id}
            ref={(node) => {
              if (!node) return;
              if (mounted) {
                // Seed it immediately so an unmount in the same frame still
                // has a number, then let the observer correct it as the
                // images arrive.
                const height = node.getBoundingClientRect().height;
                if (height > 0) heights.current.set(post.id, height);
                sizeObserver()?.observe(node);
                node.style.minHeight = "";
              } else {
                sizes.current?.unobserve(node);
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
 * A card counts as seen once half of it has been on screen *and stayed there
 * for a second*. The dwell is the point: a thumb flicking through forty cards
 * crosses every one of them for a few milliseconds, and counting those as read
 * would bury the whole feed on the strength of a scroll nobody was reading.
 * A second is short enough that anyone who paused on a card has met it and
 * long enough that a flick has not.
 *
 * Ids are collected and flushed in batches — one request per screenful rather
 * than one per card — and the flush runs on an idle callback so the ranking
 * signal never competes with the scroll for the main thread.
 *
 * Signed out there is nobody to record against, so the ids go to
 * sessionStorage instead and ride along with the next request. Same rule, same
 * dwell; a shorter memory.
 */
function ImpressionTracker({
  posts,
  signedIn,
  clock,
}: {
  posts: FeedPost[];
  signedIn: boolean;
  /** The reading's start, sent with each batch. */
  clock: { current: string | null };
}) {
  const pending = useRef(new Set<string>());
  const sent = useRef(new Set<string>());

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    // One pending timer per card that is currently half on screen. Cleared the
    // moment it leaves, so a card scrolled past does not count itself a second
    // later from off screen.
    const dwelling = new Map<string, ReturnType<typeof setTimeout>>();

    const flush = () => {
      timer = null;
      const batch = [...pending.current];
      pending.current.clear();
      if (batch.length === 0) return;

      const send = () => {
        if (signedIn) void feedApi.view(batch, clock.current);
        else rememberSeen(batch);
      };
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(send, { timeout: 2000 });
      } else {
        send();
      }
    };

    const count = (id: string) => {
      dwelling.delete(id);
      if (sent.current.has(id)) return;
      sent.current.add(id);
      pending.current.add(id);
      if (timer === null) timer = setTimeout(flush, 1500);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.feedPost;
          if (!id || sent.current.has(id)) continue;

          if (entry.isIntersecting) {
            if (!dwelling.has(id)) {
              dwelling.set(id, setTimeout(() => count(id), DWELL_MS));
            }
          } else {
            const pendingDwell = dwelling.get(id);
            if (pendingDwell !== undefined) {
              clearTimeout(pendingDwell);
              dwelling.delete(id);
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    for (const card of document.querySelectorAll("[data-feed-post]")) {
      observer.observe(card);
    }

    return () => {
      observer.disconnect();
      for (const pendingDwell of dwelling.values()) clearTimeout(pendingDwell);
      if (timer !== null) clearTimeout(timer);
      flush();
    };
  }, [posts.length, signedIn, clock]);

  return null;
}

// ---------------------------------------------------------------------------
// Chips and empty states
// ---------------------------------------------------------------------------

function FilterChips({
  value,
  signedIn,
  onChange,
}: {
  value: string;
  signedIn: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter the feed"
      className="sticky top-0 z-20 mb-3 flex gap-2 overflow-x-auto bg-background/85 px-3 py-2 backdrop-blur [scrollbar-width:none] @lg/ws:rounded-2xl @lg/ws:px-2 [&::-webkit-scrollbar]:hidden"
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
              ? "bg-blue-600 text-white"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <span aria-hidden>{chip.emoji}</span>
          {chip.label}
        </button>
      ))}
      {/* The topics a reader asked for, and whether their activity may lean
          the feed, live in Settings beside the rest of their account. */}
      <Link
        href={signedIn ? "/settings#feed" : `/login?redirect=${encodeURIComponent("/settings#feed")}`}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Tune your feed
      </Link>
    </div>
  );
}

function Empty({
  available,
  savedOnly,
  followingOnly,
  showDiagnostics = false,
}: {
  available: boolean;
  savedOnly: boolean;
  followingOnly: boolean;
  showDiagnostics?: boolean;
}) {
  if (!available) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <RefreshCw className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          {showDiagnostics ? "The feed is not set up yet" : "Nothing here yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {showDiagnostics
            ? "The feed tables are missing on this database. Apply migration 0026 in the Supabase SQL editor — it is safe to re-run — then reload."
            : "Check back shortly."}
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
