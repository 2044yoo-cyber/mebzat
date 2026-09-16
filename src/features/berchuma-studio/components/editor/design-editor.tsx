"use client";

import dynamic from "next/dynamic";
import { Fragment, useEffect, useState, type CSSProperties } from "react";
import {
  Box,
  ChevronDown,
  Loader2,
  Grid2x2,
  Minus,
  Plus,
  Ruler,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { ControlPanel } from "./control-panel";
import { useViewportHeight } from "../../hooks/use-viewport-height";
import {
  AXES,
  NUDGE_STEP,
  type Axis,
  type Direction,
  nudgeBlocked,
  nudgeStep,
  nudgeTo,
  readShortcut,
  typingInto,
} from "../../services/nudge";
import {
  duplicateCabinet,
  moveCabinet,
  removeCabinet,
  resizeCabinet,
} from "../../services/operations";
import { Elevation } from "../viewer/elevation";
import { Plan } from "../viewer/plan";
import type { DesignSpec } from "../../types/spec";

/**
 * The design, large, with the controls beside it or under it.
 *
 * The model occupies the screen because the thing somebody came here to look at
 * is the furniture. On a wide workspace the panel is a column on the right. On
 * a phone it is a block underneath, and the drawing sticks to the top of the
 * page while you scroll through it.
 *
 * ## Why the phone layout is the shape it is
 *
 * It was a fixed-height column with the controls coming up over the drawing as
 * a sheet. That made editing and watching two states of one screen: the sheet
 * covered the model, and pushing it down to see what a change had done put the
 * controls away. It also meant three scrolling regions inside one screen — the
 * page, the sheet, the panel in it — and a finger starting in the wrong one
 * went nowhere.
 *
 * Now the whole studio is an ordinary scrolling page. The tabs, the title and
 * the save buttons scroll off the top like anything else, the viewport sticks
 * where they were, and the controls scroll underneath it. One scrolling region,
 * and the model is on screen the whole time you are editing.
 *
 * `position: sticky` and not a fixed height is what makes that true: sticky
 * needs a scrolling ancestor and a parent taller than itself, and it has both —
 * the app shell's workspace column scrolls, and the controls below give the
 * drawing something to travel over.
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

type View = "solid" | "flat" | "plan";

export function DesignEditor({
  spec,
  onChange,
  onUndo,
  canUndo = false,
  headerHidden = false,
  onShowHeader,
}: {
  spec: DesignSpec;
  onChange: (next: DesignSpec) => void;
  /** Absent where there is no history to offer — the public read-only view. */
  onUndo?: () => void;
  canUndo?: boolean;
  /** True while the studio's title row is folded away. */
  headerHidden?: boolean;
  /** Unfolds it. The only way back, so it is never conditional on anything. */
  onShowHeader?: () => void;
}) {
  const [view, setView] = useState<View>("solid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hideFronts, setHideFronts] = useState(false);
  const [showCountertop, setShowCountertop] = useState(false);

  // ---- how tall the drawing is on a phone ---------------------------------
  //
  // Measured from the column this is actually scrolling in, and from the
  // navigation bar that covers the bottom of it, rather than computed from
  // `100dvh` and a guess at the chrome. Every previous attempt at that
  // arithmetic in this codebase was wrong by enough to put a control under the
  // fold. Unused on a wide workspace, where the drawing is simply the height of
  // the row — the class that sets it is overridden at `@4xl/ws`.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const viewportHeight = useViewportHeight(root);

  const selected =
    spec.cabinets.find((cabinet) => cabinet.id === selectedId) ?? null;

  /**
   * One step along an axis, from a button or from a key.
   *
   * Refuses the same steps the buttons refuse. A key has no disabled state to
   * show, so without this a held PageDown on a cabinet whose depth the run
   * decides would fill the undo history with changes that changed nothing.
   */
  function nudge(axis: Axis, direction: Direction, step: number = NUDGE_STEP) {
    if (!selected) return false;
    if (nudgeBlocked(selected, axis, direction, step)) return false;
    onChange(moveCabinet(spec, selected.id, nudgeTo(selected, axis, direction, step)));
    return true;
  }

  /**
   * The keyboard, on a desktop.
   *
   * Bound to the window rather than to a focusable wrapper, because the thing
   * these act on is the *selection*, and the selection is made by clicking the
   * model — a WebGL canvas that does not take focus. Requiring a Tab into some
   * container first would mean the shortcuts did nothing at the moment somebody
   * most expects them to work, which is right after they clicked a cabinet.
   *
   * `typingInto` is what keeps that from being rude: any field that wants a key
   * gets it, so Backspace in a name deletes a letter and not the cabinet.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (typingInto(event.target as HTMLElement | null)) return;

      const shortcut = readShortcut(event);
      if (!shortcut) return;

      // Undo is the one that works with nothing selected: the change being
      // taken back need not have been made to the selected cabinet, or to a
      // cabinet at all.
      if (shortcut.kind === "undo") {
        if (!onUndo || !canUndo) return;
        event.preventDefault();
        onUndo();
        return;
      }

      if (!selected) return;
      event.preventDefault();

      switch (shortcut.kind) {
        case "move":
          nudge(shortcut.axis, shortcut.direction, nudgeStep(event));
          return;
        case "delete":
          // The selection is dropped first: leaving it pointing at a cabinet
          // that no longer exists leaves the panel showing controls for
          // nothing.
          setSelectedId(null);
          onChange(removeCabinet(spec, selected.id));
          return;
        case "duplicate":
          onChange(duplicateCabinet(spec, selected.id));
          return;
        case "deselect":
          setSelectedId(null);
          return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Deliberately no dependency array. The handler reads the spec, the
    // selection and whether there is anything to undo, and all three change
    // often; two of the things it calls are arrow functions the parent makes
    // fresh every render, so a dependency list would re-run every render
    // anyway. Swapping one window listener is cheaper than the render that
    // preceded it.
  });

  return (
    <div
      ref={setRoot}
      // A phone reads this as an ordinary block in the page's flow, as tall as
      // the drawing plus the controls under it, so the page scrolls it. A wide
      // workspace reads the `@4xl/ws` half and gets the row it always had.
      className="w-full @4xl/ws:flex @4xl/ws:h-full @4xl/ws:min-h-0"
    >
      {/*
        The design, stuck to the top of the page while the controls go past.

        `sticky` rather than `fixed`: fixed is relative to the window and would
        sit over the top bar and the tab strip, and would still be there on the
        next page's paint. Sticky travels with the page until it reaches the top
        of the scrolling column and then stays, which is exactly "the chrome
        scrolls away and the drawing does not".

        The height comes through a custom property rather than as a plain inline
        height, because an inline height wins over every stylesheet rule and
        there would be no way for `@4xl/ws:h-full` to take it back on a wide
        screen. As a variable, the desktop class simply overrides the utility
        that reads it. The fallback in the utility is what the first paint uses,
        before there is a measurement.
      */}
      <div
        style={
          viewportHeight > 0
            ? ({ "--studio-viewport": `${viewportHeight}px` } as CSSProperties)
            : undefined
        }
        className={cn(
          "sticky top-0 z-10 w-full bg-background",
          "h-[var(--studio-viewport,60dvh)]",
          "@4xl/ws:relative @4xl/ws:z-auto @4xl/ws:h-full @4xl/ws:min-h-0 @4xl/ws:w-auto @4xl/ws:flex-1",
        )}
      >
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
              {view === "plan" ? (
                <Plan
                  spec={spec}
                  selectedCabinetId={selectedId}
                  onSelectCabinet={setSelectedId}
                />
              ) : (
                <Elevation
                  spec={spec}
                  selectedCabinetId={selectedId}
                  onSelectCabinet={setSelectedId}
                />
              )}
            </div>
          )}
        </div>

        {/* Top left: how it is drawn. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <div className="pointer-events-auto flex items-center gap-1">
            <div className="flex gap-1 rounded-lg border border-white/10 bg-background/70 p-0.5 backdrop-blur-xl">
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
              {/*
                Only where there is a corner to look at. On a straight wardrobe
                the plan is one rectangle and says nothing the elevation does
                not, so it would be a third tab that is never the right answer.
              */}
              {spec.layout !== "straight" ? (
                <ViewTab
                  active={view === "plan"}
                  onClick={() => setView("plan")}
                  icon={Grid2x2}
                  label="Top"
                />
              ) : null}
            </div>

            {/*
              Undo, over the drawing rather than in the controls sheet.

              Because the edit somebody most wants to take back is a drag they
              did *here* — a cabinet pushed too far, a handle pulled the wrong
              way — and the sheet is shut while they are doing it.

              Disabled rather than hidden when there is nothing to undo, so the
              button does not appear and disappear under the thumb that is
              reaching for it.
            */}
            {/*
              The way back to the folded header.

              In this row rather than where the header was, because where the
              header was is now the drawing — and a control that appears in the
              middle of a picture is a control nobody finds. This row is where
              every other thing that acts on the view already lives.
            */}
            {headerHidden && onShowHeader ? (
              <button
                type="button"
                onClick={onShowHeader}
                aria-label="Show the title and the save buttons"
                title="Show the title and the save buttons"
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-background/70 backdrop-blur-xl"
              >
                <ChevronDown className="size-4" aria-hidden />
              </button>
            ) : null}

            {onUndo ? (
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label="Undo the last change"
                title="Undo the last change"
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-background/70 backdrop-blur-xl transition-opacity disabled:opacity-35"
              >
                <Undo2 className="size-4" aria-hidden />
              </button>
            ) : null}
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

        {/*
          Right edge: move the selected cabinet, one step at a time.

          Dragging is the only other way, and it is bad at exactly the job
          somebody reaches for this to do. A 10 mm shadow gap between two
          cabinets is not a distance a thumb can land on, and on a phone the
          drag competes with the orbit gesture — push a cabinet sideways and
          the camera swings as often as the cabinet moves.

          On the right rather than under the drawing: the bottom already has
          the selection read-out and the Edit button, and the sheet comes up
          over it. Vertically centred, so the pad is under the thumb of a hand
          holding the phone rather than at the top of a reach.
        */}
        {view === "solid" && selected ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center p-2">
            {/*
              No panel behind the buttons.

              This was a filled, blurred card, and on a light theme that is an
              opaque white slab over the right-hand third of the drawing —
              covering the very cabinet the buttons move. The controls have to
              be on top of the model to be under the thumb, so the answer is
              not to move them but to stop them being a surface: the container
              only arranges the buttons now, and each button is translucent
              enough to see the carcass through and solid enough to aim at.
            */}
            <div className="pointer-events-auto flex flex-col gap-1 p-1">
              {AXES.map(({ axis, label, towards }) => (
                <div key={axis} className="flex items-center gap-0.5">
                  {([-1, 1] as Direction[]).map((direction) => {
                    const blocked = nudgeBlocked(selected, axis, direction);
                    const towardsLabel =
                      towards[direction === -1 ? 0 : 1];
                    return (
                      <Fragment key={direction}>
                        {direction === 1 ? (
                          <span
                            aria-hidden
                            // Its own small backing, because the letter sits
                            // over the drawing now rather than over a card,
                            // and a grey glyph on a grey carcass is nothing.
                            className="w-4 rounded bg-background/45 py-0.5 text-center text-[10px] font-medium text-foreground/80 backdrop-blur-[2px]"
                          >
                            {label}
                          </span>
                        ) : null}
                        <NudgeButton
                          // The reason, not just a dimmed button. A control
                          // that refuses and will not say why is the thing
                          // this whole change is about.
                          label={
                            blocked ?? `Move ${selected.label} ${towardsLabel}`
                          }
                          disabled={blocked !== null}
                          onClick={() => nudge(axis, direction)}
                        >
                          {direction === -1 ? (
                            <Minus className="size-3" aria-hidden />
                          ) : (
                            <Plus className="size-3" aria-hidden />
                          )}
                        </NudgeButton>
                      </Fragment>
                    );
                  })}
                </div>
              ))}
              <span className="mx-auto rounded bg-background/45 px-1 text-center text-[9px] tabular-nums text-foreground/70 backdrop-blur-[2px]">
                {NUDGE_STEP} mm
              </span>
            </div>
          </div>
        ) : null}

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

        </div>
      </div>

      {/*
        The controls: beside the drawing on a wide workspace, under it on a
        phone.

        One instance, not two. There used to be a column for the wide case and
        a second copy inside the sheet for the narrow one, which is two of
        everything to keep in step and two React trees holding the same
        selection.

        Underneath rather than over: this is the half of the change that makes
        editing and watching the same activity. The drawing above is sticky, so
        scrolling through these moves them past a model that stays where it is
        and updates as they are used.
      */}
      <div
        className={cn(
          "w-full border-t",
          "@4xl/ws:h-full @4xl/ws:min-h-0 @4xl/ws:w-[300px] @4xl/ws:shrink-0",
          "@4xl/ws:border-t-0 @6xl/ws:w-[340px]",
        )}
      >
        <ControlPanel
          spec={spec}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

/** One half of an axis pair. Dimmed rather than hidden at the end of its range. */
function NudgeButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-md",
        // Translucent enough to see the cabinet through, opaque enough to aim
        // at. The blur is small on purpose: `backdrop-blur-xl` at this size
        // reads as frosted glass, which is another way of saying opaque.
        "border border-foreground/15 bg-background/40 backdrop-blur-[2px]",
        // It firms up under the finger, so a press still reads as a press
        // even though the resting state is mostly the drawing behind it.
        "transition-colors active:bg-background/85",
        "disabled:opacity-25",
      )}
    >
      {children}
    </button>
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

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Building the model…
    </div>
  );
}
