"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, MessageSquarePlus, Search } from "lucide-react";

import { NewConversationDialog } from "@/components/messages/new-conversation-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/types/database.types";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function conversationTitle(conversation: ConversationSummary) {
  if (conversation.kind === "company") {
    return conversation.company_name ?? "Company";
  }
  return (
    conversation.other_full_name ??
    conversation.other_username ??
    "Medosha member"
  );
}

export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: ConversationSummary[];
  activeId?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const haystack = [
        conversationTitle(conversation),
        conversation.subject ?? "",
        conversation.last_message_preview ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
          <NewConversationDialog
            trigger={
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg text-muted-foreground",
                  "transition-colors hover:bg-muted hover:text-foreground",
                )}
              >
                <MessageSquarePlus className="size-4" />
              </span>
            }
          />
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="pl-8"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {conversations.length === 0
              ? "No conversations yet. Message a professional or company to start one."
              : "No conversations match that search."}
          </p>
        ) : (
          <ul>
            {filtered.map((conversation) => {
              const title = conversationTitle(conversation);
              const avatar =
                conversation.kind === "company"
                  ? conversation.company_logo_url
                  : conversation.other_avatar_url;
              const unread = Number(conversation.unread_count) || 0;

              return (
                <li key={conversation.id}>
                  <Link
                    href={`/messages/${conversation.id}`}
                    className={cn(
                      "flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/50",
                      activeId === conversation.id && "bg-muted",
                    )}
                  >
                    <Avatar className="size-11 shrink-0">
                      {avatar && <AvatarImage src={avatar} alt={title} />}
                      <AvatarFallback>
                        {conversation.kind === "company" ? (
                          <Building2 className="size-4" />
                        ) : (
                          initials(title)
                        )}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-sm",
                            unread > 0 ? "font-semibold" : "font-medium",
                          )}
                        >
                          {title}
                        </p>
                        <time
                          dateTime={conversation.last_message_at}
                          className="shrink-0 text-xs text-muted-foreground"
                        >
                          {timeLabel(conversation.last_message_at)}
                        </time>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-xs",
                            unread > 0
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {conversation.last_message_preview ??
                            "No messages yet"}
                        </p>
                        {unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
