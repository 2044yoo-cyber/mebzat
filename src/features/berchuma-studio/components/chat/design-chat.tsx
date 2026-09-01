"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


/**
 * The conversation.
 *
 * Berchuma reads like a chat and behaves like a CAD command line: what comes
 * back is not a paragraph about the wardrobe, it is the wardrobe. The message
 * is the receipt.
 *
 * There is no streaming here, and that is deliberate rather than unfinished.
 * The product of a turn is a JSON design that only means anything once it is
 * complete, so streaming would show a spinner made of half-written words.
 * Waiting honestly beats pretending to be fast.
 */

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Set when this turn changed the design. */
  changedDesign?: boolean;
};

export function DesignChat({
  messages,
  busy,
  error,
  hasDesign,
  onSend,
}: {
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  hasDesign: boolean;
  onSend: (brief: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The thread scrolls itself, not the page: the studio's columns each own
  // their own scroll, and scrolling the window here would move the drawing.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, busy]);

  const submit = () => {
    const brief = draft.trim();
    if (!brief || busy) return;
    setDraft("");
    onSend(brief);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm",
              message.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted",
            )}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.changedDesign ? (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] opacity-70">
                <Sparkles className="size-3" aria-hidden />
                Drawing and price updated
              </p>
            ) : null}
          </div>
        ))}

        {busy ? (
          <div className="flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Working out the parts…
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm"
          >
            {error}
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {/* The workspace's floating buttons sit fixed in the bottom-right corner
          above the phone's navigation — exactly where a send button wants to
          be. While the studio is one column the chat reaches that corner, so
          the extra end padding moves this button clear of them rather than
          underneath. Once the columns split, the chat is on the left and the
          padding comes off. */}
      <div className="border-t p-3 pe-16 @4xl/ws:pe-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            disabled={busy}
            placeholder={
              hasDesign
                ? "Make it wider, add drawers, change to walnut…"
                : "Describe what you want built…"
            }
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line. On a phone the
              // on-screen keyboard sends its own newline, which is why the
              // button below is not optional.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="icon"
            className="size-10 shrink-0 rounded-xl"
            disabled={busy || draft.trim().length === 0}
            onClick={submit}
            aria-label="Send"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ArrowUp className="size-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
