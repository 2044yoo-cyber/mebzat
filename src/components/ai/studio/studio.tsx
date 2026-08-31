"use client";

import { useCallback, useEffect, useState } from "react";
import { History, PanelLeft, X } from "lucide-react";

import { AiChat } from "@/components/ai/ai-chat";
import { HistoryPanel } from "@/components/ai/studio/history-panel";
import { ImageWorkspace } from "@/components/ai/studio/image-workspace";
import { RedesignWorkspace } from "@/components/ai/studio/redesign-workspace";
import { ToolRail } from "@/components/ai/studio/tool-rail";
import type { HistoryEntry } from "@/lib/ai/image-history";
import type { ImageProviderName } from "@/lib/ai/image-models";
import type { ProviderHealth } from "@/lib/ai/provider-status";
import { DEFAULT_TOOL, findTool, type StudioTool } from "@/lib/ai/studio";
import { cn } from "@/lib/utils";

/**
 * Medosha AI Studio.
 *
 * Three columns inside the existing AI page: tools on the left, the workspace
 * in the middle, history on the right. Choosing a tool swaps the middle column
 * and nothing else — no navigation, no reload, and the chat is not remounted
 * when you come back to it.
 *
 * The chat is the default and is the same `AiChat` component the page has
 * always used. It is kept mounted behind the image tools rather than unmounted
 * and rebuilt, so a conversation survives a detour into the image generator.
 */
export function AiStudio({
  initialPrompt,
  initialTool,
}: {
  initialPrompt?: string;
  initialTool?: string;
}) {
  const [tool, setTool] = useState<StudioTool>(
    () => findTool(initialTool ?? DEFAULT_TOOL) ?? findTool(DEFAULT_TOOL)!,
  );
  const [chatPrompt, setChatPrompt] = useState(initialPrompt ?? "");
  const [chatKey, setChatKey] = useState(0);
  const [configured, setConfigured] = useState<ImageProviderName[]>([]);
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Which providers actually work. Asked once, with a probe, because a
  // provider whose key is present but rejected must not be offered as a
  // choice — that is precisely what made a failure look like the user's
  // fault. The answer decides what the model picker offers and what the
  // setup panel says.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/ai/image/providers?probe=1", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          configured?: ImageProviderName[];
          providers?: ProviderHealth[];
        };
        setConfigured(payload.configured ?? []);
        setHealth(payload.providers ?? []);
      } catch {
        // Offline or signed out. The workspace shows the setup panel, which
        // is the right thing to show when nothing is known to work.
      }
    })();
    return () => controller.abort();
  }, []);

  const select = useCallback((next: StudioTool) => {
    setTool(next);
    setRailOpen(false);
  }, []);

  /** Sends a prompt into the chat and switches to it. */
  const askChat = useCallback((prompt: string) => {
    setChatPrompt(prompt);
    // Remount so the composer picks up the new initial prompt; the previous
    // conversation has already been answered, so nothing is lost.
    setChatKey((key) => key + 1);
    setTool(findTool("chat")!);
  }, []);

  const continueEditing = useCallback((entry: HistoryEntry) => {
    setHistoryOpen(false);
    const target = findTool("editor");
    if (target) setTool(target);
    // The workspace reads this on mount through its own state, so the image
    // is handed over by way of the clipboard-free route: a custom event.
    window.dispatchEvent(
      new CustomEvent("medosha:studio:load-image", { detail: entry.url }),
    );
  }, []);

  const isChat = tool.kind === "chat";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0">
      {/* ---- Tools ---------------------------------------------------- */}
      <div className="hidden w-56 shrink-0 border-r md:block">
        <ToolRail active={tool.id} onSelect={select} />
      </div>

      {railOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close tools"
            onClick={() => setRailOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <div className="relative h-full w-64 border-r bg-background">
            <ToolRail active={tool.id} onSelect={select} />
          </div>
        </div>
      )}

      {/* ---- Workspace ------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2 md:hidden">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Open tools"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PanelLeft className="size-4" />
          </button>
          <span className="truncate text-sm font-medium">
            {tool.emoji} {tool.label}
          </span>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open history"
            className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <History className="size-4" />
          </button>
        </div>

        {/* The chat stays mounted and is hidden rather than unmounted, so a
            conversation survives a trip through the image tools. */}
        <div className={cn("min-h-0 flex-1", isChat ? "flex flex-col" : "hidden")}>
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
            <AiChat
              key={chatKey}
              initialPrompt={chatPrompt || undefined}
              agent={tool.agent}
            />
          </div>
        </div>

        {!isChat && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Redesign is a workflow, not a prompt box, so it has its own
                workspace. Everything else shares the generic one. */}
            {tool.id === "redesign" ? (
              <RedesignWorkspace
                configured={configured}
                health={health}
                onUseInChat={askChat}
              />
            ) : (
              <ImageWorkspace
                key={tool.id}
                tool={tool}
                configured={configured}
                health={health}
                onUseInChat={askChat}
              />
            )}
          </div>
        )}
      </div>

      {/* ---- History -------------------------------------------------- */}
      <div className="hidden w-72 shrink-0 border-l xl:block">
        <HistoryPanel onContinue={continueEditing} />
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close history"
            onClick={() => setHistoryOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <div className="absolute inset-y-0 right-0 w-80 max-w-[90vw] border-l bg-background">
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close"
              className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
            <HistoryPanel onContinue={continueEditing} />
          </div>
        </div>
      )}
    </div>
  );
}
