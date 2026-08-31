"use client";

import { useCallback, useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The original and the redesign, under one wiper.
 *
 * A side-by-side pair makes you compare two pictures. A wiper makes you see
 * one room change, which is the thing worth seeing when the input was the
 * user's own photograph.
 *
 * Draggable and keyboard-operable, because a control that only responds to a
 * held mouse button is a control some people cannot use at all.
 */
export function BeforeAfter({
  before,
  after,
  className,
}: {
  before: string;
  after: string;
  className?: string;
}) {
  const [position, setPosition] = useState(50);
  const frame = useRef<HTMLDivElement>(null);

  const moveTo = useCallback((clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const next = ((clientX - box.left) / box.width) * 100;
    setPosition(Math.min(100, Math.max(0, next)));
  }, []);

  return (
    <div
      ref={frame}
      className={cn(
        "relative aspect-[4/3] w-full touch-none overflow-hidden rounded-2xl border bg-muted select-none",
        className,
      )}
      onPointerMove={(event) => {
        // Only while dragging: pointer capture is on the handle, so a plain
        // hover over the image does nothing.
        if (event.buttons === 1) moveTo(event.clientX);
      }}
    >
      {/* The redesign fills the frame; the original is clipped over it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={after}
        alt="Redesigned"
        className="absolute inset-0 size-full object-cover"
      />

      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={before}
          alt="Original"
          className="absolute inset-0 size-full object-cover"
        />
      </div>

      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
        Original
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground">
        AI design
      </span>

      {/* The wiper. */}
      <div
        className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${position}%` }}
      >
        <button
          type="button"
          role="slider"
          aria-label="Compare original and redesign"
          aria-valuenow={Math.round(position)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              moveTo(event.clientX);
            }
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 2;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setPosition((current) => Math.max(0, current - step));
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setPosition((current) => Math.min(100, current + step));
            }
            if (event.key === "Home") setPosition(0);
            if (event.key === "End") setPosition(100);
          }}
          className={cn(
            "absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
            "items-center justify-center rounded-full bg-white text-neutral-900 shadow-lg",
            "focus-visible:ring-3 focus-visible:ring-brand focus-visible:outline-none",
          )}
        >
          <MoveHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
}
