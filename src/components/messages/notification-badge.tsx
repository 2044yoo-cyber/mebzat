"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Unread indicator in the navbar. Seeded from the server on render, then kept
 * current over Realtime: a new message anywhere bumps the count, and reading a
 * thread clears it via the participant watermark update.
 */
export function NotificationBadge({
  viewerId,
  initialCount,
}: {
  viewerId: string;
  initialCount: number;
}) {
  // Null until Realtime reports a fresher number, so a new server render
  // (which re-seeds initialCount) is always respected.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const count = liveCount ?? initialCount;
  const supabase = useMemo(() => createClient(), []);
  const refresh = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Recount from the source rather than tracking deltas, so the badge can
    // never drift from what the inbox shows.
    async function recount() {
      const { data } = await supabase.rpc("unread_message_count");
      if (typeof data === "number") setLiveCount(data);
    }

    function scheduleRecount() {
      if (refresh.current) clearTimeout(refresh.current);
      refresh.current = setTimeout(recount, 250);
    }

    const channel = supabase
      .channel(`notifications:${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { sender_id: string; body: string };
          if (row.sender_id === viewerId) return;
          scheduleRecount();
          if (typeof document !== "undefined" && document.hidden === false) {
            toast.message("New message", {
              description: row.body ? row.body.slice(0, 80) : "Attachment",
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${viewerId}`,
        },
        scheduleRecount,
      )
      .subscribe();

    return () => {
      if (refresh.current) clearTimeout(refresh.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, viewerId]);

  return (
    <Link
      href="/messages"
      aria-label={
        count > 0 ? `Messages, ${count} unread` : "Messages"
      }
      className={cn(
        "relative flex size-8 items-center justify-center rounded-lg text-muted-foreground",
        "transition-colors hover:bg-muted hover:text-foreground",
      )}
    >
      <MessageSquare className="size-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
