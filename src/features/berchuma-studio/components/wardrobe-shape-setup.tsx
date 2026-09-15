"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { LengthField } from "./ui/length-field";
import {
  wardrobeShapeDesign,
  wardrobeWalls,
  type WardrobeShape,
} from "../services/starting-designs";
import type { DesignSpec } from "../types/spec";

/**
 * Which shape the wardrobe is, and the walls it runs along.
 *
 * A wardrobe that turns a corner is not two wardrobes. The runs share a
 * `depth × depth` square and something has to own it, so what this collects is
 * *wall* lengths — the thing somebody measures — and the carcasses are derived
 * from them by `wardrobeShapeDesign`, which subtracts each corner once.
 * Collecting carcass widths instead would make the corner the reader's
 * arithmetic to get right, and it is the arithmetic everyone gets wrong.
 *
 * The walls come from `wardrobeWalls`, so the order the form asks in is the
 * order the solver reads. A U's runs are left, back, right and the solver
 * anchors each from that; asking in a different order would build a U with its
 * back wall down one side and nothing on screen would say why.
 *
 * Modelled on `KitchenSetup`, which does the same job for a kitchen. Kept
 * separate rather than generalised: a kitchen asks about a room and a worktop
 * and appliances, and a wardrobe asks about three walls.
 */

/**
 * The shapes on offer.
 *
 * U is deliberately absent, and `wardrobeShapeDesign` builds one perfectly
 * well — its runs, its two corners and its cut list are all correct and are
 * checked in `wardrobe_shape_check.ts`. What is wrong is where one leaf ends
 * up: a U's left corner parks its return door in the same 18 × 592 × 2298 mm
 * of space as the adjacent run's gable, so the door renders through the board.
 * The overlap test found it, the same corner code serves U-shaped kitchens,
 * and it predates this work.
 *
 * A manufacturing tool should not offer a shape it knows draws two boards in
 * one place, so the entry waits here until the corner leaf is turned to face
 * its own run. Adding the line back is the whole of enabling it.
 */
const SHAPES: { value: WardrobeShape; label: string; path: string }[] = [
  { value: "straight", label: "Straight", path: "M12 12H68" },
  { value: "l_shaped", label: "L shape", path: "M12 12H68V48" },
];

/** What each shape starts at, in millimetres, in `wardrobeWalls` order. */
const DEFAULTS: Record<WardrobeShape, number[]> = {
  straight: [2400],
  l_shaped: [2400, 1800],
  u_shaped: [1800, 3000, 1800],
};

export function WardrobeShapeSetup({
  initialWidth,
  onStart,
}: {
  initialWidth?: number;
  onStart: (spec: DesignSpec) => void;
}) {
  const [shape, setShape] = useState<WardrobeShape>("straight");
  const [walls, setWalls] = useState<Record<WardrobeShape, number[]>>(() => ({
    ...DEFAULTS,
    straight: [initialWidth ?? DEFAULTS.straight[0]!],
  }));
  const [depth, setDepth] = useState(600);
  const [height, setHeight] = useState(2400);

  const named = wardrobeWalls(shape);
  const lengths = walls[shape];

  const setWall = (index: number, value: number) =>
    setWalls((previous) => ({
      ...previous,
      [shape]: previous[shape].map((length, at) => (at === index ? value : length)),
    }));

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <span className="text-sm font-medium">Wardrobe shape</span>

      <div className="flex flex-wrap gap-2">
        {SHAPES.map((entry) => (
          <button
            key={entry.value}
            type="button"
            aria-pressed={shape === entry.value}
            onClick={() => setShape(entry.value)}
            className={cn(
              "flex flex-1 basis-24 flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors",
              shape === entry.value
                ? "border-brand bg-brand/5 text-foreground"
                : "text-muted-foreground hover:border-brand",
            )}
          >
            {/* The shape in plan, which is the view it is obvious in. */}
            <svg viewBox="0 0 80 60" className="h-8 w-16" aria-hidden>
              <path
                d={entry.path}
                fill="none"
                stroke="currentColor"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {entry.label}
          </button>
        ))}
      </div>

      {/*
        One field per wall, named by the wall rather than by the carcass. The
        corner is taken off these before any bay is laid out, so what is typed
        here is what a tape measure reads along the wall.
      */}
      <div className="space-y-2">
        {named.map((wall, index) => (
          <LengthField
            key={wall.id}
            label={wall.label}
            value={lengths[index] ?? 2400}
            min={600}
            max={6000}
            step={100}
            onChange={(value) => setWall(index, value)}
          />
        ))}

        <LengthField
          label="Depth"
          value={depth}
          min={300}
          max={900}
          step={50}
          onChange={setDepth}
          hint={
            shape === "straight"
              ? undefined
              : "Each corner takes a square of this size out of both walls it joins."
          }
        />
        <LengthField
          label="Height"
          value={height}
          min={1200}
          max={2700}
          step={100}
          onChange={setHeight}
        />
      </div>

      <button
        type="button"
        onClick={() =>
          onStart(wardrobeShapeDesign({ shape, walls: lengths, depth, height }))
        }
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 pr-actions-safe text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
      >
        <Sparkles className="size-4" aria-hidden />
        Start with a {SHAPES.find((entry) => entry.value === shape)!.label.toLowerCase()} wardrobe
      </button>
    </div>
  );
}
