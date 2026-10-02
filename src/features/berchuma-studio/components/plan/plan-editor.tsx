"use client";

import { useCallback, useMemo, useState } from "react";
import { DoorOpen, Grid3x3, Plus, Redo2, Square, Trash2, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { PlanCanvas } from "./plan-canvas";
import {
  allRoomWalls,
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
  purpose = "furniture",
  doneLabel,
}: {
  initial?: Room;
  onDone?: (room: Room) => void;
  purpose?: "furniture" | "house";
  doneLabel?: string;
}) {
  const [past, setPast] = useState<Room[]>([]);
  const [room, setRoom] = useState<Room>(initial ?? rectangularRoom());
  const [future, setFuture] = useState<Room[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);

  const walls = useMemo(() => roomWalls(room), [room]);
  const openingWalls = useMemo(() => allRoomWalls(room), [room]);
  const faults = useMemo(() => openingFaults(room), [room]);
  const clearance = useMemo(() => doorClearance(room), [room]);
  const bounds = useMemo(() => planBounds(room), [room]);

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
              x: roundDecimal(wall.start.x + dx * length),
              y: roundDecimal(wall.start.y + dy * length),
            }
          : corner,
      ),
    });
  }

  function addWallPoint() {
    const wall = walls.find((one) => one.id === selected) ?? walls[0];
    if (!wall) return;
    const startIndex = room.corners.findIndex((corner) => corner.id === wall.id);
    if (startIndex < 0) return;

    const id = `c-${Date.now()}`;
    const next = [...room.corners];
    next.splice(startIndex + 1, 0, {
      id,
      x: roundDecimal((wall.start.x + wall.end.x) / 2),
      y: roundDecimal((wall.start.y + wall.end.y) / 2),
    });
    commit({ ...room, corners: next });
    setSelected(id);
  }

  function deleteSelectedWall() {
    if (!selected || room.corners.length <= 3) return;
    const next = room.corners.filter((corner) => corner.id !== selected);
    commit({
      ...room,
      corners: next,
      openings: room.openings.filter((opening) => opening.wallId !== selected),
      runWalls: room.runWalls.filter((wallId) => wallId !== selected),
    });
    setSelected(null);
  }

  function addOpening(kind: RoomOpeningKind) {
    const wall = openingWalls.find((one) => one.id === selected) ?? walls[0];
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

  function updateOpening(id: string, change: Partial<Room["openings"][number]>) {
    commit({
      ...room,
      openings: room.openings.map((opening) =>
        opening.id === id ? { ...opening, ...change } : opening,
      ),
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

  function addInteriorWall() {
    const id = `iw-${Date.now()}`;
    const x = bounds.minX + bounds.width / 2;
    const margin = Math.min(1_000, bounds.depth * 0.2);
    commit({
      ...room,
      interiorWalls: [...(room.interiorWalls ?? []), {
        id,
        start: { x, y: bounds.minY + margin },
        end: { x, y: bounds.maxY - margin },
        thickness: room.wallThickness,
        height: room.ceilingHeight,
        label: `Interior wall ${(room.interiorWalls?.length ?? 0) + 1}`,
      }],
    });
    setSelected(id);
  }

  function addZone() {
    const id = `zone-${Date.now()}`;
    const width = Math.max(1_000, Math.min(3_500, bounds.width * 0.45));
    const depth = Math.max(1_000, Math.min(3_500, bounds.depth * 0.45));
    commit({
      ...room,
      zones: [...(room.zones ?? []), {
        id,
        name: `Room ${(room.zones?.length ?? 0) + 1}`,
        boundary: rectangle(bounds.minX + room.wallThickness, bounds.minY + room.wallThickness, width, depth),
        floorMaterial: "Unspecified",
        wallMaterial: "Paint",
        ceilingMaterial: "Gypsum board",
      }],
    });
    setSelected(id);
  }

  function addColumn() {
    const id = `column-${Date.now()}`;
    commit({
      ...room,
      planColumns: [...(room.planColumns ?? []), {
        id,
        x: bounds.minX + bounds.width / 2,
        y: bounds.minY + bounds.depth / 2,
        width: 300,
        depth: 300,
        label: `Column ${(room.planColumns?.length ?? 0) + 1}`,
      }],
    });
    setSelected(id);
  }

  function addStair() {
    const id = `stair-${Date.now()}`;
    commit({
      ...room,
      planStairs: [...(room.planStairs ?? []), {
        id,
        x: bounds.minX + bounds.width / 2,
        y: bounds.minY + bounds.depth / 2,
        width: Math.min(1_000, bounds.width * 0.25),
        length: Math.min(3_200, bounds.depth * 0.55),
        rotation: 0,
        label: `Stair ${(room.planStairs?.length ?? 0) + 1}`,
      }],
    });
    setSelected(id);
  }

  function addDimension() {
    const wall = walls.find((item) => item.id === selected) ?? walls[0];
    if (!wall) return;
    const id = `dimension-${Date.now()}`;
    commit({
      ...room,
      dimensions: [...(room.dimensions ?? []), { id, start: { ...wall.start }, end: { ...wall.end }, label: "" }],
    });
    setSelected(id);
  }

  function addPlatform(kind: "balcony" | "veranda") {
    const id = `${kind}-${Date.now()}`;
    commit({
      ...room,
      planPlatforms: [...(room.planPlatforms ?? []), {
        id,
        kind,
        x: bounds.minX + bounds.width / 2,
        y: bounds.maxY + (kind === "balcony" ? 600 : 750),
        width: Math.min(3_200, bounds.width * 0.45),
        depth: kind === "balcony" ? 1_200 : 1_500,
        rotation: 0,
        wallId: walls[2]?.id ?? walls[0]?.id,
        label: kind === "balcony" ? "Balcony" : "Veranda",
      }],
    });
    setSelected(id);
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
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Walls
            </h2>
            {purpose === "house" ? (
              <div className="flex gap-1">
                <IconButton onClick={addWallPoint} label="Add wall point">
                  <Plus className="size-4" />
                </IconButton>
                <IconButton
                  onClick={deleteSelectedWall}
                  disabled={!selected || room.corners.length <= 3}
                  label="Delete selected wall"
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ) : null}
          </div>

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
                value={roundDecimal(wall.length)}
                onChange={(event) => setWallLength(wall.id, Number(event.target.value))}
                step={purpose === "house" ? 0.1 : 10}
                min={200}
                aria-label={`${wall.label} length in millimetres`}
                className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-right text-xs tabular-nums"
              />

              {purpose === "furniture" ? (
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
              ) : null}
            </div>
          ))}

          <p className="text-[11px] leading-snug text-muted-foreground">
            {purpose === "house"
              ? "Select a wall, drag its corner, or enter its exact length in mm. Add a point, then drag it to form an L or custom footprint."
              : "Drag a corner to reshape, or type a length. The order you add runs is the order the cabinets go round the corner."}
          </p>

          {purpose === "house" ? (
            <div className="space-y-2 border-t pt-2">
              <div className="grid grid-cols-2 gap-2">
                <DimensionField
                  label="Wall thickness"
                  value={room.wallThickness}
                  min={50}
                  max={600}
                  onChange={(wallThickness) => commit({ ...room, wallThickness })}
                />
                <DimensionField
                  label="Wall height"
                  value={room.ceilingHeight}
                  min={1800}
                  max={6000}
                  onChange={(ceilingHeight) => commit({ ...room, ceilingHeight })}
                />
              </div>
              {room.reference?.mediaType !== "pdf" && room.reference ? (
                <label className="block space-y-1 text-[11px] text-muted-foreground">
                  <span>Plan overlay {Math.round(room.reference.opacity * 100)}%</span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={room.reference.opacity}
                    onChange={(event) =>
                      commit({
                        ...room,
                        reference: { ...room.reference!, opacity: Number(event.target.value) },
                      })
                    }
                    className="w-full accent-[var(--brand)]"
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </section>

        {purpose === "house" ? (
          <section className="space-y-2 rounded-xl border p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rooms and structure</h2>
            <div className="grid grid-cols-2 gap-1.5">
              <PlanTool label="Wall" onClick={addInteriorWall} />
              <PlanTool label="Room" onClick={addZone} />
              <PlanTool label="Column" onClick={addColumn} />
              <PlanTool label="Stair" onClick={addStair} />
              <PlanTool label="Dimension" onClick={addDimension} />
              <PlanTool label="Balcony" onClick={() => addPlatform("balcony")} />
              <PlanTool label="Veranda" onClick={() => addPlatform("veranda")} />
            </div>

            {(room.interiorWalls ?? []).map((wall) => (
              <PlanItem key={wall.id} title={wall.label} selected={selected === wall.id} onSelect={() => setSelected(wall.id)} onDelete={() => commit({ ...room, interiorWalls: (room.interiorWalls ?? []).filter((item) => item.id !== wall.id), openings: room.openings.filter((opening) => opening.wallId !== wall.id) })}>
                <SmallNumber label="Start X" value={wall.start.x} min={-100000} step={0.1} onChange={(x) => commit({ ...room, interiorWalls: (room.interiorWalls ?? []).map((item) => item.id === wall.id ? { ...item, start: { ...item.start, x } } : item) })} />
                <SmallNumber label="Start Y" value={wall.start.y} min={-100000} step={0.1} onChange={(y) => commit({ ...room, interiorWalls: (room.interiorWalls ?? []).map((item) => item.id === wall.id ? { ...item, start: { ...item.start, y } } : item) })} />
                <SmallNumber label="End X" value={wall.end.x} min={-100000} step={0.1} onChange={(x) => commit({ ...room, interiorWalls: (room.interiorWalls ?? []).map((item) => item.id === wall.id ? { ...item, end: { ...item.end, x } } : item) })} />
                <SmallNumber label="End Y" value={wall.end.y} min={-100000} step={0.1} onChange={(y) => commit({ ...room, interiorWalls: (room.interiorWalls ?? []).map((item) => item.id === wall.id ? { ...item, end: { ...item.end, y } } : item) })} />
                <SmallNumber label="Thickness" value={wall.thickness} min={50} step={0.1} onChange={(thickness) => commit({ ...room, interiorWalls: (room.interiorWalls ?? []).map((item) => item.id === wall.id ? { ...item, thickness } : item) })} />
              </PlanItem>
            ))}

            {(room.zones ?? []).map((zone) => {
              const box = pointBounds(zone.boundary);
              const replace = (x: number, y: number, width: number, depth: number) => commit({ ...room, zones: (room.zones ?? []).map((item) => item.id === zone.id ? { ...item, boundary: rectangle(x, y, width, depth) } : item) });
              return (
                <PlanItem key={zone.id} title={zone.name} selected={selected === zone.id} onSelect={() => setSelected(zone.id)} onDelete={() => commit({ ...room, zones: (room.zones ?? []).filter((item) => item.id !== zone.id) })}>
                  <input value={zone.name} onChange={(event) => commit({ ...room, zones: (room.zones ?? []).map((item) => item.id === zone.id ? { ...item, name: event.target.value.slice(0, 80) || "Room" } : item) })} aria-label="Room name" className="col-span-2 rounded-md border bg-background px-2 py-1 text-xs" />
                  <SmallNumber label="X" value={box.minX} min={-100000} step={0.1} onChange={(x) => replace(x, box.minY, box.width, box.depth)} />
                  <SmallNumber label="Y" value={box.minY} min={-100000} step={0.1} onChange={(y) => replace(box.minX, y, box.width, box.depth)} />
                  <SmallNumber label="Width" value={box.width} min={300} step={0.1} onChange={(width) => replace(box.minX, box.minY, width, box.depth)} />
                  <SmallNumber label="Depth" value={box.depth} min={300} step={0.1} onChange={(depth) => replace(box.minX, box.minY, box.width, depth)} />
                </PlanItem>
              );
            })}

            {(room.planColumns ?? []).map((column) => (
              <PlanItem key={column.id} title={column.label} selected={selected === column.id} onSelect={() => setSelected(column.id)} onDelete={() => commit({ ...room, planColumns: (room.planColumns ?? []).filter((item) => item.id !== column.id) })}>
                {(["x", "y", "width", "depth"] as const).map((field) => <SmallNumber key={field} label={field} value={column[field]} min={field === "x" || field === "y" ? -100000 : 100} step={0.1} onChange={(value) => commit({ ...room, planColumns: (room.planColumns ?? []).map((item) => item.id === column.id ? { ...item, [field]: value } : item) })} />)}
              </PlanItem>
            ))}

            {(room.planStairs ?? []).map((stair) => (
              <PlanItem key={stair.id} title={stair.label} selected={selected === stair.id} onSelect={() => setSelected(stair.id)} onDelete={() => commit({ ...room, planStairs: (room.planStairs ?? []).filter((item) => item.id !== stair.id) })}>
                {(["x", "y", "width", "length", "rotation"] as const).map((field) => <SmallNumber key={field} label={field} value={stair[field]} min={field === "x" || field === "y" || field === "rotation" ? -100000 : 300} step={0.1} onChange={(value) => commit({ ...room, planStairs: (room.planStairs ?? []).map((item) => item.id === stair.id ? { ...item, [field]: value } : item) })} />)}
              </PlanItem>
            ))}

            {(room.dimensions ?? []).map((dimension) => (
              <PlanItem key={dimension.id} title={dimension.label || "Dimension"} selected={selected === dimension.id} onSelect={() => setSelected(dimension.id)} onDelete={() => commit({ ...room, dimensions: (room.dimensions ?? []).filter((item) => item.id !== dimension.id) })}>
                <SmallNumber label="Start X" value={dimension.start.x} min={-100000} step={0.1} onChange={(x) => commit({ ...room, dimensions: (room.dimensions ?? []).map((item) => item.id === dimension.id ? { ...item, start: { ...item.start, x } } : item) })} />
                <SmallNumber label="Start Y" value={dimension.start.y} min={-100000} step={0.1} onChange={(y) => commit({ ...room, dimensions: (room.dimensions ?? []).map((item) => item.id === dimension.id ? { ...item, start: { ...item.start, y } } : item) })} />
                <SmallNumber label="End X" value={dimension.end.x} min={-100000} step={0.1} onChange={(x) => commit({ ...room, dimensions: (room.dimensions ?? []).map((item) => item.id === dimension.id ? { ...item, end: { ...item.end, x } } : item) })} />
                <SmallNumber label="End Y" value={dimension.end.y} min={-100000} step={0.1} onChange={(y) => commit({ ...room, dimensions: (room.dimensions ?? []).map((item) => item.id === dimension.id ? { ...item, end: { ...item.end, y } } : item) })} />
              </PlanItem>
            ))}

            {(room.planPlatforms ?? []).map((platform) => (
              <PlanItem key={platform.id} title={platform.label} selected={selected === platform.id} onSelect={() => setSelected(platform.id)} onDelete={() => commit({ ...room, planPlatforms: (room.planPlatforms ?? []).filter((item) => item.id !== platform.id) })}>
                {(["x", "y", "width", "depth", "rotation"] as const).map((field) => <SmallNumber key={field} label={field} value={platform[field]} min={field === "x" || field === "y" || field === "rotation" ? -100000 : 300} step={0.1} onChange={(value) => commit({ ...room, planPlatforms: (room.planPlatforms ?? []).map((item) => item.id === platform.id ? { ...item, [field]: value } : item) })} />)}
              </PlanItem>
            ))}
          </section>
        ) : null}

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

          {room.openings.map((opening) => (
            <div key={opening.id} className="space-y-1.5 rounded-lg border p-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 capitalize text-muted-foreground">
                  {opening.kind}
                </span>
                <select
                  value={opening.wallId}
                  onChange={(event) => updateOpening(opening.id, { wallId: event.target.value })}
                  aria-label="Wall"
                  className="w-12 shrink-0 rounded-md border bg-background px-1 py-1 text-xs"
                >
                  {openingWalls.map((wall) => (
                    <option key={wall.id} value={wall.id}>
                      {wall.label.replace("Wall ", "")}
                    </option>
                  ))}
                </select>
                <SmallNumber
                  label="Offset"
                  value={opening.offset}
                  min={0}
                  step={purpose === "house" ? 0.1 : 50}
                  onChange={(offset) => updateOpening(opening.id, { offset })}
                />
                <SmallNumber
                  label="Width"
                  value={opening.width}
                  min={100}
                  step={purpose === "house" ? 0.1 : 50}
                  onChange={(width) => updateOpening(opening.id, { width })}
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
              {purpose === "house" ? (
                <div className="grid grid-cols-2 gap-2 pl-16">
                  <SmallNumber
                    label="Height"
                    value={opening.height}
                    min={100}
                    step={0.1}
                    onChange={(height) => updateOpening(opening.id, { height })}
                  />
                  <SmallNumber
                    label="Sill"
                    value={opening.sill}
                    min={0}
                    step={0.1}
                    onChange={(sill) => updateOpening(opening.id, { sill })}
                  />
                </div>
              ) : null}
            </div>
          ))}

          {purpose === "house" && room.openings.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              All opening dimensions are in millimetres.
            </p>
          ) : null}
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
            disabled={purpose === "furniture" && room.runWalls.length === 0}
            className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
          >
            {doneLabel ??
              (room.runWalls.length === 0
                ? "Choose a wall for the cabinets"
                : `Design against ${room.runWalls.length} wall${room.runWalls.length === 1 ? "" : "s"}`)}
          </button>
        )}
      </div>
    </div>
  );
}

function DimensionField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span className="flex items-center rounded-md border bg-background px-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={0.1}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next) && next >= min && next <= max) onChange(next);
          }}
          className="min-w-0 flex-1 bg-transparent py-1 text-right text-xs tabular-nums outline-none"
        />
        <span className="ml-1">mm</span>
      </span>
    </label>
  );
}

function SmallNumber({
  label,
  value,
  min,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        placeholder={label}
        title={`${label} (mm)`}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.max(min, next));
        }}
        className="w-full min-w-0 rounded-md border bg-background px-2 py-1 text-right tabular-nums"
      />
    </label>
  );
}

function roundDecimal(value: number): number {
  return Math.round(value * 100) / 100;
}

function PlanTool({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-md border px-2 py-2 text-xs hover:border-brand hover:text-brand">+ {label}</button>;
}

function PlanItem({ title, selected, onSelect, onDelete, children }: { title: string; selected: boolean; onSelect: () => void; onDelete: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5 rounded-lg border p-2", selected && "border-brand bg-brand/5")}>
      <div className="flex items-center justify-between gap-2"><button type="button" onClick={onSelect} className="truncate text-left text-xs font-medium">{title}</button><button type="button" onClick={onDelete} className="text-xs text-destructive">Remove</button></div>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

function pointBounds(points: { x: number; y: number }[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, depth: maxY - minY };
}

function planBounds(room: Room) {
  return pointBounds(room.corners);
}

function rectangle(x: number, y: number, width: number, depth: number) {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + depth }, { x, y: y + depth }];
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
