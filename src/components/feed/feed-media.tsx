"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Volume2, VolumeX } from "lucide-react";

import type { FeedMedia as Media } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

/**
 * The picture on a card.
 *
 * Three shapes, chosen from the media itself rather than from a prop:
 *
 *  - a comparison, when the media carry Before/After labels — a draggable
 *    divider, because two images side by side on a 390px screen are two
 *    thumbnails and nobody can see the difference;
 *  - a video, which plays when it is on screen and stops when it is not;
 *  - a swipe gallery for everything else.
 *
 * Every variant is 4:3 and reserves its box before the image arrives, so the
 * feed never reflows under a reader's thumb mid-scroll. That is the single
 * most important thing about an infinite feed on a phone.
 */
export function FeedMedia({
  media,
  priority = false,
  className,
}: {
  media: Media[];
  /** Set on the first card only: everything else waits for the viewport. */
  priority?: boolean;
  className?: string;
}) {
  const first = media[0];
  if (!first) return null;

  const labelled = media.filter((entry) => entry.label);
  if (labelled.length === 2 && media.length === 2) {
    const [before, after] = labelled as [Media, Media];
    return (
      <Comparison before={before} after={after} priority={priority} className={className} />
    );
  }

  if (first.kind === "video") {
    return <VideoPlayer media={first} className={className} />;
  }

  return <Gallery media={media} priority={priority} className={className} />;
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

function Gallery({
  media,
  priority,
  className,
}: {
  media: Media[];
  priority: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  // The scroller is the source of truth for which image is showing — a phone
  // swipes it directly, and driving the index from scroll position rather
  // than from the arrows keeps the dots honest either way.
  function onScroll() {
    const node = track.current;
    if (!node || node.clientWidth === 0) return;
    const next = Math.round(node.scrollLeft / node.clientWidth);
    setIndex((current) => (current === next ? current : next));
  }

  function go(delta: number) {
    const node = track.current;
    if (!node) return;
    const next = Math.min(Math.max(index + delta, 0), media.length - 1);
    node.scrollTo({ left: next * node.clientWidth, behavior: "smooth" });
  }

  const many = media.length > 1;

  return (
    <div className={cn("group/media relative", className)}>
      <div
        ref={track}
        onScroll={onScroll}
        className={cn(
          "flex aspect-4/3 w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain bg-muted",
          // The scrollbar is noise on a gallery of three images.
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {media.map((entry, position) => (
          <div key={entry.id} className="relative w-full shrink-0 snap-center">
            <Image
              src={entry.url}
              alt={entry.alt ?? ""}
              fill
              // One column on a phone, roughly half on a tablet, and capped at
              // the feed's own max width on a desktop.
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 620px"
              className="object-cover"
              priority={priority && position === 0}
              loading={priority && position === 0 ? undefined : "lazy"}
            />
          </div>
        ))}
      </div>

      {many && (
        <>
          {/* Arrows are a pointer affordance. A phone swipes and never sees
              them; hiding them on touch stops them covering the image. */}
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Previous image"
            className="absolute top-1/2 left-2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition-opacity group-hover/media:opacity-100 disabled:invisible @lg/ws:flex"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === media.length - 1}
            aria-label="Next image"
            className="absolute top-1/2 right-2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition-opacity group-hover/media:opacity-100 disabled:invisible @lg/ws:flex"
          >
            <ChevronRight className="size-4" />
          </button>

          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
            {media.map((entry, position) => (
              <span
                key={entry.id}
                className={cn(
                  "size-1.5 rounded-full transition-all",
                  position === index ? "w-4 bg-white" : "bg-white/50",
                )}
              />
            ))}
          </div>

          <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
            {index + 1}/{media.length}
          </span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

/**
 * Autoplay tied to visibility.
 *
 * Muted, because every browser blocks an unmuted autoplay and a feed that
 * makes noise unprompted is a feed people close. Playback starts when the
 * player is more than half on screen and stops the moment it is not, so
 * scrolling past a video costs one decode rather than a background download
 * that runs for the rest of the session.
 */
function VideoPlayer({ media, className }: { media: Media; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const node = video.current;
    if (!node) return;

    // Without IntersectionObserver — old browsers, and jsdom in tests — the
    // video simply stays paused with its poster and controls showing. That is
    // a worse experience, not a broken one.
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // A play() rejection is normal — a background tab, or a policy
            // that wants a gesture. The controls are still there.
            void node.play().catch(() => undefined);
          } else {
            node.pause();
          }
        }
      },
      { threshold: 0.55 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn("relative aspect-4/3 w-full bg-black", className)}>
      <video
        ref={video}
        src={media.url}
        poster={media.posterUrl ?? undefined}
        muted={muted}
        loop
        playsInline
        preload="none"
        controls
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="size-full object-contain"
      />

      {!playing && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-black/55 backdrop-blur">
            <Play className="size-6 translate-x-0.5 fill-white text-white" />
          </span>
        </span>
      )}

      <button
        type="button"
        onClick={() => setMuted((current) => !current)}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-3 bottom-14 flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>

      {media.durationSeconds != null && (
        <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
          {formatDuration(media.durationSeconds)}
        </span>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Before and after
// ---------------------------------------------------------------------------

/**
 * A draggable divider over two stacked images.
 *
 * Pointer events rather than mouse plus touch: one code path covers a finger,
 * a mouse and a stylus, and `setPointerCapture` means a drag that leaves the
 * image still tracks instead of sticking.
 */
function Comparison({
  before,
  after,
  priority,
  className,
}: {
  before: Media;
  after: Media;
  priority: boolean;
  className?: string;
}) {
  const [split, setSplit] = useState(50);
  const frame = useRef<HTMLDivElement>(null);

  function moveTo(clientX: number) {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const ratio = ((clientX - box.left) / box.width) * 100;
    setSplit(Math.min(Math.max(ratio, 2), 98));
  }

  return (
    <div
      ref={frame}
      className={cn("relative aspect-4/3 w-full touch-none overflow-hidden bg-muted select-none", className)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 0) return;
        moveTo(event.clientX);
      }}
    >
      <Image
        src={after.url}
        alt={after.alt ?? "After"}
        fill
        sizes="(max-width: 640px) 100vw, 620px"
        className="object-cover"
        priority={priority}
      />

      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      >
        <Image
          src={before.url}
          alt={before.alt ?? "Before"}
          fill
          sizes="(max-width: 640px) 100vw, 620px"
          className="object-cover"
          priority={priority}
        />
      </div>

      <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
        Before
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
        After
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${split}%` }}
      >
        <span className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-900 shadow-lg">
          <ChevronLeft className="size-3.5" />
          <ChevronRight className="-ml-1 size-3.5" />
        </span>
      </div>

      {/* The keyboard route to the same control. A drag handle that only
          responds to a pointer is unusable without one. */}
      <input
        type="range"
        min={2}
        max={98}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        aria-label="Compare before and after"
        className="absolute inset-x-0 bottom-0 h-8 w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
