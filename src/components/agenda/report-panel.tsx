"use client";

import { useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The Agenda assistant.
 *
 * Writes the report a project manager would write on a Friday and usually does
 * not. It is given only the records the reader can see, so a contractor
 * without finance access gets a summary that says so rather than one that
 * quietly omits the money and reads as complete.
 */

const KINDS = [
  { id: "daily", label: "Today" },
  { id: "weekly", label: "This week" },
  { id: "progress", label: "For the client" },
  { id: "risks", label: "What is at risk" },
] as const;

export function ReportPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("weekly");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function run(next: (typeof KINDS)[number]["id"]) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setKind(next);
    setBusy(true);
    setText("");

    try {
      const response = await fetch("/api/agenda/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, kind: next }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setText(payload.error ?? "The assistant could not write that report.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let out = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        out += decoder.decode(value, { stream: true });
        setText(out);
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        setText("The assistant could not be reached. Your records are unaffected.");
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-brand" />
          Assistant
        </h2>
        <button
          type="button"
          onClick={() => {
            abortRef.current?.abort();
            onClose();
          }}
          aria-label="Close"
          className="ml-auto flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => run(entry.id)}
            disabled={busy}
            aria-pressed={kind === entry.id}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50",
              kind === entry.id && text
                ? "border-brand bg-brand/10 font-medium text-brand"
                : "text-muted-foreground hover:border-brand",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {busy && !text && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Reading the records…
        </p>
      )}

      {text && (
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-sm whitespace-pre-wrap">{text}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Written from this Agenda&rsquo;s records, and only the ones you can
            see. Check anything you are about to act on.
          </p>
        </div>
      )}
    </section>
  );
}
