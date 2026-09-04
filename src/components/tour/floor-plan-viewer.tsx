"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw, Share2, X } from "lucide-react";
import { toast } from "sonner";

import type { FloorPlan } from "@/lib/tour/floor-plans";
import { cn } from "@/lib/utils";

/**
 * Reading a floor plan.
 *
 * Two kinds of file, two treatments. An image is drawn into a pannable,
 * zoomable frame of our own, because a plan is read by moving around it and a
 * browser's default image view gives none of that on a phone. A PDF is handed
 * to the browser's own viewer, which already does pages, text selection and
 * printing far better than anything worth writing here — and a multi-page set
 * of floor plans is the common case for a real development.
 *
 * Pointer Events and two-finger pinch, the same as the panorama viewer, so a
 * plan behaves the way the rest of the 360° experience does.
 */

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;

export function FloorPlanViewer({
  plan,
  onClose,
  onOpenTour,
}: {
  plan: FloorPlan;
  onClose: () => void;
  /** Shown only when the plan sits beside a tour. */
  onOpenTour?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Escape closes, which is what every viewer on the web does and what people
  // reach for before they look for a button.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The page behind must not scroll while a full-screen layer is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: plan.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      // A cancelled share is not a failure and must not be reported as one.
    }
  }

  async function goFullscreen() {
    const node = frame.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      toast.error("This browser would not go full screen.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the plan"
          className="flex size-10 items-center justify-center rounded-full hover:bg-white/10"
        >
          <X className="size-5" />
        </button>

        <p className="min-w-0 flex-1 truncate text-sm font-medium">{plan.title}</p>

        {plan.pending && (
          <span className="shrink-0 rounded-full bg-amber-500/85 px-2.5 py-1 text-[11px] font-medium text-black">
            In review
          </span>
        )}

        {onOpenTour && (
          <button
            type="button"
            onClick={onOpenTour}
            className="hidden shrink-0 rounded-full border border-white/25 px-3 py-1.5 text-xs font-medium hover:bg-white/10 sm:block"
          >
            Open 360° tour
          </button>
        )}

        <button
          type="button"
          onClick={share}
          aria-label="Share this plan"
          className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
        >
          <Share2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={goFullscreen}
          aria-label="Full screen"
          className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>

      <div ref={frame} className="relative min-h-0 flex-1 bg-neutral-900">
        {plan.mediaType === "pdf" ? (
          // The browser's own PDF viewer: pages, search, print, and a zoom
          // control that already works. Rewriting that here would be worse.
          <object data={plan.url} type="application/pdf" className="size-full">
            <div className="grid size-full place-items-center p-6 text-center text-sm text-neutral-400">
              <p>
                This browser cannot display the PDF.{" "}
                <a
                  href={plan.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  Open it in a new tab
                </a>
                .
              </p>
            </div>
          </object>
        ) : (
          <PannableImage
            src={plan.url}
            alt={plan.title}
            scale={scale}
            offset={offset}
            onScale={setScale}
            onOffset={setOffset}
          />
        )}
      </div>

      {plan.mediaType === "image" && (
        <div className="flex items-center justify-center gap-2 border-t border-white/10 px-3 py-2 text-white">
          <button
            type="button"
            onClick={() => setScale((s) => clampScale(s / 1.4))}
            aria-label="Zoom out"
            className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-14 text-center text-xs tabular-nums text-white/70">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => clampScale(s * 1.4))}
            aria-label="Zoom in"
            className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Fit to the screen"
            className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
          >
            <RotateCcw className="size-4" />
          </button>

          {onOpenTour && (
            <button
              type="button"
              onClick={onOpenTour}
              className="ml-2 rounded-full border border-white/25 px-3 py-2 text-xs font-medium hover:bg-white/10 sm:hidden"
            >
              Open 360° tour
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function clampScale(value: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}

/**
 * The image, and the dragging of it.
 *
 * Held in the parent's state rather than this component's so the zoom buttons
 * and the drag move the same thing. Pointer Events again: one path for a
 * mouse, a finger and a stylus.
 */
function PannableImage({
  src,
  alt,
  scale,
  offset,
  onScale,
  onOffset,
}: {
  src: string;
  alt: string;
  scale: number;
  offset: { x: number; y: number };
  onScale: (next: number | ((s: number) => number)) => void;
  onOffset: (next: { x: number; y: number }) => void;
}) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef({ x: 0, y: 0 });
  const pinch = useRef({ distance: 0, scale: 1 });

  function down(event: React.PointerEvent) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 1) {
      last.current = { x: event.clientX, y: event.clientY };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  }

  function move(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance > 0 && distance > 0) {
        onScale(clampScale(pinch.current.scale * (distance / pinch.current.distance)));
      }
      return;
    }

    if (pointers.current.size !== 1) return;
    onOffset({
      x: offset.x + (event.clientX - last.current.x),
      y: offset.y + (event.clientY - last.current.y),
    });
    last.current = { x: event.clientX, y: event.clientY };
  }

  function up(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = { distance: 0, scale };
  }

  return (
    <div
      className="size-full overflow-hidden"
      style={{ touchAction: "none", cursor: scale > 1 ? "grab" : "default" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onWheel={(event) => onScale((s) => clampScale(s - event.deltaY * 0.002))}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a plan may be a
          signed quarantine URL, which next/image must not cache; and it is
          transformed here rather than resized. */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn("size-full select-none object-contain")}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "center",
        }}
      />
    </div>
  );
}
