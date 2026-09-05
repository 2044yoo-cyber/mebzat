"use client";

import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { openingsOn, roomWalls } from "../../services/room-geometry";
import type { Room, RoomOpening } from "../../types/room";

/**
 * The room, drawn to scale and editable.
 *
 * SVG rather than canvas. A plan is a few dozen lines and some text; SVG gives
 * hit-testing, focus, keyboard access and crisp text at every zoom for free,
 * and the whole thing re-renders from the room in under a millisecond. Canvas
 * would mean writing all four of those again.
 *
 * Corners are dragged with Pointer Events — one path for a mouse, a finger and
 * a stylus, as everywhere else in the studio — and every wall carries its
 * length as a number you can also type, because §3 wants both and because
 * dragging to exactly 4200 is not a thing anybody can do.
 */

/** Drag targets are this many millimetres across, whatever the zoom. */
const HANDLE = 90;

/** What dragging snaps to, unless it is turned off. */
const GRID = 50;

export function PlanCanvas({
  room,
  onChange,
  selectedWallId,
  onSelectWall,
  snap = true,
  className,
}: {
  room: Room;
  onChange: (room: Room) => void;
  selectedWallId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  snap?: boolean;
  className?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const walls = useMemo(() => roomWalls(room), [room]);

  // The drawing is in millimetres and the viewBox does the scaling, so a 2 m
  // cloakroom and a 12 m hall both arrive filling the frame.
  const bounds = useMemo(() => {
    const xs = room.corners.map((c) => c.x);
    const ys = room.corners.map((c) => c.y);
    const pad = Math.max(...xs, ...ys, 1000) * 0.18;
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      width: Math.max(...xs) - Math.min(...xs) + pad * 2,
      height: Math.max(...ys) - Math.min(...ys) + pad * 2,
    };
  }, [room.corners]);

  /** Screen pixels to millimetres, through the viewBox. */
  function toRoom(event: React.PointerEvent): { x: number; y: number } | null {
    const node = svg.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const x = bounds.x + ((event.clientX - rect.left) / rect.width) * bounds.width;
    const y = bounds.y + ((event.clientY - rect.top) / rect.height) * bounds.height;
    return snap
      ? { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID }
      : { x, y };
  }

  function moveCorner(event: React.PointerEvent) {
    if (!dragging) return;
    const point = toRoom(event);
    if (!point) return;
    onChange({
      ...room,
      corners: room.corners.map((corner) =>
        corner.id === dragging ? { ...corner, x: point.x, y: point.y } : corner,
      ),
    });
  }

  const stroke = Math.max(bounds.width, bounds.height) / 320;

  return (
    <svg
      ref={svg}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      className={cn("size-full touch-none select-none", className)}
      onPointerMove={moveCorner}
      onPointerUp={() => setDragging(null)}
      onPointerLeave={() => setDragging(null)}
      role="application"
      aria-label="Floor plan"
    >
      {/* The floor, so the inside of the room reads as the inside. */}
      <polygon
        points={room.corners.map((c) => `${c.x},${c.y}`).join(" ")}
        className="fill-muted/50"
      />

      {walls.map((wall) => {
        const selected = wall.id === selectedWallId;
        const onRun = room.runWalls.includes(wall.id);
        const midX = (wall.start.x + wall.end.x) / 2;
        const midY = (wall.start.y + wall.end.y) / 2;

        return (
          <g key={wall.id}>
            <line
              x1={wall.start.x}
              y1={wall.start.y}
              x2={wall.end.x}
              y2={wall.end.y}
              strokeWidth={room.wallThickness}
              strokeLinecap="butt"
              className={cn(
                "cursor-pointer",
                selected ? "stroke-brand" : onRun ? "stroke-brand/45" : "stroke-foreground/75",
              )}
              onPointerDown={() => onSelectWall?.(selected ? null : wall.id)}
            />

            {/* The openings, drawn as gaps in the wall they are in. */}
            {openingsOn(room, wall.id).map((opening) => (
              <OpeningMark
                key={opening.id}
                opening={opening}
                wall={wall}
                thickness={room.wallThickness}
              />
            ))}

            {/* The dimension. Every wall carries its length, because the
                number is what somebody checks and the drawing is only how
                they find it. */}
            <text
              x={midX + wall.inward.x * room.wallThickness * 2.2}
              y={midY + wall.inward.y * room.wallThickness * 2.2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.max(bounds.width, bounds.height) / 34}
              className="pointer-events-none fill-foreground font-medium"
            >
              {Math.round(wall.length)}
            </text>
          </g>
        );
      })}

      {room.corners.map((corner) => (
        <circle
          key={corner.id}
          cx={corner.x}
          cy={corner.y}
          r={HANDLE / 2}
          className={cn(
            "cursor-grab",
            dragging === corner.id ? "fill-brand" : "fill-background stroke-foreground/60",
          )}
          strokeWidth={stroke}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(corner.id);
          }}
        />
      ))}
    </svg>
  );
}

/**
 * A door or a window, on the wall it belongs to.
 *
 * Drawn along the wall by walking `offset` millimetres from its start and then
 * `width` further — the same one-dimensional arithmetic the clash check uses,
 * so what is drawn and what is warned about cannot disagree.
 */
function OpeningMark({
  opening,
  wall,
  thickness,
}: {
  opening: RoomOpening;
  wall: ReturnType<typeof roomWalls>[number];
  thickness: number;
}) {
  const dx = (wall.end.x - wall.start.x) / wall.length;
  const dy = (wall.end.y - wall.start.y) / wall.length;

  const from = {
    x: wall.start.x + dx * opening.offset,
    y: wall.start.y + dy * opening.offset,
  };
  const to = {
    x: wall.start.x + dx * (opening.offset + opening.width),
    y: wall.start.y + dy * (opening.offset + opening.width),
  };

  return (
    <g className="pointer-events-none">
      {/* The hole itself: the wall painted out. */}
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        strokeWidth={thickness}
        strokeLinecap="butt"
        className="stroke-background"
      />
      {opening.kind === "window" ? (
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          strokeWidth={thickness / 4}
          className="stroke-sky-500"
        />
      ) : (
        // A door leaf and the arc it swings through — what tells somebody
        // reading the plan that the space in front of it has to stay clear.
        <>
          <line
            x1={from.x}
            y1={from.y}
            x2={from.x + wall.inward.x * opening.width}
            y2={from.y + wall.inward.y * opening.width}
            strokeWidth={thickness / 5}
            className="stroke-foreground/70"
          />
          <path
            d={`M ${to.x} ${to.y} A ${opening.width} ${opening.width} 0 0 1 ${
              from.x + wall.inward.x * opening.width
            } ${from.y + wall.inward.y * opening.width}`}
            fill="none"
            strokeWidth={thickness / 8}
            strokeDasharray={`${opening.width / 18} ${opening.width / 18}`}
            className="stroke-foreground/40"
          />
        </>
      )}
    </g>
  );
}
