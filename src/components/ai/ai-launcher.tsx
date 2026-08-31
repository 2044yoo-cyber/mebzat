"use client";

import { Sparkles } from "lucide-react";

import { openPanel, update } from "@/lib/workspace/store";
import { useShell } from "@/lib/workspace/use-shell";
import { cn } from "@/lib/utils";

/**
 * The floating way into Medosha AI.
 *
 * It opens the assistant in the context panel rather than navigating to /ai.
 * That is the point of a workspace shell: asking a question should not cost
 * you the page you were reading — the map keeps its camera, the marketplace
 * keeps its filters, and the answer arrives beside them.
 *
 * Hidden while the dock is already open, where it would be a button that
 * changes nothing.
 */
export function AiLauncher() {
  const { aiOpen, panelCollapsed } = useShell();
  if (aiOpen && !panelCollapsed) return null;

  return (
    <button
      type="button"
      onClick={() => {
        openPanel();
        update({ aiOpen: true });
      }}
      aria-label="Ask Medosha AI"
      className={cn(
        "group pointer-events-auto flex items-center gap-2 rounded-full",
        "border border-brand/30 bg-background/90 py-2.5 pr-4 pl-2.5 shadow-lg backdrop-blur-xl",
        "transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-xl",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Sparkles className="size-4" />
      </span>
      {/* The label is dropped on small screens, leaving a compact circle. */}
      <span className="hidden text-sm font-medium sm:inline">Ask Medosha AI</span>
    </button>
  );
}
