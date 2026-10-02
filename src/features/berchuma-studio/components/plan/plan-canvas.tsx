"use client";

import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { allRoomWalls, openingsOn, roomWalls } from "../../services/room-geometry";
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
  const allWalls = useMemo(() => allRoomWalls(room), [room]);
  const interiorWalls = useMemo(() => room.interiorWalls ?? [], [room.interiorWalls]);
  const zones = useMemo(() => room.zones ?? [], [room.zones]);
  const columns = useMemo(() => room.planColumns ?? [], [room.planColumns]);
  const stairs = useMemo(() => room.planStairs ?? [], [room.planStairs]);
  const dimensions = useMemo(() => room.dimensions ?? [], [room.dimensions]);
  const platforms = useMemo(() => room.planPlatforms ?? [], [room.planPlatforms]);

  const planPoints = useMemo(() => [
    ...room.corners,
    ...interiorWalls.flatMap((wall) => [wall.start, wall.end]),
    ...zones.flatMap((zone) => zone.boundary),
    ...dimensions.flatMap((dimension) => [dimension.start, dimension.end]),
    ...columns.flatMap((column) => [
      { x: column.x - column.width / 2, y: column.y - column.depth / 2 },
      { x: column.x + column.width / 2, y: column.y + column.depth / 2 },
    ]),
    ...stairs.flatMap((stair) => [
      { x: stair.x - stair.width / 2, y: stair.y - stair.length / 2 },
      { x: stair.x + stair.width / 2, y: stair.y + stair.length / 2 },
    ]),
    ...platforms.flatMap((platform) => [
      { x: platform.x - platform.width / 2, y: platform.y - platform.depth / 2 },
      { x: platform.x + platform.width / 2, y: platform.y + platform.depth / 2 },
    ]),
  ], [columns, dimensions, interiorWalls, platforms, room.corners, stairs, zones]);

  const contentBounds = useMemo(() => {
    const xs = room.corners.map((c) => c.x);
    const ys = room.corners.map((c) => c.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }, [room.corners]);

  // The drawing is in millimetres and the viewBox does the scaling, so a 2 m
  // cloakroom and a 12 m hall both arrive filling the frame.
  const bounds = useMemo(() => {
    const xs = planPoints.map((c) => c.x);
    const ys = planPoints.map((c) => c.y);
    const pad = Math.max(...xs, ...ys, 1000) * 0.18;
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      width: Math.max(...xs) - Math.min(...xs) + pad * 2,
      height: Math.max(...ys) - Math.min(...ys) + pad * 2,
    };
  }, [planPoints]);

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

  function moveElement(event: React.PointerEvent) {
    if (!dragging) return;
    const point = toRoom(event);
    if (!point) return;
    const separator = dragging.indexOf(":");
    const kind = dragging.slice(0, separator);
    const id = dragging.slice(separator + 1);
    if (kind === "corner") {
      onChange({
        ...room,
        corners: room.corners.map((corner) =>
          corner.id === id ? { ...corner, x: point.x, y: point.y } : corner,
        ),
      });
      return;
    }
    if (kind === "iw-start" || kind === "iw-end") {
      onChange({
        ...room,
        interiorWalls: interiorWalls.map((wall) => wall.id === id
          ? { ...wall, [kind === "iw-start" ? "start" : "end"]: point }
          : wall),
      });
      return;
    }
    if (kind === "column") {
      onChange({ ...room, planColumns: columns.map((column) => column.id === id ? { ...column, ...point } : column) });
      return;
    }
    if (kind === "stair") {
      onChange({ ...room, planStairs: stairs.map((stair) => stair.id === id ? { ...stair, ...point } : stair) });
      return;
    }
    if (kind === "opening") {
      const opening = room.openings.find((item) => item.id === id);
      const wall = opening ? allWalls.find((item) => item.id === opening.wallId) : null;
      if (!opening || !wall) return;
      const dx = (wall.end.x - wall.start.x) / wall.length;
      const dy = (wall.end.y - wall.start.y) / wall.length;
      const centre = (point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy;
      const offset = Math.max(0, Math.min(wall.length - opening.width, centre - opening.width / 2));
      onChange({ ...room, openings: room.openings.map((item) => item.id === id ? { ...item, offset } : item) });
      return;
    }
    if (kind === "platform") {
      onChange({ ...room, planPlatforms: platforms.map((platform) => platform.id === id ? { ...platform, ...point } : platform) });
    }
  }

  const stroke = Math.max(bounds.width, bounds.height) / 320;

  return (
    <svg
      ref={svg}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      className={cn("size-full touch-none select-none", className)}
      onPointerMove={moveElement}
      onPointerUp={() => setDragging(null)}
      onPointerLeave={() => setDragging(null)}
      role="application"
      aria-label="Floor plan"
    >
      {room.reference?.mediaType !== "pdf" && room.reference?.url ? (
        <image
          href={room.reference.url}
          x={contentBounds.x}
          y={contentBounds.y}
          width={contentBounds.width}
          height={contentBounds.height}
          preserveAspectRatio="xMidYMid meet"
          opacity={room.reference.opacity}
          className="pointer-events-none"
        />
      ) : null}

      {/* The floor, so the inside of the room reads as the inside. */}
      <polygon
        points={room.corners.map((c) => `${c.x},${c.y}`).join(" ")}
        className={cn("fill-muted/50", room.reference ? "fill-muted/25" : null)}
      />

      {zones.map((zone) => {
        const centre = polygonCentre(zone.boundary);
        return (
          <g key={zone.id} onPointerDown={() => onSelectWall?.(zone.id)} className="cursor-pointer">
            <polygon points={zone.boundary.map((point) => `${point.x},${point.y}`).join(" ")} className={cn("fill-sky-500/10 stroke-sky-500/45", selectedWallId === zone.id && "fill-brand/20 stroke-brand")} strokeWidth={stroke} />
            <text x={centre.x} y={centre.y} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(bounds.width, bounds.height) / 38} className="pointer-events-none fill-foreground/75">{zone.name}</text>
          </g>
        );
      })}

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
                onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(`opening:${opening.id}`); }}
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
              {Number(wall.length.toFixed(2))}
            </text>
          </g>
        );
      })}

      {interiorWalls.map((wall) => {
        const selected = wall.id === selectedWallId;
        const renderedWall = allWalls.find((item) => item.id === wall.id);
        return (
          <g key={wall.id}>
            <line x1={wall.start.x} y1={wall.start.y} x2={wall.end.x} y2={wall.end.y} strokeWidth={wall.thickness} className={cn("cursor-pointer", selected ? "stroke-brand" : "stroke-foreground/65")} onPointerDown={() => onSelectWall?.(selected ? null : wall.id)} />
            {renderedWall ? openingsOn(room, wall.id).map((opening) => <OpeningMark key={opening.id} opening={opening} wall={renderedWall} thickness={wall.thickness} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(`opening:${opening.id}`); }} />) : null}
            {(["start", "end"] as const).map((end) => (
              <circle key={end} cx={wall[end].x} cy={wall[end].y} r={HANDLE / 2.5} strokeWidth={stroke} className="cursor-grab fill-background stroke-foreground/60" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(`iw-${end}:${wall.id}`); }} />
            ))}
          </g>
        );
      })}

      {columns.map((column) => (
        <rect
          key={column.id}
          x={column.x - column.width / 2}
          y={column.y - column.depth / 2}
          width={column.width}
          height={column.depth}
          strokeWidth={stroke}
          className={cn("cursor-move fill-amber-500/25 stroke-amber-700", selectedWallId === column.id && "fill-brand/30 stroke-brand")}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); onSelectWall?.(column.id); setDragging(`column:${column.id}`); }}
        />
      ))}

      {stairs.map((stair) => (
        <g key={stair.id} transform={`rotate(${stair.rotation} ${stair.x} ${stair.y})`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); onSelectWall?.(stair.id); setDragging(`stair:${stair.id}`); }} className="cursor-move">
          <rect x={stair.x - stair.width / 2} y={stair.y - stair.length / 2} width={stair.width} height={stair.length} strokeWidth={stroke} className={cn("fill-muted/70 stroke-foreground/60", selectedWallId === stair.id && "fill-brand/20 stroke-brand")} />
          {Array.from({ length: 8 }, (_, index) => (
            <line key={index} x1={stair.x - stair.width / 2} x2={stair.x + stair.width / 2} y1={stair.y - stair.length / 2 + stair.length * (index + 1) / 9} y2={stair.y - stair.length / 2 + stair.length * (index + 1) / 9} strokeWidth={stroke * 0.6} className="pointer-events-none stroke-foreground/45" />
          ))}
        </g>
      ))}

      {platforms.map((platform) => (
        <g key={platform.id} transform={`rotate(${platform.rotation} ${platform.x} ${platform.y})`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); onSelectWall?.(platform.id); setDragging(`platform:${platform.id}`); }} className="cursor-move">
          <rect x={platform.x - platform.width / 2} y={platform.y - platform.depth / 2} width={platform.width} height={platform.depth} strokeWidth={stroke} strokeDasharray={`${stroke * 3} ${stroke * 2}`} className={cn("fill-emerald-500/10 stroke-emerald-600", selectedWallId === platform.id && "fill-brand/20 stroke-brand")} />
          <text x={platform.x} y={platform.y} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(bounds.width, bounds.height) / 44} className="pointer-events-none fill-foreground/75">{platform.label}</text>
        </g>
      ))}

      {dimensions.map((dimension) => {
        const length = Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y);
        return (
          <g key={dimension.id} className="pointer-events-none">
            <line x1={dimension.start.x} y1={dimension.start.y} x2={dimension.end.x} y2={dimension.end.y} strokeWidth={stroke * 0.65} strokeDasharray={`${stroke * 3} ${stroke * 2}`} className="stroke-brand" />
            <text x={(dimension.start.x + dimension.end.x) / 2} y={(dimension.start.y + dimension.end.y) / 2} textAnchor="middle" fontSize={Math.max(bounds.width, bounds.height) / 42} className="fill-brand">{dimension.label || Number(length.toFixed(2))}</text>
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
            dragging === `corner:${corner.id}` ? "fill-brand" : "fill-background stroke-foreground/60",
          )}
          strokeWidth={stroke}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(`corner:${corner.id}`);
          }}
        />
      ))}
    </svg>
  );
}

function polygonCentre(points: { x: number; y: number }[]) {
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
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
  onPointerDown,
}: {
  opening: RoomOpening;
  wall: ReturnType<typeof roomWalls>[number];
  thickness: number;
  onPointerDown?: React.PointerEventHandler<SVGGElement>;
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
    <g className="cursor-ew-resize" onPointerDown={onPointerDown}>
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
