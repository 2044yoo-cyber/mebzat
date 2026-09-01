"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2 } from "lucide-react";
import { toast } from "sonner";

import {
  MessageBubble,
  type ReceiptState,
} from "@/components/messages/message-bubble";
import { MessageInput } from "@/components/messages/message-input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  markConversationRead,
  markDelivered,
  sendMessage,
  type PendingAttachment,
} from "@/app/(dashboard)/messages/actions";
import type { ChatMessage, ConversationHeader } from "@/lib/data/messages";

/** Typing indicator lifetime — refreshed while the peer keeps typing. */
const TYPING_TIMEOUT_MS = 3000;
/** Minimum gap between outgoing typing broadcasts. */
const TYPING_THROTTLE_MS = 1500;

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function ChatWindow({
  header,
  viewerId,
  viewerName,
  initialMessages,
}: {
  header: ConversationHeader;
  viewerId: string;
  viewerName: string;
  initialMessages: ChatMessage[];
}) {
  // initialMessages is the server-rendered history; realtime arrivals and
  // optimistic drafts are appended on top and de-duplicated at render, so a
  // fresh server render never has to be copied back into state.
  const [extraMessages, setExtraMessages] = useState<ChatMessage[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [typingPeers, setTypingPeers] = useState<string[]>([]);
  const [onlinePeers, setOnlinePeers] = useState<string[]>([]);
  const [readAt, setReadAt] = useState<string | null>(header.othersLastReadAt);
  const [deliveredAt, setDeliveredAt] = useState<string | null>(
    header.othersLastDeliveredAt,
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTypingSentAt = useRef(0);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const broadcastTyping = useRef<(() => void) | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ block: "end" }),
    );
  }, []);

  const messages = useMemo(() => {
    const seen = new Set(initialMessages.map((m) => m.id));
    const merged = [...initialMessages];
    for (const message of extraMessages) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      merged.push(message);
    }
    return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [initialMessages, extraMessages]);

  useEffect(scrollToBottom, [messages.length, scrollToBottom]);

  // Mark the thread read on open and whenever a new message lands while the
  // tab is focused, so the badge matches what the user can actually see.
  useEffect(() => {
    void markConversationRead(header.id);
    void markDelivered();
  }, [header.id, messages.length]);

  useEffect(() => {
    const channel = supabase.channel(`conversation:${header.id}`, {
      config: { presence: { key: viewerId } },
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${header.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            body: string;
            created_at: string;
            edited_at: string | null;
            deleted_at: string | null;
          };
          // Our own message is already on screen from the optimistic insert.
          if (row.sender_id === viewerId) return;

          setExtraMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [
                  ...prev,
                  {
                    id: row.id,
                    conversationId: row.conversation_id,
                    senderId: row.sender_id,
                    body: row.body,
                    createdAt: row.created_at,
                    editedAt: row.edited_at,
                    deletedAt: row.deleted_at,
                    attachments: [],
                  },
                ],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `conversation_id=eq.${header.id}`,
        },
        (payload) => {
          const row = payload.new as {
            user_id: string;
            last_read_at: string;
            last_delivered_at: string;
          };
          if (row.user_id === viewerId) return;
          setReadAt((prev) =>
            !prev || row.last_read_at > prev ? row.last_read_at : prev,
          );
          setDeliveredAt((prev) =>
            !prev || row.last_delivered_at > prev
              ? row.last_delivered_at
              : prev,
          );
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { userId, name } = payload as { userId: string; name: string };
        if (userId === viewerId) return;

        setTypingPeers((prev) => (prev.includes(name) ? prev : [...prev, name]));

        clearTimeout(typingTimers.current.get(userId));
        typingTimers.current.set(
          userId,
          setTimeout(() => {
            setTypingPeers((prev) => prev.filter((n) => n !== name));
            typingTimers.current.delete(userId);
          }, TYPING_TIMEOUT_MS),
        );
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlinePeers(Object.keys(state).filter((id) => id !== viewerId));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ online_at: new Date().toISOString() });
        }
      });

    broadcastTyping.current = () => {
      const now = Date.now();
      if (now - lastTypingSentAt.current < TYPING_THROTTLE_MS) return;
      lastTypingSentAt.current = now;
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: viewerId, name: viewerName },
      });
    };

    const timers = typingTimers.current;
    return () => {
      broadcastTyping.current = null;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      void supabase.removeChannel(channel);
    };
  }, [header.id, supabase, viewerId, viewerName]);

  async function handleSend(body: string, attachments: PendingAttachment[]) {
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversationId: header.id,
      senderId: viewerId,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      attachments: attachments.map((file) => ({
        id: `${optimisticId}-${file.storagePath}`,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        url: null,
      })),
    };

    setExtraMessages((prev) => [...prev, optimistic]);
    setPendingIds((prev) => new Set(prev).add(optimisticId));

    const result = await sendMessage(header.id, body, attachments);

    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(optimisticId);
      return next;
    });

    if (result.error) {
      setExtraMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      toast.error(result.error);
    }
  }

  function receiptFor(message: ChatMessage): ReceiptState {
    if (pendingIds.has(message.id)) return "pending";
    if (readAt && readAt >= message.createdAt) return "read";
    if (deliveredAt && deliveredAt >= message.createdAt) return "delivered";
    return "sent";
  }

  const peerOnline = header.counterpartIds.some((id) =>
    onlinePeers.includes(id),
  );

  const withDayBreaks = messages.map((message, index) => {
    const day = dayLabel(message.createdAt);
    const previous =
            index > 0 ? dayLabel(messages[index - 1]?.createdAt ?? "") : null;
    return { message, day, showDay: day !== previous };
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Link
          href="/messages"
          aria-label="Back to conversations"
          className="-ml-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
        >
          <ArrowLeft className="size-4" />
        </Link>

        <div className="relative">
          <Avatar className="size-10">
            {header.avatarUrl && (
              <AvatarImage src={header.avatarUrl} alt={header.title} />
            )}
            <AvatarFallback>
              {header.kind === "company" ? (
                <Building2 className="size-4" />
              ) : (
                initials(header.title)
              )}
            </AvatarFallback>
          </Avatar>
          {peerOnline && (
            <span
              className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-background bg-emerald-500"
              aria-label="Online"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {header.href ? (
            <Link
              href={header.href}
              className="block truncate font-semibold hover:underline"
            >
              {header.title}
            </Link>
          ) : (
            <p className="truncate font-semibold">{header.title}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {typingPeers.length > 0
              ? `${typingPeers.join(", ")} is typing…`
              : peerOnline
                ? "Online"
                : (header.subject ?? "Offline")}
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — say hello.
          </p>
        )}

        {withDayBreaks.map(({ message, day, showDay }) => (
          <div key={message.id} className="space-y-2">
            {showDay && (
              <div className="flex justify-center py-2">
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {day}
                </span>
              </div>
            )}
            <MessageBubble
              message={message}
              mine={message.senderId === viewerId}
              receipt={receiptFor(message)}
              showAuthor={header.counterpartIds.length > 1}
              authorName={header.title}
            />
          </div>
        ))}

        {typingPeers.length > 0 && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border bg-card px-3.5 py-3">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className={cn(
                    "size-1.5 animate-bounce rounded-full bg-muted-foreground/60",
                  )}
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <MessageInput
        conversationId={header.id}
        onSend={handleSend}
        onTyping={() => broadcastTyping.current?.()}
      />
    </div>
  );
}
