"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A measurement: a box to type it in and a slider to feel for it.
 *
 * Both, not one. The slider is how somebody explores — "a bit wider, a bit
 * wider, there" — and the box is how they enter the number they took off the
 * wall with a tape. A studio with only a slider cannot accept 2437, and one
 * with only a box makes you guess and retype until it looks right.
 *
 * That reasoning was already written down in `config-rail.tsx`, which had the
 * pair. The cabinet's own width, height and depth were sliders alone, the
 * starting width was a slider alone, and a section's width was not a control
 * at all — it was a label. This is the one control, in one place, so the next
 * measurement that gets added does not have to rediscover the argument.
 *
 * ## Typing is not the same as dragging
 *
 * A slider's value can be clamped on every event, because every event is a
 * valid number the user chose by pointing at it. A box cannot: somebody typing
 * "1400" passes through "1", and clamping that to the minimum on the first
 * keystroke rewrites the field under them — the caret jumps, the next digit
 * lands in the wrong place, and entering a number becomes a fight.
 *
 * So the box keeps what was typed while it is being typed, and commits on blur
 * or Enter. Anything unreadable falls back to the value that was already
 * there. `draft` is null whenever the field is not mid-edit, which is what
 * lets an outside change — dragging the model's handle, say — show up in the
 * box immediately rather than being held back by a stale local copy.
 */
export function LengthField({
  label,
  value,
  min,
  max,
  step = 10,
  unit = "mm",
  slider = true,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** False where a slider would be noise — a list of ten section widths. */
  slider?: boolean;
  /** A word under the field, for a limit worth explaining. */
  hint?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const rounded = Math.round(value);

  // An outside change — the model's drag handle, or a sibling field
  // redistributing — should not be swallowed by a draft the user has not
  // committed. Dropping the draft when the incoming value moves keeps the two
  // in step without fighting the keyboard.
  //
  // Adjusted during render rather than in an effect. React's own guidance for
  // "reset some state when a prop changes", and the reason is not style: an
  // effect runs *after* the browser has been given a frame to paint, so the
  // box would show the stale draft for one frame and then correct itself.
  // Doing it here means the render that brings the new value is the render
  // that shows it.
  const [seen, setSeen] = useState(rounded);
  if (seen !== rounded) {
    setSeen(rounded);
    setDraft(null);
  }

  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));

  const commit = () => {
    if (draft === null) return;
    const next = Number(draft);
    setDraft(null);
    if (draft.trim() !== "" && Number.isFinite(next)) onChange(clamp(next));
  };

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <div className="flex items-baseline gap-1">
          <input
            // `inputMode` rather than `type="number"`: a number input on a
            // phone still shows the full keyboard on some Android browsers,
            // and its spinner steals horizontal room in a 14-character box.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={`${label} in ${unit || "units"}`}
            value={draft ?? String(rounded)}
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                setDraft(null);
                event.currentTarget.blur();
              }
              // The arrows step by the same amount the slider does, which is
              // what somebody who has just typed a number expects them to do.
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                const from = draft === null ? rounded : Number(draft) || rounded;
                onChange(clamp(from + (event.key === "ArrowUp" ? step : -step)));
              }
            }}
            className={cn(
              "h-8 w-20 rounded-md border bg-background px-2 text-right text-xs tabular-nums",
              "focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40",
            )}
          />
          {unit ? (
            <span className="text-[11px] text-muted-foreground">{unit}</span>
          ) : null}
        </div>
      </div>

      {slider ? (
        <input
          type="range"
          // Hidden from screen readers: it sets the same value as the box
          // above, which already carries the label. Two controls for one
          // number read as two numbers when they are read out.
          aria-hidden
          tabIndex={-1}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, rounded))}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          className="w-full accent-brand"
        />
      ) : null}

      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
