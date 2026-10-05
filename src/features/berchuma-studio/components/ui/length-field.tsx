"use client";

import { useState } from "react";
import { Lock, Unlock } from "lucide-react";

import { cn } from "@/lib/utils";

export function LengthInput({
  label, value, min, max, step = 10, unit = "mm", className, disabled = false, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  className?: string; disabled?: boolean; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const rounded = Math.round(value);
  const [seen, setSeen] = useState(rounded);
  if (seen !== rounded) { setSeen(rounded); setDraft(null); }
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  const commit = () => {
    if (disabled || draft === null) return;
    const next = Number(draft);
    setDraft(null);
    if (draft.trim() !== "" && Number.isFinite(next)) onChange(clamp(next));
  };

  return (
    <input
      type="text" inputMode="numeric" pattern="[0-9]*"
      aria-label={`${label} in ${unit || "units"}`} disabled={disabled}
      value={draft ?? String(rounded)}
      onChange={(event) => !disabled && setDraft(event.target.value.replace(/[^0-9]/g, ""))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === "Escape") { setDraft(null); event.currentTarget.blur(); }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const from = draft === null ? rounded : Number(draft) || rounded;
          onChange(clamp(from + (event.key === "ArrowUp" ? step : -step)));
        }
      }}
      className={cn(
        "rounded-md border bg-background text-right tabular-nums",
        "focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className ?? "h-8 w-20 px-2 text-xs",
      )}
    />
  );
}

export function LengthField({
  label, value, min, max, step = 10, unit = "mm", slider = true, hint, disabled = false, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  slider?: boolean; hint?: string; disabled?: boolean; onChange: (value: number) => void;
}) {
  const [pinned, setPinned] = useState(false);
  const locked = disabled || pinned;
  const rounded = Math.round(value);
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));

  return (
    <div className={cn("space-y-1", locked && "opacity-75")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <LengthInput label={label} value={value} min={min} max={max} step={step} unit={unit} disabled={locked} onChange={onChange} />
          {unit ? <span className="text-[11px] text-muted-foreground">{unit}</span> : null}
          {slider ? (
            <button
              type="button"
              aria-pressed={pinned}
              aria-label={pinned ? `Unlock ${label}` : `Lock ${label}`}
              title={pinned ? `Unlock ${label}` : `Lock ${label}`}
              onClick={() => setPinned((current) => !current)}
              className={cn(
                "ml-1 flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                pinned ? "border-brand bg-brand/10 text-brand" : "bg-background text-muted-foreground hover:border-brand/50",
              )}
            >
              {pinned ? <Lock className="size-3.5" aria-hidden /> : <Unlock className="size-3.5" aria-hidden />}
            </button>
          ) : null}
        </div>
      </div>

      {slider ? (
        <input
          type="range" aria-hidden tabIndex={-1} disabled={locked}
          min={min} max={max} step={step}
          value={Math.min(max, Math.max(min, rounded))}
          onChange={(event) => !locked && onChange(clamp(Number(event.target.value)))}
          className="w-full accent-brand disabled:pointer-events-none disabled:opacity-45"
        />
      ) : null}

      {pinned ? <p className="text-[10px] text-brand">Locked — safe while scrolling</p> : hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
