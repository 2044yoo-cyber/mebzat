"use client";

import { useState } from "react";
import {
  ImageUp,
  MessageSquare,
  PanelsTopLeft,
  Ruler,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { CabinetStart } from "./cabinet-start";
import { ImageToDesign } from "./image-to-design";
import { OpeningPanel } from "./openings/opening-panel";
import { PlanEditor } from "./plan/plan-editor";
import { runsFromRoom } from "../services/room-geometry";
import { startingDesign } from "../services/starting-designs";
import { validateSpec, type DesignKind, type DesignSpec } from "../types/spec";

/**
 * Where a design starts.
 *
 * The studio used to open empty and wait to be told what to build, which is
 * backwards for the person it is for. Somebody who wants a kitchen does not
 * want to specify one — they want to look at one and say "not that cupboard, a
 * drawer". So the first screen offers a category and hands back a finished
 * design to argue with.
 *
 * The design appears instantly and identically every time, because it is
 * ordinary arithmetic rather than a model call. That also means this works
 * with no AI provider configured at all, which is the difference between a
 * studio and a demonstration of one.
 */

export function StartPanel({
  onStart,
  onOpenChat,
  initialKind,
  initialWidth,
}: {
  onStart: (spec: DesignSpec) => void;
  onOpenChat: () => void;
  initialKind?: DesignKind;
  initialWidth?: number;
}) {
  const [route, setRoute] = useState<"design" | "photo" | "opening" | "plan">("design");

  return (
    /**
     * Two elements, and the outer one is the only thing that scrolls.
     *
     * This used to be one `h-full ... justify-center` column with no overflow
     * rule at all. On a desktop the seven categories and the size inputs fit,
     * so it looked right. On a 390px phone they do not, and a flex column that
     * centres what it cannot contain spills it off *both* ends — the last size
     * control and the start button below the fold, the heading above it, and
     * no scrollbar either way because nothing had been told it could scroll.
     * The bottom navigation was sitting on top of the symptom rather than
     * causing it; adding padding would have moved unreachable content a little
     * further up and left it unreachable.
     *
     * `min-h-full` on the inner column is what keeps the centring honest: at
     * least as tall as the viewport, so a short panel still centres, and taller
     * than it when the content demands, so it grows downward and scrolls from
     * the top instead of hiding its own beginning.
     */
    <div
      className={cn(
        "mx-auto w-full max-w-2xl",
        // Its own scrolling column beside the design, an ordinary block under
        // it — the same rule as the control panel, and missed here.
        //
        // When the studio's design tab became a scrolling page, this panel was
        // left as `h-full overflow-y-auto`. In a column that is no longer a
        // fixed height that is a second scroll container inside the first: the
        // panel clips its own content at whatever height it resolved to, the
        // page has nothing left to scroll, and the last card sits below the
        // fold with no gesture that reaches it. Which is the fault the panel's
        // own scroller was added to fix, arriving from the other direction.
        "@4xl/ws:h-full @4xl/ws:overflow-y-auto @4xl/ws:overscroll-contain",
      )}
    >
      <div
        className={cn(
          "flex min-h-full w-full flex-col gap-5 p-4",
          // Room at the end of the scroll for the two things that float over
          // it. The panel's box already stops above the navigation bar, but
          // the AI launcher and the + button sit *inside* that box in the
          // bottom-right corner, and this column ends in a full-width "Start
          // with a…" button — so the last control was reachable by scrolling
          // and not by tapping, which is a worse failure than not reaching it
          // at all.
          //
          // That used to be solved by reserving the buttons' *height* here,
          // which cost about 4cm of a phone screen to avoid 88px of corner and
          // left a visible band of nothing under the panel. The button steps
          // around them instead — see `pr-actions-safe` on it below.
          "pb-8",
          // A cut list is taller than the panel and scrolls inside itself, so
          // centring it vertically pushes its heading off the top. Only the
          // centring is conditional now: `min-h-0` used to be the other half
          // of this and would sit in the class list beside `min-h-full`, where
          // which one wins is decided by stylesheet order rather than by the
          // order they are written here.
          route === "opening" || route === "plan" ? null : "justify-center",
        )}
      >
      {route === "opening" || route === "plan" ? null : (
        <div className="text-center">
          <h1 className="text-xl font-semibold">What cabinet are you designing?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a type and a template and a complete design appears, sized to
            your space. Change anything in it afterwards — nothing is fixed.
          </p>
        </div>
      )}

      {/* Four ways in. The first two produce a design — starting from a
          photograph is not a separate feature with its own dead end. The third
          produces an opening instead: a window is not a cabinet, it is cut from
          bars rather than sheets, and pretending otherwise is how the frame
          engine ended up with no way in at all. The fourth starts from the room
          rather than the furniture, which is the order somebody with a floor
          plan in their hand already has it in. */}
      <div
        role="tablist"
        aria-label="How to start"
        className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={route === "design"}
          onClick={() => setRoute("design")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium",
            route === "design" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Start with a design
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={route === "photo"}
          onClick={() => setRoute("photo")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium",
            route === "photo" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <ImageUp className="size-3.5" aria-hidden />
          Upload a photo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={route === "opening"}
          onClick={() => setRoute("opening")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium",
            route === "opening" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <PanelsTopLeft className="size-3.5" aria-hidden />
          Window or door
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={route === "plan"}
          onClick={() => setRoute("plan")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium",
            route === "plan" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <Ruler className="size-3.5" aria-hidden />
          From a floor plan
        </button>
      </div>

      {route === "plan" ? (
        <div className="min-h-0 flex-1">
          <PlanEditor
            onDone={(room) => {
              // The room's chosen walls become the runs, and from there the
              // design is an ordinary Berchuma design: the layout solver
              // places the cabinets, buildParts costs them, and the cut list
              // and price follow. Nothing downstream knows a plan was drawn.
              const runs = runsFromRoom(room, { depth: 600, height: 2400 });
              const base = startingDesign("kitchen", {
                width: runs[0]?.length ?? 3600,
              });

              // Re-validated, because the runs came from a drawing rather than
              // from the generator: validateSpec is what repairs a cabinet the
              // new wall lengths no longer fit, and it is the same check every
              // other route here goes through.
              onStart(
                validateSpec({
                  ...base,
                  room,
                  runs: runs.length > 0 ? runs : base.runs,
                  layout: runs.length >= 3 ? "u_shaped" : runs.length === 2 ? "l_shaped" : "straight",
                }).spec,
              );
            }}
          />
        </div>
      ) : route === "opening" ? (
        <OpeningPanel />
      ) : route === "photo" ? (
        <ImageToDesign compact onDesign={(spec) => onStart(spec)} />
      ) : (
        // Cabinet Design's own way in: type, space, layout, template,
        // material. Every card in it is a real design laid out to the space.
        <CabinetStart onStart={onStart} initialKind={initialKind} initialWidth={initialWidth} />
      )}

      <button
        type="button"
        onClick={onOpenChat}
        className="flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <MessageSquare className="size-4" aria-hidden />
        Or describe it in your own words
      </button>
      </div>
    </div>
  );
}
