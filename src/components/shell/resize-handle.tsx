"use client";

import { useCallback, useRef } from "react";

import { clamp } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

/**
 * A draggable column divider.
 *
 * The drag writes straight to the workspace store, which is outside React, so
 * a pointer move costs one subscriber notification rather than a state update
 * and a reconciliation of the whole shell. Pointer capture means the drag
 * survives the cursor leaving the 4px hit area, which it will immediately.
 *
 * Arrow keys move it too — a divider that can only be dragged is a divider
 * some people cannot move at all.
 */
export function ResizeHandle({
  value,
  min,
  max,
  onChange,
  /** Which way a larger value grows: "right" for the left rail. */
  grow,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  grow: "right" | "left";
  label: string;
}) {
  const start = useRef({ pointer: 0, value: 0 });

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      start.current = { pointer: event.clientX, value };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [value],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const delta = event.clientX - start.current.pointer;
      const next = start.current.value + (grow === "right" ? delta : -delta);
      onChange(clamp(Math.round(next), min, max));
    },
    [grow, max, min, onChange],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 24 : 8;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onChange(clamp(value + (grow === "right" ? -step : step), min, max));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onChange(clamp(value + (grow === "right" ? step : -step), min, max));
      }
    },
    [grow, max, min, onChange, value],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative z-10 -mx-0.5 w-1 shrink-0 cursor-col-resize touch-none",
        "focus-visible:outline-none",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors",
          "group-hover:bg-brand group-focus-visible:bg-brand",
        )}
      />
    </div>
  );
}
