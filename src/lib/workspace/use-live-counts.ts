"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Unread message and notification counts, kept current over Realtime.
 *
 * The sidebar badges have to be live — the shell never reloads, so a count
 * seeded once at first render would be stale for the rest of the session.
 *
 * Counts live in a module-level store rather than component state for the same
 * reason the layout does: `useSyncExternalStore` lets the subscription push a
 * new number without a setState inside an effect, and it means several badges
 * can read the same number without opening several subscriptions.
 *
 * Both counts are recounted from the source rather than incremented per event.
 * Tracking deltas drifts the moment one event is missed; a recount cannot.
 */

export type LiveCounts = { messages: number; notifications: number };

type State = LiveCounts & {
  /** False until the first recount lands, while the server's seed still rules. */
  ready: boolean;
};

const EMPTY: State = { messages: 0, notifications: 0, ready: false };

let state: State = EMPTY;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): State {
  return state;
}

function getServerSnapshot(): State {
  return EMPTY;
}

function set(next: LiveCounts) {
  if (
    state.ready &&
    next.messages === state.messages &&
    next.notifications === state.notifications
  ) {
    return;
  }
  state = { ...next, ready: true };
  for (const listener of listeners) listener();
}

export function useLiveCounts(seed: LiveCounts, enabled: boolean): LiveCounts {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function recount() {
      const [messages, notifications] = await Promise.all([
        supabase.rpc("unread_message_count"),
        supabase.rpc("unread_notification_count"),
      ]);
      if (cancelled) return;
      // A failed RPC returns null. Keeping the previous number is better than
      // showing zero, which would read as "all caught up".
      set({
        messages: typeof messages.data === "number" ? messages.data : state.messages,
        notifications:
          typeof notifications.data === "number"
            ? notifications.data
            : state.notifications,
      });
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(recount, 250);
    }

    // Once at mount, so the badges are right even when the server render was
    // cached before the latest message arrived.
    void recount();

    const channel = supabase
      .channel("workspace:counts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        schedule,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
        },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        schedule,
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, supabase]);

  if (!enabled) return { messages: 0, notifications: 0 };
  return live.ready
    ? { messages: live.messages, notifications: live.notifications }
    : seed;
}
