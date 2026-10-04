"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Favourites and recent results, kept on the device.
 *
 * These are per-person conveniences, not records: which calculators somebody
 * stars, and the last few answers they worked out. Keeping them in
 * `localStorage` means they work signed out — the brief was explicit that basic
 * calculators must not require registration — and that a phone with no
 * connection still remembers them.
 *
 * Saved, named calculations are a different thing and live in the database,
 * because those are documents somebody expects to find from another device.
 *
 * ## Why this is a store rather than an effect
 *
 * `localStorage` is external state, and reading it in an effect and pushing the
 * result into `useState` is both the thing React 19 refuses to compile and a
 * genuine bug: two components reading the same list would each hold their own
 * copy, and starring a calculator on the hub would not update the star on the
 * calculator's own page.
 *
 * `useSyncExternalStore` is the tool for exactly this. One parsed value per key,
 * cached so the snapshot is referentially stable — returning a fresh array each
 * time is an infinite render loop — and every subscriber told at once when it
 * changes.
 *
 * Every read and write is wrapped: `localStorage` throws outright in a private
 * window on some browsers, and a favourites list is not worth crashing a page
 * over.
 */

const FAVOURITES_KEY = "medosha.calculators.favourites";
const RECENTS_KEY = "medosha.calculators.recents";
const RECENTS_LIMIT = 8;

export type RecentEntry = {
  slug: string;
  title: string;
  headline: string;
  at: number;
};

/** The server has no storage, and both hooks must agree on that. */
const EMPTY: never[] = [];

const cache = new Map<string, unknown[]>();
const listeners = new Map<string, Set<() => void>>();

function snapshot<T>(key: string): T[] {
  const held = cache.get(key);
  if (held) return held as T[];

  let value: T[] = EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) value = parsed as T[];
    }
  } catch {
    value = EMPTY;
  }

  cache.set(key, value);
  return value;
}

function publish<T>(key: string, next: T[]) {
  cache.set(key, next);
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage full, or blocked. The in-memory value still stands for this
    // session; nothing here is worth an error in front of the reader.
  }
  for (const listener of listeners.get(key) ?? []) listener();
}

function subscribeTo(key: string) {
  return (listener: () => void) => {
    const set = listeners.get(key) ?? new Set();
    set.add(listener);
    listeners.set(key, set);
    return () => {
      set.delete(listener);
    };
  };
}

/** The server snapshot: nothing, which is honestly what the server knows. */
function serverSnapshot(): never[] {
  return EMPTY;
}

function useStored<T>(key: string): T[] {
  return useSyncExternalStore(subscribeTo(key), () => snapshot<T>(key), serverSnapshot);
}

export function useFavourites() {
  const favourites = useStored<string>(FAVOURITES_KEY);

  const toggle = useCallback((slug: string) => {
    const current = snapshot<string>(FAVOURITES_KEY);
    publish(
      FAVOURITES_KEY,
      current.includes(slug) ? current.filter((one) => one !== slug) : [...current, slug],
    );
  }, []);

  return { favourites, toggle };
}

export function useRecents() {
  const recents = useStored<RecentEntry>(RECENTS_KEY);

  const remember = useCallback((entry: Omit<RecentEntry, "at">) => {
    const current = snapshot<RecentEntry>(RECENTS_KEY);
    // One entry per calculator: the newest result replaces the older one rather
    // than filling the list with eight concrete slabs.
    publish(
      RECENTS_KEY,
      [{ ...entry, at: Date.now() }, ...current.filter((one) => one.slug !== entry.slug)].slice(
        0,
        RECENTS_LIMIT,
      ),
    );
  }, []);

  const clear = useCallback(() => publish(RECENTS_KEY, EMPTY), []);

  return { recents, remember, clear };
}

/** "Today", "Yesterday", "3 days ago" — the phrasing the brief asked for. */
export function whenLabel(at: number, now = Date.now()): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
}
