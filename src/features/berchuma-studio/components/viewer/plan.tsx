"use client";

import { cn } from "@/lib/utils";

import { resolveDesign } from "../../services/resolve";
import { transformPlanPoint } from "../../services/part-transform";
import type { DesignSpec } from "../../types/spec";

/**
 * The design from above.
 *
 * An elevation is the right drawing for a straight wardrobe and the wrong one
 * for a wardrobe that turns a corner: two runs at a right angle project onto
 * one another, so the leg coming towards you is a sliver the width of its
 * depth and the corner is not visible at all. The plan is where an L is an L.
 *
 * It is also the view for editing one on a phone. "Wall A is 2400" is a fact
 * about the room, and this is the only drawing where you can see which wall is
 * A, how much of it the corner takes, and what is left for carcasses.
 *
 * ## Everything here is derived
 *
 * Nothing below positions anything. `resolveDesign` has already solved the
 * layout — where each run sits, which way it faces, how much of it a corner
 * eats — and `transformPlanPoint` is the same function the geometry uses to
 * put a part in the room. Drawing from those rather than from the wall lengths
 * is what stops the plan and the model disagreeing about where a corner is:
 * a second rotation convention here would be a drawing of a different wardrobe.
 */

/** Millimetres of paper around the furniture, for the dimension lines. */
const MARGIN = 520;

type Corner = { x: number; z: number };

/** The four corners of a run or a carcass, rotated into the room. */
function footprint(
  origin: Corner,
  rotation: number,
  length: number,
  depth: number,
): Corner[] {
  return [
    { x: 0, z: 0 },
    { x: length, z: 0 },
    { x: length, z: depth },
    { x: 0, z: depth },
  ].map((local) => transformPlanPoint(origin, rotation, local));
}

const points = (corners: Corner[]) =>
  corners.map((corner) => `${corner.x},${corner.z}`).join(" ");

const centre = (corners: Corner[]) => ({
  x: corners.reduce((total, corner) => total + corner.x, 0) / corners.length,
  z: corners.reduce((total, corner) => total + corner.z, 0) / corners.length,
});

export function Plan({
  spec,
  selectedCabinetId,
  onSelectCabinet,
}: {
  spec: DesignSpec;
  selectedCabinetId?: string | null;
  onSelectCabinet?: (id: string | null) => void;
}) {
  const resolved = resolveDesign(spec);
  const { placements, corners, extent } = resolved.layout;

  return (
    <svg
      viewBox={`${-MARGIN} ${-MARGIN} ${extent.width + MARGIN * 2} ${extent.depth + MARGIN * 2}`}
      className="h-full w-full"
      role="img"
      aria-label={`Plan of ${spec.title}, ${Math.round(extent.width)} by ${Math.round(extent.depth)} millimetres on the floor`}
    >
      {/*
        Each run, at the length that is left after its corners.

        `usableLength`, not `wallLength`: the gap between the two is the corner,
        and showing it is the single most useful thing this drawing does. It is
        the number people are surprised by.
      */}
      {placements.map((run) => {
        const shape = footprint(
          run.origin,
          run.rotation,
          run.usableLength,
          run.depth,
        );

        // Beside the run rather than in it. Inside, the run's name landed on
        // the carcass width in the middle of the same rectangle and the two
        // were unreadable on top of each other — which reading the geometry
        // cannot show you and a picture of the drawing can.
        //
        // Which side is chosen by whichever is further from the middle of the
        // footprint, so every label ends up on the outside. Offsetting to a
        // fixed side of the run instead put a U's left wall inside the opening
        // and its right wall outside, and asymmetry in a drawing reads as a
        // fault whether or not it is one.
        const sides = [-190, run.depth + 190].map((z) =>
          transformPlanPoint(run.origin, run.rotation, {
            x: run.usableLength / 2,
            z,
          }),
        );
        const away = (point: Corner) =>
          Math.hypot(point.x - extent.width / 2, point.z - extent.depth / 2);
        const label = away(sides[0]!) > away(sides[1]!) ? sides[0]! : sides[1]!;

        return (
          <g key={`run-${run.runId}`}>
            <polygon
              points={points(shape)}
              className="fill-muted/40 stroke-foreground/30"
              strokeWidth={10}
            />
            <text
              x={label.x}
              y={label.z}
              textAnchor="middle"
              fontSize={100}
              className="fill-foreground/70"
              transform={`rotate(${run.rotation} ${label.x} ${label.z})`}
            >
              {run.label} · {Math.round(run.wallLength)} mm
            </text>
          </g>
        );
      })}

      {/*
        The corner squares, hatched so they read as a different thing.

        They are a module of their own — their own gables, top, bottom, back and
        front — and the reason each run is shorter than its wall. Drawn on top
        of the runs because they are what the runs stop for.
      */}
      <defs>
        <pattern
          id="plan-corner"
          width={80}
          height={80}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={80}
            className="stroke-brand/40"
            strokeWidth={22}
          />
        </pattern>
      </defs>

      {corners.map((corner) => (
        <g key={corner.id}>
          <rect
            x={corner.x}
            y={corner.z}
            width={corner.size}
            height={corner.size}
            fill="url(#plan-corner)"
            className="stroke-brand/60"
            strokeWidth={10}
          />
          <text
            x={corner.x + corner.size / 2}
            y={corner.z + corner.size / 2 + 30}
            textAnchor="middle"
            fontSize={88}
            className="fill-brand"
          >
            {Math.round(corner.size)}
          </text>
        </g>
      ))}

      {/*
        The carcasses, on top of their runs and selectable.

        The same selection the 3D view and the elevation use, so picking a
        cabinet here and switching view keeps it picked.
      */}
      {resolved.cabinets.map((placed) => {
        const shape = footprint(
          { x: placed.x, z: placed.z },
          placed.rotation,
          placed.cabinet.size.width,
          placed.cabinet.size.depth,
        );
        const middle = centre(shape);
        const selected = placed.cabinet.id === selectedCabinetId;

        return (
          <g key={placed.cabinet.id}>
            <polygon
              points={points(shape)}
              onClick={
                onSelectCabinet
                  ? () => onSelectCabinet(selected ? null : placed.cabinet.id)
                  : undefined
              }
              className={cn(
                "fill-background/80",
                selected ? "stroke-brand" : "stroke-foreground/45",
                onSelectCabinet ? "cursor-pointer" : "",
              )}
              strokeWidth={selected ? 22 : 12}
            />
            <text
              x={middle.x}
              y={middle.z - 20}
              textAnchor="middle"
              fontSize={96}
              className="fill-foreground"
            >
              {Math.round(placed.cabinet.size.width)}
            </text>
            <text
              x={middle.x}
              y={middle.z + 90}
              textAnchor="middle"
              fontSize={80}
              className="fill-muted-foreground"
            >
              {placed.cabinet.bays.length}{" "}
              {placed.cabinet.bays.length === 1 ? "bay" : "bays"}
            </text>
          </g>
        );
      })}

      {/* The footprint, under everything, which is what has to fit the room. */}
      <g className="stroke-foreground/45 fill-foreground/70" strokeWidth={8}>
        <line
          x1={0}
          y1={extent.depth + 300}
          x2={extent.width}
          y2={extent.depth + 300}
        />
        <line
          x1={0}
          y1={extent.depth + 255}
          x2={0}
          y2={extent.depth + 345}
        />
        <line
          x1={extent.width}
          y1={extent.depth + 255}
          x2={extent.width}
          y2={extent.depth + 345}
        />
        <text
          x={extent.width / 2}
          y={extent.depth + 470}
          textAnchor="middle"
          fontSize={110}
          strokeWidth={0}
        >
          {Math.round(extent.width)} × {Math.round(extent.depth)} mm on the floor
        </text>
      </g>
    </svg>
  );
}
