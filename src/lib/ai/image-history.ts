"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The studio's image history.
 *
 * Kept in the browser rather than the database, because what is stored is a
 * provider URL and a prompt — small, personal, and worth nothing to anyone
 * else. It survives reloads, which is the whole requirement, without a
 * migration or a storage bucket.
 *
 * Two things are deliberate. Data-URL images (Hugging Face, Stability and
 * Google all return bytes rather than links) are *not* persisted: a handful
 * would exhaust localStorage's five megabytes and lose the whole history
 * along with them. They stay for the session and are marked so the panel can
 * say so. And the list is capped, oldest first, so a long afternoon of
 * generating cannot fill the quota either.
 */

export type HistoryEntry = {
  id: string;
  url: string;
  prompt: string;
  /** Model label, for the caption. */
  model: string;
  provider: string;
  tool: string;
  aspect: string;
  createdAt: number;
  favorite: boolean;
  saved: boolean;
  deletedAt: number | null;
  /** True when the image lives in memory only and will not survive a reload. */
  ephemeral: boolean;
  /**
   * Where the bytes are kept, when they are kept.
   *
   * A Supabase Storage path under the member's own folder. It is the durable
   * half of an entry: `url` is a signed link that expires, and this is what it
   * is re-signed from. An entry with a path is worth persisting even though its
   * url will be stale by morning.
   */
  storagePath?: string;
};

const KEY = "medosha:ai:history:v1";
const MAX_ENTRIES = 200;

let entries: HistoryEntry[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): HistoryEntry[] {
  return entries;
}

/**
 * A stable empty array, not a fresh one.
 *
 * `useSyncExternalStore` compares snapshots by identity. Returning `[]` from
 * here builds a new array on every call, so React sees the value change on
 * every render and warns about an infinite loop — which it is.
 */
const EMPTY: HistoryEntry[] = [];

function getServerSnapshot(): HistoryEntry[] {
  return EMPTY;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    // Only what can be reloaded. An ephemeral entry written to storage would
    // come back as a broken image on the next visit.
    //
    // A stored entry keeps its path and drops its url: the signed link will
    // have expired by the time anybody reads this back, and writing a dead
    // link is how a history full of broken images happens. The url is minted
    // again from the path on hydration.
    const durable = entries
      .filter((entry) => !entry.ephemeral)
      .map((entry) =>
        entry.storagePath ? { ...entry, url: "" } : entry,
      );
    window.localStorage.setItem(KEY, JSON.stringify(durable.slice(0, MAX_ENTRIES)));
  } catch {
    // Quota or private browsing. The session still works, it just forgets.
  }
}

function sanitize(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is HistoryEntry =>
        Boolean(entry) &&
        typeof entry.id === "string" &&
        typeof entry.url === "string" &&
        // An entry is readable if it has somewhere to read from: a path to
        // re-sign, or a url that is not a dead in-memory reference.
        (typeof entry.storagePath === "string"
          ? entry.storagePath.length > 0
          : entry.url.length > 0 && !entry.url.startsWith("blob:")),
    )
    .slice(0, MAX_ENTRIES);
}

export function hydrateHistory() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    entries = sanitize(JSON.parse(raw));
    emit();
  } catch {
    // Malformed entry. An empty history is better than a crash.
  }
}

export function addImages(
  items: { url: string; path?: string }[],
  meta: Omit<
    HistoryEntry,
    "id" | "url" | "createdAt" | "favorite" | "saved" | "deletedAt" | "ephemeral"
  >,
) {
  const created = items.map<HistoryEntry>((item) => ({
    ...meta,
    id: crypto.randomUUID(),
    url: item.url,
    storagePath: item.path,
    createdAt: Date.now(),
    favorite: false,
    saved: false,
    deletedAt: null,
    // An image that was stored is durable whatever its url looks like: the
    // path outlives the link, and the link can be minted again from it.
    //
    // Without this the base64 xAI returns is discarded on every reload — which
    // is what happened between switching to base64 and adding the bucket, and
    // it is why a generated image survived exactly until somebody refreshed.
    ephemeral:
      item.path === undefined &&
      (item.url.startsWith("data:") || item.url.startsWith("blob:")),
  }));

  entries = [...created, ...entries].slice(0, MAX_ENTRIES);
  persist();
  emit();
  return created;
}

function update(id: string, patch: Partial<HistoryEntry>) {
  entries = entries.map((entry) =>
    entry.id === id ? { ...entry, ...patch } : entry,
  );
  persist();
  emit();
}

export function toggleFavorite(id: string) {
  const entry = entries.find((item) => item.id === id);
  if (entry) update(id, { favorite: !entry.favorite });
}

export function toggleSaved(id: string) {
  const entry = entries.find((item) => item.id === id);
  if (entry) update(id, { saved: !entry.saved });
}

/** Soft delete, so Deleted can restore it. */
export function remove(id: string) {
  update(id, { deletedAt: Date.now() });
}

export function restore(id: string) {
  update(id, { deletedAt: null });
}

export function purge(id: string) {
  entries = entries.filter((entry) => entry.id !== id);
  persist();
  emit();
}

export function duplicate(id: string) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;
  entries = [
    { ...entry, id: crypto.randomUUID(), createdAt: Date.now(), favorite: false },
    ...entries,
  ].slice(0, MAX_ENTRIES);
  persist();
  emit();
}

export function useHistory(): HistoryEntry[] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    hydrateHistory();
    // Entries read back from storage carry a path and no url. Signing them is
    // a round trip, so it happens after hydration rather than blocking it —
    // the list appears immediately and fills in.
    void refreshStoredUrls();
  }, []);
  return value;
}

// ---------------------------------------------------------------------------
// Grouping for the panel
// ---------------------------------------------------------------------------

export type HistoryBucket =
  | "today"
  | "yesterday"
  | "week"
  | "older"
  | "favorites"
  | "saved"
  | "deleted";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Which bucket an entry belongs to, relative to a caller-supplied "now".
 *
 * The time is passed in rather than read here so grouping stays a pure
 * function — reading the clock during render is what the purity lint rule
 * exists to catch, and it would also make the buckets change mid-render.
 */
export function bucketOf(entry: HistoryEntry, now: number): HistoryBucket {
  if (entry.deletedAt) return "deleted";

  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (entry.createdAt >= startOfToday) return "today";
  if (entry.createdAt >= startOfToday - DAY) return "yesterday";
  if (entry.createdAt >= startOfToday - 7 * DAY) return "week";
  return "older";
}

export const BUCKET_LABEL: Record<HistoryBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  older: "Earlier",
  favorites: "Favorites",
  saved: "Saved designs",
  deleted: "Deleted",
};

/**
 * Fresh links for everything that was read back from storage.
 *
 * Called once after hydration. Entries persisted with a path came back with an
 * empty url — deliberately, since the signed link they were saved with expired
 * long ago — and this is what makes them viewable again.
 *
 * Failures are quiet on purpose. An image that cannot be signed is one that has
 * been deleted or belongs to somebody else, and neither is worth interrupting
 * somebody's session over; the entry simply stays without a picture.
 */
export async function refreshStoredUrls(): Promise<void> {
  if (typeof window === "undefined") return;

  const stale = entries.filter(
    (entry) => entry.storagePath && entry.url.length === 0,
  );
  if (stale.length === 0) return;

  try {
    const response = await fetch("/api/ai/image/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paths: stale.map((entry) => entry.storagePath),
      }),
    });
    if (!response.ok) return;

    const { urls } = (await response.json()) as {
      urls?: Record<string, string>;
    };
    if (!urls) return;

    entries = entries.map((entry) => {
      const fresh = entry.storagePath ? urls[entry.storagePath] : undefined;
      return fresh ? { ...entry, url: fresh } : entry;
    });

    // Not persisted: what was written is already right, and writing the fresh
    // signed urls back would put links in storage that expire again.
    emit();
  } catch {
    // Offline, or the route is unreachable. The history is still there.
  }
}
