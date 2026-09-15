"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Box, Loader2, Ruler, SlidersHorizontal, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { ControlPanel } from "./control-panel";
import {
  DEFAULT_SNAP,
  SNAPS,
  dragOwnsGesture,
  heightDuringDrag,
  settle,
} from "../ui/sheet-height";
import { moveCabinet, resizeCabinet } from "../../services/operations";
import { Elevation } from "../viewer/elevation";
import type { DesignSpec } from "../../types/spec";

/**
 * The design, large, with the controls over it.
 *
 * The model occupies the screen and the panel floats on the right, because the
 * thing somebody came here to look at is the furniture. On a phone the panel
 * becomes a sheet that slides up over the bottom half — the same controls, out
 * of the way until they are wanted.
 *
 * 2D and 3D are the same design and the same selection. Switching between them
 * changes nothing but how it is drawn, which is the point: a joiner reads the
 * elevation, a customer reads the 3D, and neither of them is looking at a
 * different design.
 */

const Model = dynamic(() => import("../viewer/model"), {
  ssr: false,
  loading: () => <Loading />,
});

type View = "solid" | "flat";

export function DesignEditor({
  spec,
  onChange,
}: {
  spec: DesignSpec;
  onChange: (next: DesignSpec) => void;
}) {
  const [view, setView] = useState<View>("solid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hideFronts, setHideFronts] = useState(false);
  const [showCountertop, setShowCountertop] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // ---- the controls sheet, and how tall it is -----------------------------
  const sheetRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(DEFAULT_SNAP);
  const [dragging, setDragging] = useState(false);

  /**
   * One pointer gesture on the sheet.
   *
   * Bound to the handle *and* to the list, because the two behave differently
   * and the difference is `dragOwnsGesture`: pulling down on a list that is
   * already at its top puts the sheet away, and pulling down anywhere else
   * scrolls the list. Starting from the handle always drags.
   *
   * Written with listeners added on the window rather than React handlers on
   * the element, so a finger that leaves the sheet mid-drag — which it does,
   * because the sheet is shrinking away from it — still finishes the gesture.
   */
  function beginDrag(event: React.PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const fromHandle = event.currentTarget === event.currentTarget.closest("button");
    const editor = sheetRef.current?.parentElement?.clientHeight ?? 0;
    const startY = event.clientY;
    const startHeight = height;
    const startedAt = performance.now();

    let owned = fromHandle;
    let last = { y: startY, at: startedAt };
    let current = startHeight;

    const move = (moveEvent: PointerEvent) => {
      const travel = moveEvent.clientY - startY;

      if (!owned) {
        const scrollTop = listRef.current?.scrollTop ?? 0;
        if (!dragOwnsGesture(scrollTop, travel)) return;
        owned = true;
        setDragging(true);
      }

      // Only once the gesture is ours: calling this on a scroll would stop the
      // list scrolling.
      moveEvent.preventDefault();
      current = heightDuringDrag(startHeight, travel, editor);
      setHeight(current);
      last = { y: moveEvent.clientY, at: performance.now() };
    };

    const finish = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (!owned) return;

      // Measured over the last movement rather than the whole gesture: a slow
      // drag that ends in a flick is a flick, and averaging over the drag
      // would call it slow.
      const seconds = Math.max(0.016, (performance.now() - last.at) / 1000);
      const velocity =
        editor > 0 ? (upEvent.clientY - last.y) / editor / seconds : 0;

      setDragging(false);
      setHeight(settle(current, velocity));
    };

    if (fromHandle) setDragging(true);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  // Reopening returns it to where it opens, not to whatever a previous session
  // left it at. Somebody who pushed it down to look at the model and then
  // closed it wants the controls back when they press the button again.
  function openPanel() {
    setHeight(DEFAULT_SNAP);
    setPanelOpen(true);
  }

  const selected =
    spec.cabinets.find((cabinet) => cabinet.id === selectedId) ?? null;

  return (
    <div className="relative flex h-full min-h-0 w-full">
      {/* The design */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          {view === "solid" ? (
            <Model
              spec={spec}
              hideFronts={hideFronts}
              hideCountertop={spec.furnitureType === "kitchen" && !showCountertop}
              selectedCabinetId={selectedId}
              onSelectCabinet={setSelectedId}
              onResize={(id, change) => {
                // A negative width means the *left* edge was pulled: the
                // cabinet grows to the left, so it also has to move left by
                // what it gained, or the edge somebody is holding runs away
                // from the pointer.
                if (change.axis === "width") {
                  const target = spec.cabinets.find((cabinet) => cabinet.id === id);
                  if (!target) return;

                  if (change.value >= 0) {
                    onChange(resizeCabinet(spec, id, { width: change.value }));
                    return;
                  }

                  const width = Math.abs(change.value);
                  const right = target.position.x + target.size.width;
                  onChange(
                    moveCabinet(
                      resizeCabinet(spec, id, { width }),
                      id,
                      { x: right - width },
                      // Deliberately no reflow: this move exists only to keep
                      // the right edge under the pointer while the left one is
                      // pulled. Repacking the row would undo it on every frame.
                      { reflow: false },
                    ),
                  );
                  return;
                }

                if (change.axis === "height") {
                  onChange(resizeCabinet(spec, id, { height: change.value }));
                  return;
                }
                if (change.axis === "depth") {
                  onChange(resizeCabinet(spec, id, { depth: change.value }));
                  return;
                }
                // Reflowing on release rather than on every frame would let a
                // cabinet sit inside its neighbour mid-drag; reflowing as it
                // goes makes dragging one past another swap the two, which is
                // what somebody dragging it past another meant.
                onChange(moveCabinet(spec, id, { x: change.value }));
              }}
            />
          ) : (
            <div className="h-full w-full p-4">
              <Elevation
                spec={spec}
                selectedCabinetId={selectedId}
                onSelectCabinet={setSelectedId}
              />
            </div>
          )}
        </div>

        {/* Top left: how it is drawn. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <div className="pointer-events-auto flex gap-1 rounded-lg border border-white/10 bg-background/70 p-0.5 backdrop-blur-xl">
            <ViewTab
              active={view === "solid"}
              onClick={() => setView("solid")}
              icon={Box}
              label="3D"
            />
            <ViewTab
              active={view === "flat"}
              onClick={() => setView("flat")}
              icon={Ruler}
              label="Elevation"
            />
          </div>

          {view === "solid" ? (
            <label className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-background/70 px-2 py-1.5 text-[11px] backdrop-blur-xl">
              <input
                type="checkbox"
                checked={hideFronts}
                onChange={(event) => setHideFronts(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              Show inside
            </label>
          ) : null}
          {view === "solid" && spec.furnitureType === "kitchen" ? <label className="pointer-events-auto flex items-center gap-1.5 rounded-lg border bg-background/80 px-2 py-1.5 text-[11px]">
            <input type="checkbox" checked={showCountertop} onChange={(event) => setShowCountertop(event.target.checked)} />Show countertop
          </label> : null}
        </div>

        {/* Bottom left: what is selected, and how big everything is. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-2">
          <div className="rounded-lg border border-white/10 bg-background/70 px-2.5 py-1.5 text-[11px] backdrop-blur-xl">
            {selected ? (
              <>
                <span className="font-medium">{selected.label}</span>
                <span className="ml-2 tabular-nums text-muted-foreground">
                  W {Math.round(selected.size.width)} · H{" "}
                  {Math.round(selected.size.height)} · D{" "}
                  {Math.round(selected.size.depth)} mm
                </span>
              </>
            ) : (
              <span className="tabular-nums text-muted-foreground">
                {spec.cabinets.length}{" "}
                {spec.cabinets.length === 1 ? "cabinet" : "cabinets"} · W{" "}
                {spec.envelope.width} × H {spec.envelope.height} × D{" "}
                {spec.envelope.depth} mm
              </span>
            )}
          </div>

          {/* The phone's way in to the controls. */}
          <button
            type="button"
            onClick={openPanel}
            className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-background/80 px-3 py-2 text-xs font-medium backdrop-blur-xl @3xl/ws:hidden"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Edit
          </button>
        </div>
      </div>

      {/* The panel: a column on a wide screen, a sheet on a phone. */}
      <div className="hidden w-[300px] shrink-0 @3xl/ws:block @6xl/ws:w-[340px]">
        <ControlPanel
          spec={spec}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={onChange}
        />
      </div>

      {panelOpen ? (
        <div className="absolute inset-0 z-20 flex flex-col justify-end @3xl/ws:hidden">
          <button
            type="button"
            aria-label="Close the controls"
            onClick={() => setPanelOpen(false)}
            className="min-h-0 flex-1 bg-black/40"
          />
          {/*
            A flex column, and no viewport units anywhere in it.

            The scrolling half used to be `max-h-[60vh]` inside a sheet capped
            at 70% of the editor. Those two measure different things: the sheet
            is a share of the editor, which is the viewport *minus* the topbar,
            the tab strip and the phone's bottom bar, while 60vh is a share of
            the whole screen. On a short phone 60vh is taller than the space the
            sheet actually has, so the parent's `overflow-hidden` cropped the
            list instead of the child scrolling it — and the last few controls
            could not be reached by any gesture.

            `min-h-0 flex-1` asks for no number at all. The header takes what it
            needs, the list takes the rest of whatever the sheet turned out to
            be, and scrolls inside it.

            The height is now a share the person sets by dragging, rather than a
            fixed 70%: the design was a strip above a sheet that covered most of
            the screen, and the thing they came to look at is the design.
          */}
          <div
            ref={sheetRef}
            style={{ height: `${height * 100}%` }}
            className={cn(
              "flex flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-background/80 backdrop-blur-xl",
              dragging ? "" : "transition-[height] duration-200 ease-out",
            )}
          >
            {/*
              The handle. A button as well as a drag target, because a drag is
              not available to somebody using a keyboard or a screen reader and
              cycling the three heights is.
            */}
            <button
              type="button"
              aria-label={`Sheet height: ${describe(height)}. Activate for the next size.`}
              onClick={() => setHeight(nextSnap(height))}
              onPointerDown={beginDrag}
              className="flex shrink-0 cursor-grab touch-none items-center justify-center py-2 active:cursor-grabbing"
            >
              <span
                aria-hidden
                className="h-1 w-10 rounded-full bg-foreground/25"
              />
            </button>

            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 pb-2">
              <span className="text-xs font-medium uppercase tracking-wide">
                Edit
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPanelOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            <div
              ref={listRef}
              onPointerDown={beginDrag}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              <ControlPanel
                spec={spec}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChange={onChange}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Box;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-background shadow-sm" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

/** The next height a tap on the handle moves to, wrapping at the top. */
function nextSnap(height: number): number {
  const index = SNAPS.findIndex((snap) => Math.abs(snap - height) < 0.01);
  return SNAPS[(index + 1) % SNAPS.length] ?? DEFAULT_SNAP;
}

/** What the handle's label calls the height it is at. */
function describe(height: number): string {
  const index = SNAPS.findIndex((snap) => Math.abs(snap - height) < 0.01);
  return ["small", "medium", "large"][index] ?? "custom";
}

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Building the model…
    </div>
  );
}
