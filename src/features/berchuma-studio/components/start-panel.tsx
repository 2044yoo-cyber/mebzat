"use client";

import { useState } from "react";
import {
  Armchair,
  Boxes,
  ChefHat,
  Droplets,
  ImageUp,
  Library,
  MessageSquare,
  Monitor,
  PanelsTopLeft,
  Shapes,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { ImageToDesign } from "./image-to-design";
import { OpeningPanel } from "./openings/opening-panel";
import { startingDesign } from "../services/starting-designs";
import type { DesignKind, DesignSpec } from "../types/spec";

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

const CATEGORIES: {
  kind: DesignKind;
  label: string;
  icon: typeof ChefHat;
  hint: string;
}[] = [
  { kind: "kitchen", label: "Kitchen", icon: ChefHat, hint: "Base run, wall units, worktop" },
  { kind: "wardrobe", label: "Wardrobe", icon: Armchair, hint: "Hanging, drawers, shelves" },
  { kind: "tv_unit", label: "TV Unit", icon: Monitor, hint: "Low unit and a wall shelf" },
  { kind: "vanity", label: "Vanity", icon: Droplets, hint: "Wall hung, with a mirror cabinet" },
  { kind: "bookshelf", label: "Bookshelf", icon: Library, hint: "Open shelving, floor to eye" },
  { kind: "office_storage", label: "Office Storage", icon: Boxes, hint: "Cupboards under open filing" },
  { kind: "custom", label: "Custom", icon: Shapes, hint: "One cabinet. Change everything" },
];

/** Run lengths people actually ask for, so nobody types a number to begin. */
const SIZES = [1800, 2400, 3000, 3600, 4200, 5000];

export function StartPanel({
  onStart,
  onOpenChat,
}: {
  onStart: (spec: DesignSpec) => void;
  onOpenChat: () => void;
}) {
  const [kind, setKind] = useState<DesignKind | null>(null);
  const [width, setWidth] = useState(3600);
  const [route, setRoute] = useState<"design" | "photo" | "opening">("design");

  const chosen = CATEGORIES.find((entry) => entry.kind === kind);

  return (
    <div
      className={cn(
        "mx-auto flex h-full w-full max-w-2xl flex-col gap-5 p-4",
        // A cut list is taller than the panel and scrolls inside itself.
        // Centring it vertically pushes its heading off the top.
        route === "opening" ? "min-h-0" : "justify-center",
      )}
    >
      {route === "opening" ? null : (
        <div className="text-center">
          <h1 className="text-xl font-semibold">What are you making?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick one and a complete design appears. Change anything in it
            afterwards — nothing here is fixed.
          </p>
        </div>
      )}

      {/* Three ways in. The first two produce a design — starting from a
          photograph is not a separate feature with its own dead end. The third
          produces an opening instead: a window is not a cabinet, it is cut from
          bars rather than sheets, and pretending otherwise is how the frame
          engine ended up with no way in at all. */}
      <div
        role="tablist"
        aria-label="How to start"
        className="mx-auto grid w-full max-w-md grid-cols-3 gap-1 rounded-lg bg-muted p-1"
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
      </div>

      {route === "opening" ? (
        <OpeningPanel />
      ) : route === "photo" ? (
        <ImageToDesign compact onDesign={(spec) => onStart(spec)} />
      ) : (
      <>
      <div className="grid grid-cols-2 gap-2 @lg/ws:grid-cols-3">
        {CATEGORIES.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            aria-pressed={kind === entry.kind}
            onClick={() => {
              setKind(entry.kind);
              // A wardrobe is not 3600 wide and a vanity is not 3600 wide. The
              // slider starts wherever that category usually starts.
              setWidth(defaultWidth(entry.kind));
            }}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              kind === entry.kind
                ? "border-brand bg-brand/5"
                : "hover:border-brand/50 hover:bg-muted/40",
            )}
          >
            <entry.icon className="size-5 text-brand" aria-hidden />
            <span className="mt-1.5 block text-sm font-medium">{entry.label}</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">
              {entry.hint}
            </span>
          </button>
        ))}
      </div>

      {chosen ? (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">
              How wide is the {chosen.kind === "kitchen" ? "run" : "space"}?
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {width} mm
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={width === size}
                onClick={() => setWidth(size)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors",
                  width === size
                    ? "border-brand bg-brand text-brand-foreground"
                    : "hover:border-brand hover:bg-brand/5",
                )}
              >
                {size}
              </button>
            ))}
          </div>

          <input
            type="range"
            min={600}
            max={6000}
            step={100}
            value={width}
            aria-label="Width in millimetres"
            onChange={(event) => setWidth(Number(event.target.value))}
            className="w-full accent-brand"
          />

          <button
            type="button"
            onClick={() => onStart(startingDesign(chosen.kind, { width }))}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            <Sparkles className="size-4" aria-hidden />
            Start with a {chosen.label.toLowerCase()}
          </button>
        </div>
      ) : null}
      </>
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
  );
}

function defaultWidth(kind: DesignKind): number {
  switch (kind) {
    case "kitchen":
      return 3600;
    case "wardrobe":
      return 2400;
    case "tv_unit":
    case "bookshelf":
    case "shelving":
      return 1800;
    case "vanity":
      return 1200;
    case "office_storage":
      return 2000;
    default:
      return 1200;
  }
}
