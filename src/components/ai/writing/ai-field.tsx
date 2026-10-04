"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Pencil,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";

import { VoiceInput } from "@/components/ai/writing/voice-input";
import { useWriter, type WriterState } from "@/components/ai/writing/use-writer";
import {
  ACTION_ORDER,
  FRAGMENT_THRESHOLD,
  LANGUAGE_ORDER,
  TONE_ORDER,
  WRITE_ACTIONS,
  WRITE_LANGUAGES,
  WRITE_TONES,
  type WriteAction,
  type WriteLanguage,
  type WriteSurface,
  type WriteTone,
} from "@/lib/ai/writing";
import { cn } from "@/lib/utils";

/**
 * A textarea with the writing assistant attached.
 *
 * A drop-in replacement for `<Textarea>`: it keeps `name` and `defaultValue`,
 * so the uncontrolled forms across the app go on submitting exactly as they
 * did. Pass `value`/`onValueChange` instead and it behaves as controlled.
 *
 * The assistant never writes into the field. It produces a proposal shown
 * beneath the text, which the author accepts, edits first, or discards — and
 * one Undo restores the original after an accept. That is the difference
 * between a tool that helps you write and one that writes for you.
 *
 * Typing is never blocked. Every request runs against a snapshot and can be
 * abandoned; the textarea stays editable while a suggestion streams in.
 */

export type AiFieldProps = Omit<
  React.ComponentProps<"textarea">,
  "value" | "onChange"
> & {
  /** What is being written here. Changes the assistant's guidance. */
  surface: WriteSurface;
  /** Neighbouring values — a product's title while editing its description. */
  context?: string;
  /** Offer an unprompted suggestion when a short entry is left idle. */
  live?: boolean;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  onValueChange?: (value: string) => void;
  /** Hide the microphone where dictation makes no sense. */
  voice?: boolean;
};

/** How long the author must pause before a live suggestion is considered. */
const LIVE_IDLE_MS = 1500;
/** Live suggestions only apply to short entries — a note, not an essay. */
const LIVE_MAX_CHARS = 220;
const LIVE_MIN_CHARS = 8;

export function AiField({
  surface,
  context,
  live = false,
  value: controlled,
  onChange,
  onValueChange,
  voice = true,
  className,
  defaultValue,
  ...props
}: AiFieldProps) {
  const [internal, setInternal] = useState(String(defaultValue ?? ""));
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : internal;

  const [tone, setTone] = useState<WriteTone>("professional");
  const [language, setLanguage] = useState<WriteLanguage>("en");
  const [menuOpen, setMenuOpen] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [liveOff, setLiveOff] = useState(false);

  const { state, run, cancel } = useWriter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Text the live suggester has already answered, so it never repeats. */
  const lastLive = useRef<string | null>(null);

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) setInternal(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  const trimmed = value.trim();
  const hasText = trimmed.length > 0;
  const isFragment = hasText && trimmed.length < FRAGMENT_THRESHOLD;

  const ask = useCallback(
    (action: WriteAction, text = value) => {
      setMenuOpen(false);
      setEdited(null);
      void run({
        text,
        action,
        surface,
        tone,
        language: action === "translate" ? language : undefined,
        context,
      });
    },
    [value, surface, tone, language, context, run],
  );

  // ---- Live suggestions ---------------------------------------------------
  // Fires only after the author stops typing, only on short entries, only once
  // per distinct text, and never while another suggestion is on screen. The
  // timer is the whole mechanism: nothing here can delay a keystroke.
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  }, [ask]);

  const busy = state.busy;
  const hasProposal = Boolean(state.draft || state.error);

  useEffect(() => {
    if (!live || liveOff || busy || hasProposal) return;
    const text = value.trim();
    if (text.length < LIVE_MIN_CHARS || text.length > LIVE_MAX_CHARS) return;
    if (lastLive.current === text) return;

    const timer = setTimeout(() => {
      lastLive.current = text;
      askRef.current("improve", text);
    }, LIVE_IDLE_MS);

    return () => clearTimeout(timer);
  }, [live, liveOff, busy, hasProposal, value]);

  // Close the action menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
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

  const actions = useMemo(
    () =>
      ACTION_ORDER.filter((action) => {
        // Expanding a long piece is rarely what anyone wants, and "draft from
        // notes" makes no sense once there is already a draft.
        if (action === "complete") return trimmed.length < 400;
        return true;
      }),
    [trimmed.length],
  );

  function accept() {
    const text = edited ?? state.result;
    if (!text) return;
    setPrevious(value);
    setValue(text);
    setEdited(null);
    cancel();
    // Focus returns to the field so the next keystroke lands where expected.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function discard() {
    setEdited(null);
    cancel();
    // A dismissed live suggestion must not immediately come back.
    if (state.action === "improve") lastLive.current = value.trim();
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          {...props}
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            if (!isControlled) setInternal(event.target.value);
            onValueChange?.(event.target.value);
            onChange?.(event);
          }}
          className={cn(
            "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 pb-9 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            className,
          )}
        />

        {/* Inside the field, so the toolbar belongs to this text rather than
            to the form around it. */}
        <div className="pointer-events-none absolute inset-x-2 bottom-1.5 flex items-center gap-1">
          <div ref={menuRef} className="pointer-events-auto relative">
            <button
              type="button"
              onClick={() => hasText && setMenuOpen((open) => !open)}
              disabled={!hasText || state.busy}
              aria-expanded={menuOpen}
              aria-label="Improve with AI"
              title={
                hasText
                  ? "Improve with AI"
                  : "Write something first, then the assistant can help"
              }
              className={cn(
                "flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors",
                hasText
                  ? "text-brand hover:bg-brand/10"
                  : "cursor-not-allowed text-muted-foreground/40",
              )}
            >
              {state.busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              <span className="hidden sm:inline">Improve with AI</span>
              <ChevronDown className="size-3 opacity-60" />
            </button>

            {menuOpen && (
              // Opens downward. The toolbar sits at the bottom of the field,
              // so opening upward would both cover the text being edited and
              // clip under the sticky header when the field is near the top.
              <div className="absolute top-8 left-0 z-30 max-h-80 w-64 overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
                {isFragment && (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">
                    That is a note rather than a draft. “Draft from my notes”
                    builds it out — anything it has to assume is marked for you
                    to confirm.
                  </p>
                )}

                {actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => ask(action)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {WRITE_ACTIONS[action].label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {WRITE_ACTIONS[action].hint}
                      </span>
                    </span>
                  </button>
                ))}

                <div className="mt-1 space-y-1 border-t pt-1">
                  <label className="flex items-center gap-2 px-2.5 py-1 text-xs text-muted-foreground">
                    Tone
                    <select
                      value={tone}
                      onChange={(event) =>
                        setTone(event.target.value as WriteTone)
                      }
                      className="ml-auto rounded-md border bg-background px-1.5 py-0.5 text-xs"
                    >
                      {TONE_ORDER.map((entry) => (
                        <option key={entry} value={entry}>
                          {WRITE_TONES[entry].label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-2 px-2.5 py-1 text-xs text-muted-foreground">
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
              </div>
            )}
          </div>

          {voice && (
            <VoiceInput
              onTranscript={(spoken) =>
                setValue(
                  value ? `${value.replace(/\s+$/, "")} ${spoken}` : spoken,
                )
              }
            />
          )}

          {previous !== null && !state.busy && !hasProposal && (
            <button
              type="button"
              onClick={() => {
                setValue(previous);
                setPrevious(null);
              }}
              className="pointer-events-auto ml-auto flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Undo2 className="size-3" />
              Undo AI edit
            </button>
          )}
        </div>
      </div>

      {(state.busy || state.draft || state.error) && (
        <Proposal
          state={state}
          edited={edited}
          live={live && state.action === "improve"}
          onEditChange={setEdited}
          onAccept={accept}
          onDiscard={discard}
          onRetry={() => state.action && ask(state.action)}
          onSilenceLive={() => {
            setLiveOff(true);
            discard();
          }}
        />
      )}
    </div>
  );
}

function Proposal({
  state,
  edited,
  live,
  onEditChange,
  onAccept,
  onDiscard,
  onRetry,
  onSilenceLive,
}: {
  state: WriterState;
  edited: string | null;
  live: boolean;
  onEditChange: (next: string | null) => void;
  onAccept: () => void;
  onDiscard: () => void;
  onRetry: () => void;
  onSilenceLive: () => void;
}) {
  const shown = edited ?? state.draft;
  const editing = edited !== null;
  // Tags describe the text; they are not a new version of it. Offering "Use
  // this" would let one click replace a description with a list of keywords.
  const isTags = state.action === "tags";

  if (state.error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
        <span className="flex-1 text-muted-foreground">{state.error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-medium text-brand hover:underline"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-brand/30 bg-brand/[0.04]">
      <div className="flex flex-wrap items-center gap-2 border-b border-brand/20 px-3 py-1.5">
        <Sparkles className="size-3.5 shrink-0 text-brand" />
        <span className="text-xs font-medium">
          {state.action ? WRITE_ACTIONS[state.action].label : "Suggestion"}
        </span>
        {state.busy && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
        {state.latencyMs !== null && (
          <span className="text-xs text-muted-foreground">
            {(state.latencyMs / 1000).toFixed(1)}s
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {isTags
            ? "Derived from your text"
            : "Suggestion — your text is unchanged"}
        </span>
      </div>

      {isTags ? (
        <TagGroups text={shown} busy={state.busy} />
      ) : editing ? (
        <textarea
          value={shown}
          onChange={(event) => onEditChange(event.target.value)}
          rows={Math.min(14, Math.max(3, shown.split("\n").length + 1))}
          className="w-full resize-y bg-transparent px-3 py-2 text-sm outline-none"
        />
      ) : (
        <p className="max-h-64 overflow-y-auto px-3 py-2 text-sm whitespace-pre-wrap">
          {shown}
          {state.busy && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand align-text-bottom" />
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-brand/20 px-2 py-1.5">
        {isTags ? (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(shown)}
            disabled={state.busy || !shown.trim()}
            className="flex h-7 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Copy className="size-3.5" />
            Copy tags
          </button>
        ) : (
          <button
            type="button"
            onClick={onAccept}
            disabled={state.busy || !shown.trim()}
            className="flex h-7 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Check className="size-3.5" />
            Use this
          </button>
        )}

        {!editing && !isTags && (
          <button
            type="button"
            onClick={() => onEditChange(state.draft)}
            disabled={state.busy}
            className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Pencil className="size-3.5" />
            Edit first
          </button>
        )}

        <button
          type="button"
          onClick={onRetry}
          disabled={state.busy}
          className="flex h-7 items-center rounded-lg px-2.5 text-xs transition-colors hover:bg-muted disabled:opacity-40"
        >
          Again
        </button>

        <button
          type="button"
          onClick={onDiscard}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
          {isTags ? "Close" : "Keep mine"}
        </button>

        {live && (
          <button
            type="button"
            onClick={onSilenceLive}
            className="flex h-7 items-center rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Stop offering suggestions in this field"
          >
            Stop suggesting
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The tag action's output, as chips.
 *
 * The model returns one group per line — "Categories: a, b". Parsing that
 * rather than asking for JSON is what keeps it streamable: a half-finished
 * JSON object renders as nothing, while a half-finished list renders as the
 * groups that have already arrived.
 */
function TagGroups({ text, busy }: { text: string; busy: boolean }) {
  const groups = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // split() always yields a first element; the default says so.
      const [label = "", ...rest] = line.split(":");
      const items = rest
        .join(":")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return { label: label.trim(), items };
    })
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">
        {busy ? "Reading your text…" : "Nothing to tag yet."}
      </p>
    );
  }

  return (
    <div className="max-h-64 space-y-2 overflow-y-auto px-3 py-2">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {group.label}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {group.items.map((item, index) => (
              <li
                key={`${index}-${item}`}
                className="rounded-full border bg-background px-2 py-0.5 text-xs"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
