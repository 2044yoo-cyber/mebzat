"use client";

import { useCallback, useMemo, useState } from "react";
import { DoorOpen, Grid3x3, Redo2, Square, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { PlanCanvas } from "./plan-canvas";
import {
  doorClearance,
  floorArea,
  openingFaults,
  roomWalls,
} from "../../services/room-geometry";
import { rectangularRoom, type Room, type RoomOpeningKind } from "../../types/room";

/**
 * Drawing the room.
 *
 * The plan and the numbers are the same room, edited two ways: drag a corner
 * or type a length. Dragging is how somebody finds the shape and typing is how
 * they get it right, and a plan editor that offers only one of them is a plan
 * editor somebody stops using at the second wall.
 *
 * Undo is here rather than in the canvas because it has to cover typing a
 * dimension as well as dragging a corner — §23, and the reason it matters is
 * that this is a tool people experiment with.
 */

/** Deep enough to get out of trouble, shallow enough to stay in memory. */
const HISTORY_LIMIT = 50;

export function PlanEditor({
  initial,
  onDone,
}: {
  initial?: Room;
  onDone?: (room: Room) => void;
}) {
  const [past, setPast] = useState<Room[]>([]);
  const [room, setRoom] = useState<Room>(initial ?? rectangularRoom());
  const [future, setFuture] = useState<Room[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);

  const walls = useMemo(() => roomWalls(room), [room]);
  const faults = useMemo(() => openingFaults(room), [room]);
  const clearance = useMemo(() => doorClearance(room), [room]);

  const commit = useCallback((next: Room) => {
    setPast((history) => [...history, room].slice(-HISTORY_LIMIT));
    setFuture([]);
    setRoom(next);
  }, [room]);

  function undo() {
    setPast((history) => {
      if (history.length === 0) return history;
      const previous = history[history.length - 1];
      setFuture((ahead) => [room, ...ahead]);
      setRoom(previous);
      return history.slice(0, -1);
    });
  }

  function redo() {
    setFuture((ahead) => {
      if (ahead.length === 0) return ahead;
      setPast((history) => [...history, room]);
      setRoom(ahead[0]);
      return ahead.slice(1);
    });
  }

  /**
   * Setting a wall's length by typing it.
   *
   * The wall's end corner moves along the wall's own direction, so the shape
   * is kept and only that wall changes. Moving it any other way turns "make
   * wall A 4500" into "make the room a different shape", which is not what
   * anybody means.
   */
  function setWallLength(wallId: string, length: number) {
    const wall = walls.find((one) => one.id === wallId);
    if (!wall || length < 200) return;

    const dx = (wall.end.x - wall.start.x) / wall.length;
    const dy = (wall.end.y - wall.start.y) / wall.length;
    const endIndex = (room.corners.findIndex((c) => c.id === wall.id) + 1) % room.corners.length;

    commit({
      ...room,
      corners: room.corners.map((corner, index) =>
        index === endIndex
          ? {
              ...corner,
              x: Math.round(wall.start.x + dx * length),
              y: Math.round(wall.start.y + dy * length),
            }
          : corner,
      ),
    });
  }

  function addOpening(kind: RoomOpeningKind) {
    const wall = walls.find((one) => one.id === selected) ?? walls[0];
    if (!wall) return;

    const width = kind === "window" ? 1200 : 900;
    commit({
      ...room,
      openings: [
        ...room.openings,
        {
          id: `o-${Date.now()}`,
          kind,
          wallId: wall.id,
          // Centred on the wall, which is somewhere to start from rather than
          // a guess at where the builder actually put it.
          offset: Math.max(0, Math.round((wall.length - width) / 2)),
          width,
          height: kind === "window" ? 1200 : 2100,
          sill: kind === "window" ? 900 : 0,
          swing: kind === "door" ? "in-right" : "none",
          label: "",
        },
      ],
    });
  }

  function toggleRunWall(wallId: string) {
    commit({
      ...room,
      runWalls: room.runWalls.includes(wallId)
        ? room.runWalls.filter((id) => id !== wallId)
        : [...room.runWalls, wallId],
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-xl border bg-background">
        <PlanCanvas
          room={room}
          onChange={commit}
          selectedWallId={selected}
          onSelectWall={setSelected}
          snap={snap}
        />

        <div className="absolute left-3 top-3 flex gap-1 rounded-full border bg-background/90 p-1 backdrop-blur">
          <IconButton onClick={undo} disabled={past.length === 0} label="Undo">
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton onClick={redo} disabled={future.length === 0} label="Redo">
            <Redo2 className="size-4" />
          </IconButton>
          <IconButton onClick={() => setSnap((on) => !on)} active={snap} label="Snap to grid">
            <Grid3x3 className="size-4" />
          </IconButton>
        </div>

        <p className="absolute bottom-3 left-3 rounded-full bg-background/90 px-3 py-1 text-[11px] tabular-nums text-muted-foreground backdrop-blur">
          {floorArea(room).toFixed(2)} m² · {walls.length} walls
        </p>
      </div>

      <div className="w-full space-y-3 overflow-y-auto lg:w-80">
        <section className="space-y-2 rounded-xl border p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Walls
          </h2>

          {walls.map((wall) => (
            <div key={wall.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(selected === wall.id ? null : wall.id)}
                className={cn(
                  "w-16 shrink-0 rounded-md border px-2 py-1 text-left text-xs transition-colors",
                  selected === wall.id ? "border-brand bg-brand/10" : "hover:bg-muted",
                )}
              >
                {wall.label.replace("Wall ", "")}
              </button>

              <input
                type="number"
                value={Math.round(wall.length)}
                onChange={(event) => setWallLength(wall.id, Number(event.target.value))}
                step={10}
                min={200}
                aria-label={`${wall.label} length in millimetres`}
                className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-right text-xs tabular-nums"
              />

              <button
                type="button"
                onClick={() => toggleRunWall(wall.id)}
                aria-pressed={room.runWalls.includes(wall.id)}
                title="Put cabinets against this wall"
                className={cn(
                  "shrink-0 rounded-md border px-2 py-1 text-xs transition-colors",
                  room.runWalls.includes(wall.id)
                    ? "border-brand bg-brand text-brand-foreground"
                    : "hover:bg-muted",
                )}
              >
                {room.runWalls.includes(wall.id)
                  ? `Run ${room.runWalls.indexOf(wall.id) + 1}`
                  : "Add run"}
              </button>
            </div>
          ))}

          <p className="text-[11px] leading-snug text-muted-foreground">
            Drag a corner to reshape, or type a length. The order you add runs is
            the order the cabinets go round the corner.
          </p>
        </section>

        <section className="space-y-2 rounded-xl border p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Doors and windows
          </h2>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addOpening("door")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition-colors hover:bg-muted"
            >
              <DoorOpen className="size-3.5" /> Door
            </button>
            <button
              type="button"
              onClick={() => addOpening("window")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition-colors hover:bg-muted"
            >
              <Square className="size-3.5" /> Window
            </button>
          </div>

          {room.openings.map((opening) => {
            const wall = walls.find((one) => one.id === opening.wallId);
            return (
              <div key={opening.id} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 capitalize text-muted-foreground">
                  {opening.kind}
                </span>
                <span className="w-10 shrink-0 text-muted-foreground">
                  {wall?.label.replace("Wall ", "") ?? "—"}
                </span>
                <input
                  type="number"
                  value={opening.offset}
                  onChange={(event) =>
                    commit({
                      ...room,
                      openings: room.openings.map((one) =>
                        one.id === opening.id
                          ? { ...one, offset: Math.max(0, Number(event.target.value)) }
                          : one,
                      ),
                    })
                  }
                  step={50}
                  aria-label="Distance from the corner"
                  className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-right tabular-nums"
                />
                <input
                  type="number"
                  value={opening.width}
                  onChange={(event) =>
                    commit({
                      ...room,
                      openings: room.openings.map((one) =>
                        one.id === opening.id
                          ? { ...one, width: Math.max(100, Number(event.target.value)) }
                          : one,
                      ),
                    })
                  }
                  step={50}
                  aria-label="Width"
                  className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-right tabular-nums"
                />
                <button
                  type="button"
                  onClick={() =>
                    commit({
                      ...room,
                      openings: room.openings.filter((one) => one.id !== opening.id),
                    })
                  }
                  aria-label="Remove"
                  className="shrink-0 rounded-md px-2 py-1 text-destructive hover:bg-muted"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </section>

        {(faults.length > 0 || clearance.length > 0) && (
          <section className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Worth checking
            </h2>
            {[...faults, ...clearance].map((note) => (
              <p key={note} className="text-[11px] leading-snug text-amber-900 dark:text-amber-200">
                {note}
              </p>
            ))}
          </section>
        )}

        {onDone && (
          <button
            type="button"
            onClick={() => onDone(room)}
            disabled={room.runWalls.length === 0}
            className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
          >
            {room.runWalls.length === 0
              ? "Choose a wall for the cabinets"
              : `Design against ${room.runWalls.length} wall${room.runWalls.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    </div>
  );
}

function IconButton({
  onClick,
  disabled,
  active,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex size-9 items-center justify-center rounded-full transition-colors disabled:opacity-30",
        active ? "bg-brand text-brand-foreground" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
