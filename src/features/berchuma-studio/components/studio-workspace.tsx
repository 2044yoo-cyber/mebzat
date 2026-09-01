"use client";

import { useCallback, useMemo, useState } from "react";
import { MessageSquare, Ruler, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

import { DesignChat, type ChatMessage } from "./chat/design-chat";
import { CostPanel } from "./pricing/cost-panel";
import { DesignEditor } from "./editor/design-editor";
import { PublishBar } from "./publish-bar";
import { StartPanel } from "./start-panel";
import { useDesign } from "../hooks/use-design";
import type { MarketRate } from "../types/cost";
import type {
  DesignErrorResponse,
  DesignRequestBody,
  DesignResponse,
} from "../types/api";

/**
 * Berchuma Studio.
 *
 * Three views of one object. The chat writes the spec, the rail edits it, the
 * panel prices it — and because all three are reading the same `useDesign`
 * state, there is no version of this screen where the drawing shows four bays
 * and the quote charges for three.
 *
 * On a phone they are tabs, because 90% of Medosha's traffic is a phone and
 * three columns on a 390 px screen is three unusable columns. On a wide
 * workspace they sit side by side. The switch is a container query on the
 * workspace column, not the viewport, so collapsing the sidebar widens this
 * page the same way it widens every other one.
 */

type Tab = "chat" | "design" | "cost";

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Berchuma", icon: MessageSquare },
  { id: "design", label: "Design", icon: Ruler },
  { id: "cost", label: "Price", icon: Wallet },
];

export function StudioWorkspace({ rates }: { rates: MarketRate[] }) {
  // `rates` arrives from a server component and never changes for the life of
  // the page, but it is an array literal in props — memoised so the cost
  // recalculation is not invalidated on every render.
  const stableRates = useMemo(() => rates, [rates]);

  const design = useDesign(stableRates);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");

  // The last thing the user actually asked for. Saved as the version note, so
  // the history reads "make it wider" rather than "version 4".
  const lastBrief =
    [...messages].reverse().find((message) => message.role === "user")?.content ??
    null;

  const { replace } = design;

  const send = useCallback(
    async (brief: string) => {
      const outgoing: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: brief,
      };

      // History is taken from the messages already on screen rather than from
      // state read after this update, which would be one turn behind.
      const history = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      setMessages((previous) => [...previous, outgoing]);
      setBusy(true);
      setError(null);

      try {
        const body: DesignRequestBody = {
          brief,
          history,
          current: design.spec,
        };

        const response = await fetch("/api/studio/design", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        const payload = (await response.json()) as
          | DesignResponse
          | DesignErrorResponse;

        if (!response.ok || "error" in payload) {
          setError(
            "error" in payload ? payload.error : "Berchuma could not answer.",
          );
          return;
        }

        setMessages((previous) => [
          ...previous,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: payload.reply,
            changedDesign: payload.spec !== null,
          },
        ]);

        if (payload.spec) {
          replace(payload.spec, payload.issues);
          // A phone shows one column at a time, and the thing worth seeing
          // after a design lands is the design.
          setTab("design");
        }
      } catch {
        setError(
          "The connection dropped before Berchuma answered. Try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [design.spec, messages, replace],
  );

  const chat = (
    <DesignChat
      messages={messages}
      busy={busy}
      error={error}
      hasDesign={design.spec !== null}
      onSend={send}
    />
  );

  return (
    // `h-full`, not viewport arithmetic. The workspace column is already a
    // definite height, and every attempt to compute this from `100dvh` has to
    // guess at the header, the tab strip and the phone's bottom navigation —
    // guess 36 px wrong and the message box sits below the fold, which is
    // exactly where it ended up the first time.
    <div className="flex h-full flex-col">
      {/* Phone and tablet: one column, three tabs. */}
      <div className="border-b p-2 @4xl/ws:hidden">
        <div
          role="tablist"
          aria-label="Studio view"
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        >
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              type="button"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium",
                tab === entry.id
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <entry.icon className="size-3.5" aria-hidden />
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {/*
        Two thresholds, not one.

        Three columns need about 1150 px of workspace to be worth having. Below
        that the middle column — the drawing, the thing people came to look
        at — was squeezed to 250 px while the chat and the price sat at their
        comfortable maximums, which is precisely backwards. So the studio
        widens in two steps: chat beside the design first, with the price
        under the rail where it scrolls with what it is pricing, and only then
        the price as a column of its own.
      */}
      <div className="grid min-h-0 flex-1 @4xl/ws:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] @6xl/ws:grid-cols-[minmax(300px,360px)_minmax(0,1fr)_minmax(300px,360px)]">
        {/* Chat */}
        <div
          className={cn(
            "min-h-0 @4xl/ws:block @4xl/ws:border-r",
            tab === "chat" ? "block" : "hidden",
          )}
        >
          {chat}
        </div>

        {/* The design, and the controls over it */}
        <div
          className={cn(
            "flex min-h-0 flex-col @4xl/ws:flex",
            tab === "design" ? "flex" : "hidden",
          )}
        >
          {design.spec ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2">
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold">
                    {design.spec.title}
                  </h1>
                  <p className="text-[11px] text-muted-foreground">
                    {design.parts?.totals.partCount ?? 0} parts ·{" "}
                    {design.spec.carcass.board.label}
                  </p>
                </div>
                <PublishBar spec={design.spec} lastBrief={lastBrief} />
              </div>

              {/* The editor takes the rest of the column. The panel inside it
                  scrolls on its own, so the design never scrolls off. */}
              <div className="min-h-0 flex-1">
                <DesignEditor
                  spec={design.spec}
                  onChange={design.set}
                />
              </div>
            </>
          ) : (
            <StartPanel
              onStart={(spec) => {
                // A starting design has already been validated, so it arrives
                // with no outstanding issues — which is the point of it.
                replace(spec, []);
                setTab("design");
              }}
              onOpenChat={() => setTab("chat")}
            />
          )}
        </div>

        {/* Price, once there is room for it to stand alone. */}
        <div
          className={cn(
            "min-h-0 overflow-y-auto overscroll-contain p-3 @4xl/ws:hidden @6xl/ws:block @6xl/ws:border-l",
            tab === "cost" ? "block" : "hidden",
          )}
        >
          {design.cost && design.spec ? (
            <CostPanel
              cost={design.cost}
              issues={design.issues}
              assumptions={design.spec.meta.assumptions}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              The price appears as soon as there is something to price.
            </p>
          )}
        </div>
      </div>

      {/* A phone hides two of the three columns, so the number that matters
          most stays visible whichever one is open. */}
      {design.cost ? (
        <button
          type="button"
          onClick={() => setTab("cost")}
          className="flex items-center justify-between border-t bg-card px-4 py-2 text-left @6xl/ws:hidden"
        >
          <span className="text-xs text-muted-foreground">Estimated price</span>
          <span className="text-sm font-semibold tabular-nums">
            {design.cost.currency}{" "}
            {Math.round(design.cost.price).toLocaleString("en-US")}
          </span>
        </button>
      ) : null}
    </div>
  );
}
