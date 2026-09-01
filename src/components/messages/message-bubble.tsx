"use client";

import Image from "next/image";
import { Check, CheckCheck, Clock, Download, FileText } from "lucide-react";

import {
  attachmentKindLabel,
  formatFileSize,
  isImageAttachment,
} from "@/lib/constants/messaging";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/data/messages";

export type ReceiptState = "pending" | "sent" | "delivered" | "read";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Receipt({ state }: { state: ReceiptState }) {
  if (state === "pending") {
    return <Clock className="size-3.5 opacity-70" aria-label="Sending" />;
  }
  if (state === "read") {
    return <CheckCheck className="size-3.5 text-brand" aria-label="Read" />;
  }
  if (state === "delivered") {
    return <CheckCheck className="size-3.5 opacity-70" aria-label="Delivered" />;
  }
  return <Check className="size-3.5 opacity-70" aria-label="Sent" />;
}

function Attachment({
  attachment,
  mine,
}: {
  attachment: ChatMessage["attachments"][number];
  mine: boolean;
}) {
  const { fileName, mimeType, sizeBytes, url } = attachment;

  if (isImageAttachment(mimeType) && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="relative block aspect-4/3 w-56 max-w-full overflow-hidden rounded-lg border bg-muted"
      >
        <Image
          src={url}
          alt={fileName}
          fill
          sizes="224px"
          className="object-cover"
          unoptimized
        />
      </a>
    );
  }

  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noreferrer"
      aria-disabled={!url}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
        mine
          ? "border-primary-foreground/25 hover:bg-primary-foreground/10"
          : "hover:bg-background/70",
        !url && "pointer-events-none opacity-60",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          mine ? "bg-primary-foreground/15" : "bg-muted",
        )}
      >
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{fileName}</span>
        <span className="block text-xs opacity-70">
          {attachmentKindLabel(mimeType, fileName)} · {formatFileSize(sizeBytes)}
        </span>
      </span>
      <Download className="size-4 shrink-0 opacity-70" />
    </a>
  );
}

export function MessageBubble({
  message,
  mine,
  receipt,
  showAuthor,
  authorName,
}: {
  message: ChatMessage;
  mine: boolean;
  receipt?: ReceiptState;
  showAuthor?: boolean;
  authorName?: string;
}) {
  const deleted = message.deletedAt !== null;

  return (
    <div className={cn("flex w-full", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] space-y-1.5 rounded-2xl px-3.5 py-2.5 sm:max-w-[70%]",
          mine
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border bg-card",
        )}
      >
        {showAuthor && !mine && authorName && (
          <p className="text-xs font-semibold text-brand">{authorName}</p>
        )}

        {deleted ? (
          <p className="text-sm italic opacity-70">This message was deleted</p>
        ) : (
          <>
            {message.attachments.length > 0 && (
              <div className="space-y-1.5">
                {message.attachments.map((attachment) => (
                  <Attachment
                    key={attachment.id}
                    attachment={attachment}
                    mine={mine}
                  />
                ))}
              </div>
            )}
            {message.body && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.body}
              </p>
            )}
          </>
        )}

        <div
          className={cn(
            "flex items-center justify-end gap-1 text-[11px]",
            mine ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {message.editedAt && !deleted && <span>edited</span>}
          <time dateTime={message.createdAt}>
            {formatTime(message.createdAt)}
          </time>
          {mine && receipt && <Receipt state={receipt} />}
        </div>
      </div>
    </div>
  );
}
