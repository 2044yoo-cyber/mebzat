"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Info, X } from "lucide-react";

import { PanoramaViewer, type PanoramaHotspot } from "@/components/tour/panorama-viewer";
import { SceneThumbnail } from "@/components/tour/scene-thumbnail";
import type { TourScene } from "@/lib/tour/queries";
import { cn } from "@/lib/utils";

/**
 * A tour: several panoramas, and the doors between them.
 *
 * Walking a building is the point, so moving between scenes is the thing this
 * has to get right. Three ways in, because they fail in different places: a
 * door hotspot inside the panorama, a thumbnail strip along the bottom, and
 * arrow keys. The first is how it is meant to be used, the second is how
 * somebody finds the room they actually want, and the third is the only one
 * that works without a pointing device.
 */

export function TourPlayer({
  scenes,
  className,
}: {
  scenes: TourScene[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState<{ title: string; description: string | null } | null>(null);

  const scene = scenes[index];

  // Which scene each hotspot leads to, resolved once. A tour saved before a
  // scene was deleted can hold a door pointing at nothing — the database nulls
  // the target rather than removing the marker, so the tour keeps working with
  // a dead link instead of silently losing it.
  const byId = useMemo(() => {
    const map = new Map<string, number>();
    scenes.forEach((s, i) => map.set(s.id, i));
    return map;
  }, [scenes]);

  const hotspots: PanoramaHotspot[] = useMemo(
    () =>
      (scene?.hotspots ?? [])
        .filter((hotspot) => hotspot.kind !== "scene" || hotspot.targetSceneId !== null)
        .map((hotspot) => ({
          id: hotspot.id,
          yaw: hotspot.yaw,
          pitch: hotspot.pitch,
          title: hotspot.title,
          kind: hotspot.kind,
        })),
    [scene],
  );

  const activate = useCallback(
    (id: string) => {
      const hotspot = scene?.hotspots.find((h) => h.id === id);
      if (!hotspot) return;

      if (hotspot.kind === "scene" && hotspot.targetSceneId) {
        const target = byId.get(hotspot.targetSceneId);
        if (target !== undefined) setIndex(target);
        return;
      }

      if (hotspot.kind === "link" && hotspot.targetUrl) {
        window.open(hotspot.targetUrl, "_blank", "noopener,noreferrer");
        return;
      }

      setNote({ title: hotspot.title, description: hotspot.description });
    },
    [scene, byId],
  );

  if (!scene) {
    return (
      <div className={cn("grid place-items-center bg-neutral-950 text-neutral-400", className)}>
        This tour has no scenes yet.
      </div>
    );
  }

  const step = (by: number) => setIndex((i) => (i + by + scenes.length) % scenes.length);

  return (
    <div
      className={cn("relative bg-neutral-950", className)}
      // The arrow keys are the only route through a tour without a pointing
      // device. tabIndex makes the region focusable so they arrive at all.
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") step(1);
        else if (event.key === "ArrowLeft") step(-1);
        else if (event.key === "Escape") setNote(null);
      }}
    >
      <PanoramaViewer
        // Remounts on a scene change, which is what disposes the old texture.
        // A tour of thirty rooms that kept them all would exhaust a phone.
        key={scene.id}
        src={scene.panoramaUrl}
        initialYaw={scene.initialYaw}
        initialPitch={scene.initialPitch}
        initialZoom={scene.initialZoom}
        hotspots={hotspots}
        onHotspot={activate}
        className="absolute inset-0"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
            {scene.title}
          </p>
          {/* Only ever reaches the owner: the row policy hides a pending scene
              from everyone else, so nobody is told a room exists that they
              cannot see. */}
          {scene.pending && (
            <p className="rounded-full bg-amber-500/85 px-3 py-1.5 text-xs font-medium text-black backdrop-blur">
              In review — only you can see this room
            </p>
          )}
        </div>
        {scenes.length > 1 && (
          <p className="rounded-full bg-black/45 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
            {index + 1} of {scenes.length}
          </p>
        )}
      </div>

      {scenes.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous scene"
            className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next scene"
            className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70"
          >
            <ChevronRight className="size-5" />
          </button>

          {/* The strip is how somebody reaches the room they want without
              walking there. It scrolls on its own so a thirty-scene tour does
              not push the page sideways. */}
          <div className="absolute inset-x-0 bottom-0 overflow-x-auto bg-gradient-to-t from-black/70 to-transparent p-3">
            <div className="flex gap-2">
              {scenes.map((other, i) => (
                <button
                  key={other.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={other.title}
                  aria-current={i === index}
                  className={cn(
                    "relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                    i === index ? "border-white" : "border-transparent hover:border-white/50",
                  )}
                >
                  <SceneThumbnail
                    src={other.panoramaUrl}
                    pending={other.pending}
                    sizes="96px"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-[11px] text-white">
                    {other.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {note && (
        <div className="absolute inset-x-4 bottom-24 mx-auto max-w-sm rounded-2xl border border-white/15 bg-black/80 p-4 text-white backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-white/70" />
              <div>
                <p className="text-sm font-medium">{note.title}</p>
                {note.description && (
                  <p className="mt-1 text-sm text-white/75">{note.description}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNote(null)}
              aria-label="Close"
              className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
