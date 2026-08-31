"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Copy,
  Eraser,
  RefreshCw,
  Sparkles,
  Square,
} from "lucide-react";

import { Markdown } from "@/components/ai/markdown";
import { SUGGESTED_PROMPTS } from "@/lib/ai/quick-actions";
import { boundsOf, publishHighlight } from "@/lib/map/ai-highlight";
import { openPropertyId } from "@/lib/ai/open-property";
import { cn } from "@/lib/utils";
import type { AiAgentName } from "@/types/database.types";

type Source = { kind: string; id: string; title: string; href: string };

/** One listing the answer is grounded in, as sent by the route. */
type Listing = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
};

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentLabel?: string;
  sources?: Source[];
};

/** Frames emitted by /api/ai/chat. */
type MetaFrame = {
  agent: AiAgentName;
  agentLabel: string;
  sources: Source[];
  listings?: Listing[];
};
type DeltaFrame = { text: string };
type ErrorFrame = { message: string };

export function AiChat({
  initialPrompt,
  agent,
  compact,
}: {
  initialPrompt?: string;
  agent?: AiAgentName;
  compact?: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState(initialPrompt ?? "");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The last question, so Regenerate can re-ask without the failed answer.
  const lastQuestion = useRef<string | null>(null);

  const suggestions = useMemo(() => SUGGESTED_PROMPTS.slice(0, 6), []);

  // The listing whose page the panel is currently beside, if any. Read from
  // the route rather than passed in — see `open-property.ts`.
  const pathname = usePathname();
  const propertyId = openPropertyId(pathname);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns]);

  const ask = useCallback(
    async (question: string, history: Turn[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setError(null);
      lastQuestion.current = question;

      const answerId = `a-${crypto.randomUUID()}`;
      setTurns([
        ...history,
        { id: `q-${crypto.randomUUID()}`, role: "user", content: question },
        { id: answerId, role: "assistant", content: "" },
      ]);

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            question,
            agent,
            propertyId,
            history: history.map((t) => ({ role: t.role, content: t.content })),
          }),
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Medosha AI is unavailable.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // Frames are separated by a blank line; keep any partial tail.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const raw of frames) {
            const eventLine = raw.split("\n").find((l) => l.startsWith("event:"));
            const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
            if (!eventLine || !dataLine) continue;

            const event = eventLine.slice(6).trim();
            const data: unknown = JSON.parse(dataLine.slice(5).trim());

            if (event === "meta") {
              const meta = data as MetaFrame;
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === answerId
                    ? { ...t, agentLabel: meta.agentLabel, sources: meta.sources }
                    : t,
                ),
              );

              // Hand the map the rows the search returned, before the answer
              // has finished writing. Only when there are some: a cement
              // question carries no listings, and clearing the highlight on
              // every unrelated turn would wipe a search the user is still
              // reading.
              const listings = meta.listings ?? [];
              if (listings.length > 0) {
                publishHighlight({
                  ids: listings.map((listing) => listing.id),
                  bounds: boundsOf(listings),
                  label: `${listings.length} ${listings.length === 1 ? "match" : "matches"} from Medosha AI`,
                });
              }
            } else if (event === "delta") {
              const delta = data as DeltaFrame;
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === answerId ? { ...t, content: t.content + delta.text } : t,
                ),
              );
            } else if (event === "error") {
              setError((data as ErrorFrame).message);
            }
          }
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error ? caught.message : "Something went wrong.",
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [agent, propertyId],
  );

  function submit() {
    const question = draft.trim();
    if (!question || streaming) return;
    setDraft("");
    void ask(question, turns);
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  function regenerate() {
    const question = lastQuestion.current;
    if (!question || streaming) return;
    // Drop the previous exchange so the model answers fresh rather than
    // continuing from its own failed attempt.
    void ask(question, turns.slice(0, -2));
  }

  async function copy(turn: Turn) {
    await navigator.clipboard.writeText(turn.content);
    setCopiedId(turn.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const empty = turns.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-full" : "h-full")}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto max-w-2xl px-4 py-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border bg-muted/40 text-brand">
              <Sparkles className="size-5" />
            </div>
            <p className="mt-4 font-medium">Ask Medosha AI anything</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Costs, materials, suppliers, schedules and design — grounded in the
              Medosha catalogue.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void ask(prompt, [])}
                  className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {turns.map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {turn.content}
                  </div>
                </div>
              ) : (
                <div key={turn.id} className="space-y-2">
                  {turn.agentLabel && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-brand">
                      <Sparkles className="size-3" />
                      {turn.agentLabel}
                    </p>
                  )}

                  {turn.content ? (
                    <Markdown content={turn.content} />
                  ) : (
                    <div className="flex gap-1 py-2">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  )}

                  {turn.sources && turn.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {turn.sources.slice(0, 6).map((source) => (
                        <Link
                          key={`${source.kind}-${source.id}`}
                          href={source.href}
                          className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                        >
                          {source.title}
                        </Link>
                      ))}
                    </div>
                  )}

                  {turn.content && !streaming && (
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => void copy(turn)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {copiedId === turn.id ? (
                          <Check className="size-3" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        {copiedId === turn.id ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={regenerate}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <RefreshCw className="size-3" />
                        Regenerate
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="mx-auto w-full max-w-3xl px-4">
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mx-auto w-full max-w-3xl px-4 py-4"
      >
        <div className="flex items-end gap-2 rounded-2xl border bg-card px-3 py-2 shadow-sm">
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            placeholder="Ask about costs, materials, suppliers, schedules…"
            onChange={(event) => {
              setDraft(event.target.value);
              const el = event.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="max-h-44 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />

          {turns.length > 0 && !streaming && (
            <button
              type="button"
              onClick={() => {
                setTurns([]);
                setError(null);
                lastQuestion.current = null;
              }}
              aria-label="Clear conversation"
              className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Eraser className="size-4" />
            </button>
          )}

          {streaming ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generating"
              className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground transition-colors hover:bg-muted/70"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              aria-label="Send"
              className={cn(
                "flex size-9 items-center justify-center rounded-xl transition-all",
                "bg-primary text-primary-foreground hover:bg-primary/85",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
        <p className="pt-2 text-center text-[11px] text-muted-foreground">
          Medosha AI gives planning guidance, not certified engineering sign-off.
        </p>
      </form>
    </div>
  );
}
