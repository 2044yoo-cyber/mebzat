"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Sparkles, X } from "lucide-react";

import { useWriter } from "@/components/ai/writing/use-writer";
import {
  ACTION_ORDER,
  WRITE_ACTIONS,
  WRITE_LANGUAGES,
  LANGUAGE_ORDER,
  type WriteAction,
  type WriteLanguage,
  type WriteSurface,
} from "@/lib/ai/writing";
import { cn } from "@/lib/utils";

/**
 * The assistant as a single button, for fields that cannot be replaced.
 *
 * The message composer manages its own height, selection and Enter-to-send, so
 * swapping its textarea for `AiField` would mean reimplementing all of that.
 * This attaches to the existing field instead: it reads the value, proposes an
 * edit in a popover, and hands back the accepted text.
 *
 * Same contract as `AiField` — nothing is applied until the author accepts.
 */
export function AiRefine({
  surface,
  value,
  onAccept,
  disabled,
  context,
  /** Actions worth offering here. The full menu is overkill in a chat box. */
  actions = ["improve", "professional", "expand", "shorten", "translate"],
}: {
  surface: WriteSurface;
  value: string;
  onAccept: (next: string) => void;
  disabled?: boolean;
  context?: string;
  actions?: WriteAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [language, setLanguage] = useState<WriteLanguage>("en");
  const { state, run, cancel } = useWriter();
  const root = useRef<HTMLDivElement>(null);

  const hasText = value.trim().length > 0;
  const showing = state.busy || Boolean(state.draft) || Boolean(state.error);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function ask(action: WriteAction) {
    setMenuOpen(false);
    void run({
      text: value,
      action,
      surface,
      language: action === "translate" ? language : undefined,
      context,
    });
  }

  const menu = ACTION_ORDER.filter((action) => actions.includes(action));

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => hasText && setMenuOpen((open) => !open)}
        disabled={disabled || !hasText || state.busy}
        aria-expanded={menuOpen}
        aria-label="Improve with AI"
        title={hasText ? "Improve with AI" : "Write something first"}
        className={cn(
          "flex size-8 items-center justify-center rounded-lg transition-colors",
          hasText && !disabled
            ? "text-brand hover:bg-brand/10"
            : "cursor-not-allowed text-muted-foreground/40",
        )}
      >
        {state.busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
      </button>

      {menuOpen && (
        <div className="absolute bottom-10 left-0 z-40 w-56 rounded-xl border bg-popover p-1 shadow-xl">
          {menu.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => ask(action)}
              className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              {WRITE_ACTIONS[action].label}
            </button>
          ))}
          <label className="mt-1 flex items-center gap-2 border-t px-2.5 pt-2 pb-1 text-xs text-muted-foreground">
            Language
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as WriteLanguage)
              }
              className="ml-auto rounded-md border bg-background px-1.5 py-0.5 text-xs"
            >
              {LANGUAGE_ORDER.map((entry) => (
                <option key={entry} value={entry}>
                  {WRITE_LANGUAGES[entry].endonym}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {showing && (
        <div className="absolute bottom-10 left-0 z-40 w-[min(28rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-brand/40 bg-popover shadow-2xl">
          <div className="flex items-center gap-2 border-b border-brand/20 px-3 py-1.5">
            <Sparkles className="size-3.5 shrink-0 text-brand" />
            <span className="text-xs font-medium">
              {state.action ? WRITE_ACTIONS[state.action].label : "Suggestion"}
            </span>
            {state.busy && (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              Your message is unchanged
            </span>
          </div>

          {state.error ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {state.error}
            </p>
          ) : (
            <p className="max-h-56 overflow-y-auto px-3 py-2 text-sm whitespace-pre-wrap">
              {state.draft}
            </p>
          )}

          <div className="flex items-center gap-1.5 border-t border-brand/20 px-2 py-1.5">
            {!state.error && (
              <button
                type="button"
                onClick={() => {
                  if (!state.result) return;
                  onAccept(state.result);
                  cancel();
                }}
                disabled={state.busy || !state.result}
                className="flex h-7 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Check className="size-3.5" />
                Use this
              </button>
            )}
            <button
              type="button"
              onClick={cancel}
              className="ml-auto flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              Keep mine
            </button>
          </div>
        </div>
      )}

      {/* A quiet affordance that there is a menu behind the sparkle. */}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0.5 size-2.5 text-muted-foreground/50"
      />
    </div>
  );
}
