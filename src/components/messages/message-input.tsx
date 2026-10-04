"use client";

import { useRef, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  AttachmentChips,
  AttachmentUploader,
} from "@/components/messages/attachment-uploader";
import { AiRefine } from "@/components/ai/writing/ai-refine";
import { EmojiPicker } from "@/components/messages/emoji-picker";
import {
  ATTACHMENT_BUCKET,
  MAX_MESSAGE_LENGTH,
} from "@/lib/constants/messaging";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { PendingAttachment } from "@/app/(dashboard)/messages/actions";

export function MessageInput({
  conversationId,
  onSend,
  onTyping,
  disabled,
}: {
  conversationId: string;
  onSend: (body: string, attachments: PendingAttachment[]) => Promise<void>;
  onTyping?: () => void;
  disabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend =
    !sending && !disabled && (body.trim().length > 0 || attachments.length > 0);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function submit() {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(body.trim(), attachments);
      setBody("");
      setAttachments([]);
      requestAnimationFrame(resize);
    } catch {
      toast.error("Could not send that message.");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      setBody((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
      resize();
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="border-t bg-background/80 p-3 backdrop-blur"
    >
      <AttachmentChips
        attachments={attachments}
        onRemove={(storagePath) => {
          setAttachments((prev) =>
            prev.filter((a) => a.storagePath !== storagePath),
          );
          void createClient()
            .storage.from(ATTACHMENT_BUCKET)
            .remove([storagePath]);
        }}
      />

      <div className="rounded-2xl border bg-card px-2 py-1.5">
        <div className="flex items-end gap-1">
          <AttachmentUploader
            conversationId={conversationId}
            attachments={attachments}
            onChange={setAttachments}
            disabled={disabled || sending}
          />
          <EmojiPicker onSelect={insertEmoji} disabled={disabled || sending} />

          {/* The composer owns its own height and Enter handling, so the
              assistant attaches to the field rather than replacing it. */}
          <AiRefine
            surface="message"
            value={body}
            disabled={disabled || sending}
            onAccept={(next) => {
              setBody(next);
              requestAnimationFrame(() => {
                textareaRef.current?.focus();
                resize();
              });
            }}
          />

          <textarea
            ref={textareaRef}
            value={body}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={disabled}
            placeholder="Write a message…"
            onChange={(event) => {
              setBody(event.target.value);
              resize();
              onTyping?.();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            className={cn(
              "max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm",
              "outline-none placeholder:text-muted-foreground disabled:opacity-50",
            )}
          />

          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              "bg-primary text-primary-foreground transition-opacity",
              "hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizontal className="size-4" />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
