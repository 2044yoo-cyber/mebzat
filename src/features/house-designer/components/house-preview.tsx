"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useStore, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";

import { RoomShell } from "@/features/berchuma-studio/components/viewer/room-shell";
import { roomWalls } from "@/features/berchuma-studio/services/room-geometry";
import type { Room } from "@/features/berchuma-studio/types/room";
import { cn } from "@/lib/utils";

import {
  openingObjectId,
  wallObjectId,
  type HouseBalcony,
  type HouseCeiling,
  type HouseFacadeElement,
  type HouseProject,
  type HouseRoom,
  type HouseRoof,
  type HouseSelection,
  type HouseSlab,
  type HouseStair,
  type HouseStructuralBeam,
  type HouseStructuralColumn,
  type HouseStructuralGrid,
  type HouseSite,
  type HouseVeranda,
  type HouseWall,
} from "../types/project";

const MM = 0.001;
type View = "3d" | "top" | "front" | "back" | "left" | "right";

export function HousePreview({
  project,
  visibleLevelIds,
  selected,
  selectedIds,
  hiddenKinds = new Set(),
  hiddenIds = new Set(),
  initialView,
  onSelect,
  className,
}: {
  project: HouseProject;
  visibleLevelIds: ReadonlySet<string>;
  selected: HouseSelection | null;
  selectedIds?: ReadonlySet<string>;
  hiddenKinds?: ReadonlySet<HouseSelection["kind"]>;
  hiddenIds?: ReadonlySet<string>;
  initialView?: View;
  onSelect: (selection: HouseSelection | null, mode?: "replace" | "add" | "remove") => void;
  className?: string;
}) {
  const bounds = useMemo(() => projectBounds(project), [project]);
  const [view, setView] = useState<View>(() => initialView ?? "3d");
  const selectionMode = useRef<"replace" | "add" | "remove">("replace");
  const highlighted = selectedIds ?? new Set(selected ? [selected.id] : []);
  const visible = (kind: HouseSelection["kind"], id: string, levelId: string) => visibleLevelIds.has(levelId) && !hiddenKinds.has(kind) && !hiddenIds.has(id);
  const choose = (selection: HouseSelection | null) => onSelect(selection, selectionMode.current);


  return (
    <div
      className={cn("relative min-h-[320px] w-full min-w-0 overflow-hidden rounded-xl border bg-muted/25", className)}
      onPointerDownCapture={(event) => { selectionMode.current = event.shiftKey ? "remove" : event.ctrlKey || event.metaKey ? "add" : "replace"; }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 38, near: 0.02, far: 200 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", maxWidth: "100%", minWidth: 0, touchAction: "none" }}
        onPointerMissed={() => choose(null)}
      >
        <ambientLight intensity={0.72} />
        <directionalLight position={[8, 14, 9]} intensity={1.4} />
        <directionalLight position={[-7, 8, -5]} intensity={0.42} />

        {project.site && visible("site", project.site.id, project.site.levelId) ? (
          <SiteMesh site={project.site} bounds={bounds} selected={highlighted.has(project.site.id)} onSelect={() => choose({ kind: "site", id: project.site!.id })} />
        ) : null}

        {project.rooms.filter((room) => visible("room", room.id, room.levelId)).map((room) => {
          const level = project.levels.find((item) => item.id === room.levelId);
          return <RoomSurfaceMesh key={room.id} room={room} elevation={level?.elevation ?? 0} bounds={bounds} selected={highlighted.has(room.id)} onSelect={() => choose({ kind: "room", id: room.id })} />;
        })}

        {project.levels.map((level) => {
          if (!level.plan || !visibleLevelIds.has(level.id)) return null;
          const selectedWall = selected?.kind === "wall"
            ? project.walls.find((wall) => wall.id === selected.id && wall.levelId === level.id)
            : null;
          const selectedWallIds = new Set(project.walls.filter((wall) => wall.levelId === level.id && highlighted.has(wall.id) && wall.sourceWallId).map((wall) => wall.sourceWallId!));
          const hiddenWallIds = new Set(project.walls.filter((wall) => wall.levelId === level.id && hiddenIds.has(wall.id) && wall.sourceWallId).map((wall) => wall.sourceWallId!));
          return (
            <group key={level.id} name={`level:${level.id}`}>
              {!hiddenKinds.has("wall") ? <group name={`walls:${level.id}`}><RoomShell
                room={level.plan}
                offset={[-bounds.centreX * MM, level.elevation * MM, bounds.centreY * MM]}
                showFloor={false}
                selectedWallId={selectedWall?.sourceWallId ?? null}
                selectedWallIds={selectedWallIds}
                hiddenWallIds={hiddenWallIds}
                wallColor={project.facade.primaryColor}
                onSelectWall={(sourceWallId) =>
                  choose({ kind: "wall", id: wallObjectId(level.id, sourceWallId) })
                }
              /></group> : null}
              <OpeningMeshes
                project={project}
                levelId={level.id}
                room={level.plan}
                elevation={level.elevation}
                bounds={bounds}
                selectedIds={highlighted}
                hiddenKinds={hiddenKinds}
                hiddenIds={hiddenIds}
                onSelect={choose}
              />
              {!hiddenKinds.has("wall") ? <InteriorWallMeshes project={project} levelId={level.id} bounds={bounds} selectedIds={highlighted} hiddenIds={hiddenIds} onSelect={choose} /> : null}
            </group>
          );
        })}

        {!hiddenKinds.has("slab") && project.slabs.filter((slab) => visible("slab", slab.id, slab.levelId)).map((slab) => (
          <group key={slab.id} name={slab.id}><SlabMesh slab={slab} bounds={bounds} selected={highlighted.has(slab.id)} onSelect={() => choose({ kind: "slab", id: slab.id })} /></group>
        ))}
        {!hiddenKinds.has("ceiling") && project.ceilings.filter((ceiling) => visible("ceiling", ceiling.id, ceiling.levelId)).map((ceiling) => (
          <group key={ceiling.id} name={ceiling.id}><CeilingMesh ceiling={ceiling} bounds={bounds} selected={highlighted.has(ceiling.id)} onSelect={() => choose({ kind: "ceiling", id: ceiling.id })} /></group>
        ))}
        {!hiddenKinds.has("veranda") && project.verandas.filter((veranda) => visible("veranda", veranda.id, veranda.levelId)).map((veranda) => (
          <VerandaMesh key={veranda.id} veranda={veranda} bounds={bounds} selected={highlighted.has(veranda.id)} onSelect={() => choose({ kind: "veranda", id: veranda.id })} />
        ))}
        {!hiddenKinds.has("balcony") && project.balconies.filter((balcony) => visible("balcony", balcony.id, balcony.levelId)).map((balcony) => (
          <BalconyMesh key={balcony.id} balcony={balcony} bounds={bounds} selected={highlighted.has(balcony.id)} onSelect={() => choose({ kind: "balcony", id: balcony.id })} />
        ))}
        {!hiddenKinds.has("stair") && project.stairs.filter((stair) => visible("stair", stair.id, stair.levelId)).map((stair) => (
          <group key={stair.id} name={stair.id}><StairMesh stair={stair} bounds={bounds} selected={highlighted.has(stair.id)} onSelect={() => choose({ kind: "stair", id: stair.id })} /></group>
        ))}
        {!hiddenKinds.has("column") && project.structuralColumns.filter((column) => visible("column", column.id, column.levelId)).map((column) => (
          <group key={column.id} name={column.id}><ColumnMesh column={column} bounds={bounds} selected={highlighted.has(column.id)} onSelect={() => choose({ kind: "column", id: column.id })} /></group>
        ))}
        {!hiddenKinds.has("beam") && project.structuralBeams.filter((beam) => visible("beam", beam.id, beam.levelId)).map((beam) => (
          <group key={beam.id} name={beam.id}><BeamMesh beam={beam} bounds={bounds} selected={highlighted.has(beam.id)} onSelect={() => choose({ kind: "beam", id: beam.id })} /></group>
        ))}
        {!hiddenKinds.has("grid") && project.structuralGrid.filter((grid) => visible("grid", grid.id, grid.levelId)).map((grid) => (
          <GridMesh key={grid.id} grid={grid} elevation={project.levels.find((level) => level.id === grid.levelId)?.elevation ?? 0} bounds={bounds} selected={highlighted.has(grid.id)} onSelect={() => choose({ kind: "grid", id: grid.id })} />
        ))}
        {!hiddenKinds.has("roof") && project.roofs.filter((roof) => visible("roof", roof.id, roof.levelId)).map((roof) => (
          <group key={roof.id} name={roof.id}><RoofMesh roof={roof} bounds={bounds} color={project.facade.roofColor} selected={highlighted.has(roof.id)} onSelect={() => choose({ kind: "roof", id: roof.id })} /></group>
        ))}
        {!hiddenKinds.has("facade") && project.facadeElements.filter((element) => visible("facade", element.id, element.levelId)).map((element) => (
          <FacadeElementMesh key={element.id} element={element} project={project} bounds={bounds} selected={highlighted.has(element.id)} onSelect={() => choose({ kind: "facade", id: element.id })} />
        ))}

        {!hiddenKinds.has("foundation") && project.foundations.filter((item) => visible("foundation", item.id, item.levelId)).map((item) => <group key={item.id} name={item.id}><BoxObjectMesh x={item.x} y={item.y} elevation={item.elevation} width={item.width} height={item.thickness} depth={item.depth} bounds={bounds} selected={highlighted.has(item.id)} color="#8f969e" onSelect={() => choose({ kind: "foundation", id: item.id })} /></group>)}
        {!hiddenKinds.has("component") && project.components.filter((item) => visible("component", item.id, item.levelId)).map((item) => <BoxObjectMesh key={item.id} x={item.x} y={item.y} elevation={item.elevation} width={item.width} height={item.height} depth={item.depth} rotation={item.rotation} bounds={bounds} selected={highlighted.has(item.id)} color={item.material.toLowerCase().includes("wood") ? "#9d7350" : "#d5d0c8"} onSelect={() => choose({ kind: "component", id: item.id })} />)}
        {!hiddenKinds.has("railing") && project.railings.filter((item) => visible("railing", item.id, item.levelId)).map((item) => <LineObjectMesh key={item.id} start={item.start} end={item.end} elevation={item.elevation} height={item.height} bounds={bounds} selected={highlighted.has(item.id)} color="#56616c" onSelect={() => choose({ kind: "railing", id: item.id })} />)}
        {!hiddenKinds.has("reference-plane") && project.referencePlanes.filter((item) => visible("reference-plane", item.id, item.levelId)).map((item) => <LineObjectMesh key={item.id} start={item.start} end={item.end} elevation={project.levels.find((level) => level.id === item.levelId)?.elevation ?? 0} height={25} bounds={bounds} selected={highlighted.has(item.id)} color="#de3c8d" onSelect={() => choose({ kind: "reference-plane", id: item.id })} />)}

        <CameraRig bounds={bounds} view={view} />
      </Canvas>
      <ViewButtons view={view} onChange={setView} />
    </div>
  );
}

function OpeningMeshes({
  project,
  levelId,
  room,
  elevation,
  bounds,
  selectedIds,
  hiddenKinds,
  hiddenIds,
  onSelect,
}: {
  project: HouseProject;
  levelId: string;
  room: Room;
  elevation: number;
  bounds: Bounds;
  selectedIds: ReadonlySet<string>;
  hiddenKinds: ReadonlySet<HouseSelection["kind"]>;
  hiddenIds: ReadonlySet<string>;
  onSelect: (selection: HouseSelection) => void;
}) {
  return room.openings.map((opening) => {
    const id = openingObjectId(levelId, opening.kind, opening.id);
    const record = [...project.doors, ...project.windows].find((item) => item.id === id);
    const wall = record ? project.walls.find((item) => item.id === record.wallId) : null;
    if (!wall) return null;
    const length = Math.max(1, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y));
    const dx = (wall.end.x - wall.start.x) / length;
    const dy = (wall.end.y - wall.start.y) / length;
    const middle = opening.offset + opening.width / 2;
    const x = wall.start.x + dx * middle;
    const y = wall.start.y + dy * middle;
    const kind = opening.kind === "window" ? "window" : "door";
    if (hiddenKinds.has(kind) || hiddenIds.has(id)) return null;
    const highlighted = selectedIds.has(id);
    const passage = opening.kind === "passage";

    return (
      <mesh
        key={id}
        name={id}
        position={[
          (x - bounds.centreX) * MM,
          (elevation + opening.sill + opening.height / 2) * MM,
          -(y - bounds.centreY) * MM,
        ]}
        rotation={[0, Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x), 0]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect({ kind, id });
        }}
      >
        <boxGeometry args={[opening.width * MM, opening.height * MM, Math.max(35, wall.thickness * 0.35) * MM]} />
        <meshStandardMaterial
          color={highlighted ? "#1473e6" : opening.kind === "window" ? project.facade.windowFrameColor : project.facade.doorColor}
          transparent={opening.kind === "window" || passage}
          opacity={passage ? 0.16 : opening.kind === "window" ? 0.5 : 1}
          roughness={record?.material === "Aluminium" ? 0.3 : 0.75}
        />
      </mesh>
    );
  });
}

function RoomSurfaceMesh({ room, elevation, bounds, selected, onSelect }: { room: HouseRoom; elevation: number; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const shape = useMemo(() => polygonShape(room.boundary, bounds), [bounds, room.boundary]);
  return (
    <mesh position={[0, (elevation + 2) * MM, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={selected ? "#1473e6" : "#d8d2c8"} roughness={1} transparent opacity={selected ? 0.8 : 0.62} side={THREE.DoubleSide} />
    </mesh>
  );
}

function InteriorWallMeshes({ project, levelId, bounds, selectedIds, hiddenIds, onSelect }: { project: HouseProject; levelId: string; bounds: Bounds; selectedIds: ReadonlySet<string>; hiddenIds: ReadonlySet<string>; onSelect: (selection: HouseSelection) => void }) {
  const level = project.levels.find((item) => item.id === levelId);
  const exteriorIds = new Set(level?.plan?.corners.map((corner) => corner.id) ?? []);
  const walls = project.walls.filter((wall) => wall.levelId === levelId && !hiddenIds.has(wall.id) && (!wall.sourceWallId || !exteriorIds.has(wall.sourceWallId)));
  return walls.flatMap((wall) => wallSegments(wall, [...project.doors, ...project.windows].filter((opening) => opening.wallId === wall.id)).map((segment) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const along = ((segment.from + segment.to) / 2) / length;
    const x = wall.start.x + dx * along;
    const y = wall.start.y + dy * along;
    return (
      <mesh
        key={`${wall.id}:${segment.id}`}
        position={[(x - bounds.centreX) * MM, (segment.bottom + (segment.top - segment.bottom) / 2 + (level?.elevation ?? 0)) * MM, -(y - bounds.centreY) * MM]}
        rotation={[0, Math.atan2(dy, dx), 0]}
        onClick={(event) => { event.stopPropagation(); onSelect({ kind: "wall", id: wall.id }); }}
      >
        <boxGeometry args={[(segment.to - segment.from) * MM, (segment.top - segment.bottom) * MM, wall.thickness * MM]} />
        <meshStandardMaterial color={selectedIds.has(wall.id) ? "#1473e6" : "#ddd8cf"} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
    );
  }));
}

function wallSegments(wall: HouseWall, openings: HouseProject["doors"]) {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const segments: { id: string; from: number; to: number; bottom: number; top: number }[] = [];
  const add = (id: string, from: number, to: number, bottom: number, top: number) => {
    if (to - from > 1 && top - bottom > 1) segments.push({ id, from, to, bottom, top });
  };
  let cursor = 0;
  for (const opening of [...openings].sort((a, b) => a.offset - b.offset)) {
    add(`before-${opening.id}`, cursor, opening.offset, 0, wall.height);
    if (opening.sillHeight > 0) add(`under-${opening.id}`, opening.offset, opening.offset + opening.width, 0, opening.sillHeight);
    const head = opening.sillHeight + opening.height;
    if (head < wall.height) add(`over-${opening.id}`, opening.offset, opening.offset + opening.width, head, wall.height);
    cursor = Math.max(cursor, opening.offset + opening.width);
  }
  add("end", cursor, length, 0, wall.height);
  return segments;
}

function SlabMesh({ slab, bounds, selected, onSelect }: { slab: HouseSlab; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const shape = useMemo(() => polygonShape(slab.boundary, bounds), [bounds, slab.boundary]);
  return (
    <mesh
      position={[0, (slab.elevation - slab.thickness) * MM, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
    >
      <extrudeGeometry args={[shape, { depth: slab.thickness * MM, bevelEnabled: false }]} />
      <meshStandardMaterial color={selected ? "#1473e6" : "#c9c3b9"} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SiteMesh({ site, bounds, selected, onSelect }: { site: HouseSite; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const shape = useMemo(() => polygonShape(site.boundary, bounds), [bounds, site.boundary]);
  return (
    <mesh position={[0, (site.elevation - site.thickness) * MM, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <extrudeGeometry args={[shape, { depth: site.thickness * MM, bevelEnabled: false }]} />
      <meshStandardMaterial color={selected ? "#1473e6" : "#8b9b72"} roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CeilingMesh({ ceiling, bounds, selected, onSelect }: { ceiling: HouseCeiling; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const shape = useMemo(() => polygonShape(ceiling.boundary, bounds), [bounds, ceiling.boundary]);
  return (
    <mesh position={[0, (ceiling.elevation - ceiling.thickness) * MM, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <extrudeGeometry args={[shape, { depth: ceiling.thickness * MM, bevelEnabled: false }]} />
      <meshStandardMaterial color={selected ? "#1473e6" : "#f1efe8"} roughness={0.92} transparent opacity={selected ? 0.9 : 0.42} side={THREE.DoubleSide} />
    </mesh>
  );
}

function BalconyMesh({ balcony, bounds, selected, onSelect }: { balcony: HouseBalcony; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const colour = selected ? "#1473e6" : "#a7adb4";
  const railThickness = 45;
  const railY = balcony.thickness / 2 + balcony.railingHeight / 2;
  return (
    <group
      position={[(balcony.x - bounds.centreX) * MM, (balcony.elevation - balcony.thickness / 2) * MM, -(balcony.y - bounds.centreY) * MM]}
      rotation={[0, balcony.rotation * Math.PI / 180, 0]}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
    >
      <mesh><boxGeometry args={[balcony.width * MM, balcony.thickness * MM, balcony.depth * MM]} /><meshStandardMaterial color={colour} roughness={0.88} /></mesh>
      <mesh position={[0, railY * MM, (balcony.depth / 2 - railThickness / 2) * MM]}><boxGeometry args={[balcony.width * MM, balcony.railingHeight * MM, railThickness * MM]} /><meshStandardMaterial color={colour} roughness={0.45} transparent opacity={selected ? 1 : 0.68} /></mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * (balcony.width / 2 - railThickness / 2) * MM, railY * MM, 0]}>
          <boxGeometry args={[railThickness * MM, balcony.railingHeight * MM, balcony.depth * MM]} />
          <meshStandardMaterial color={colour} roughness={0.45} transparent opacity={selected ? 1 : 0.68} />
        </mesh>
      ))}
    </group>
  );
}

function VerandaMesh({ veranda, bounds, selected, onSelect }: { veranda: HouseVeranda; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const colour = selected ? "#1473e6" : "#9d8c78";
  const post = 90;
  const canopyThickness = 90;
  return (
    <group
      position={[(veranda.x - bounds.centreX) * MM, (veranda.elevation - veranda.thickness / 2) * MM, -(veranda.y - bounds.centreY) * MM]}
      rotation={[0, veranda.rotation * Math.PI / 180, 0]}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
    >
      <mesh><boxGeometry args={[veranda.width * MM, veranda.thickness * MM, veranda.depth * MM]} /><meshStandardMaterial color={colour} roughness={0.95} /></mesh>
      <mesh position={[0, (veranda.canopyHeight + veranda.thickness / 2) * MM, 0]}>
        <boxGeometry args={[veranda.width * MM, canopyThickness * MM, veranda.depth * MM]} />
        <meshStandardMaterial color={selected ? "#1473e6" : "#747b80"} roughness={0.72} />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * (veranda.width / 2 - post / 2) * MM, (veranda.canopyHeight / 2 + veranda.thickness / 2) * MM, (veranda.depth / 2 - post / 2) * MM]}>
          <boxGeometry args={[post * MM, veranda.canopyHeight * MM, post * MM]} />
          <meshStandardMaterial color={colour} roughness={0.68} />
        </mesh>
      ))}
    </group>
  );
}

function StairMesh({ stair, bounds, selected, onSelect }: { stair: HouseStair; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const tread = stair.length / stair.steps;
  const rise = stair.height / stair.steps;
  return (
    <group
      position={[(stair.x - bounds.centreX) * MM, stair.elevation * MM, -(stair.y - bounds.centreY) * MM]}
      rotation={[0, (-stair.rotation * Math.PI) / 180, 0]}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
    >
      {Array.from({ length: stair.steps }, (_, index) => (
        <mesh
          key={index}
          position={[
            (stair.width / 2) * MM,
            (rise * (index + 1) / 2) * MM,
            -(tread * (index + 0.5)) * MM,
          ]}
        >
          <boxGeometry args={[stair.width * MM, rise * (index + 1) * MM, tread * MM]} />
          <meshStandardMaterial color={selected ? "#1473e6" : "#bdb7ad"} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function ColumnMesh({ column, bounds, selected, onSelect }: { column: HouseStructuralColumn; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  return (
    <mesh position={[(column.x - bounds.centreX) * MM, (column.elevation + column.height / 2) * MM, -(column.y - bounds.centreY) * MM]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <boxGeometry args={[column.width * MM, column.height * MM, column.depth * MM]} />
      <meshStandardMaterial color={selected ? "#1473e6" : "#9e9a92"} roughness={0.92} transparent opacity={selected ? 1 : 0.72} />
    </mesh>
  );
}

function BeamMesh({ beam, bounds, selected, onSelect }: { beam: HouseStructuralBeam; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const dx = beam.end.x - beam.start.x;
  const dy = beam.end.y - beam.start.y;
  const length = Math.hypot(dx, dy);
  return (
    <mesh
      position={[
        ((beam.start.x + beam.end.x) / 2 - bounds.centreX) * MM,
        (beam.elevation + beam.depth / 2) * MM,
        -((beam.start.y + beam.end.y) / 2 - bounds.centreY) * MM,
      ]}
      rotation={[0, Math.atan2(dy, dx), 0]}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
    >
      <boxGeometry args={[length * MM, beam.depth * MM, beam.width * MM]} />
      <meshStandardMaterial color={selected ? "#1473e6" : "#8c8983"} roughness={0.92} transparent opacity={selected ? 1 : 0.76} />
    </mesh>
  );
}

function GridMesh({ grid, elevation, bounds, selected, onSelect }: { grid: HouseStructuralGrid; elevation: number; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const dx = grid.end.x - grid.start.x;
  const dy = grid.end.y - grid.start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return (
    <mesh position={[((grid.start.x + grid.end.x) / 2 - bounds.centreX) * MM, (elevation + 12) * MM, -((grid.start.y + grid.end.y) / 2 - bounds.centreY) * MM]} rotation={[0, Math.atan2(dy, dx), 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <boxGeometry args={[length * MM, 0.008, 0.012]} />
      <meshStandardMaterial color={selected ? "#1473e6" : "#d28b26"} transparent opacity={selected ? 1 : 0.65} />
    </mesh>
  );
}

function RoofMesh({ roof, bounds, color, selected, onSelect }: { roof: HouseRoof; bounds: Bounds; color: string; selected: boolean; onSelect: () => void }) {
  const roofBounds = boundaryBounds(roof.boundary);
  const colour = selected ? "#1473e6" : color;
  if (roof.type === "flat") {
    const shape = polygonShape(roof.boundary, bounds);
    return (
      <mesh position={[0, roof.elevation * MM, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
        <extrudeGeometry args={[shape, { depth: roof.thickness * MM, bevelEnabled: false }]} />
        <meshStandardMaterial color={colour} roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
    );
  }

  // An L or T is roofed as the rectangles it is made of, each with its own
  // ridge, the way a wing's roof meets the main one.
  const parts = roofRectangles(roof.boundary) ?? [{ minX: roofBounds.minX, minY: roofBounds.minY, maxX: roofBounds.maxX, maxY: roofBounds.maxY }];
  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {parts.map((part, index) => {
        const width = part.maxX - part.minX + roof.overhang * 2;
        const depth = part.maxY - part.minY + roof.overhang * 2;
        return (
          <mesh key={index} position={[((part.minX + part.maxX) / 2 - bounds.centreX) * MM, roof.elevation * MM, -((part.minY + part.maxY) / 2 - bounds.centreY) * MM]}>
            <PitchedRoofGeometry width={width * MM} depth={depth * MM} rise={pitchedRise(roof, width, depth) * MM} thickness={roof.thickness * MM} hip={roof.type === "hip"} />
            <meshStandardMaterial color={colour} roughness={0.82} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

type Rectangle = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * An outline with square corners as overlapping rectangles that together
 * cover it: the largest first, then the largest still reaching something
 * uncovered. Null when a wall runs at an angle — that roof keeps its
 * bounding rectangle.
 */
export function roofRectangles(boundary: readonly { x: number; y: number }[]): Rectangle[] | null {
  const square = boundary.every((point, index) => { const next = boundary[(index + 1) % boundary.length]!; return Math.abs(point.x - next.x) < 1 || Math.abs(point.y - next.y) < 1; });
  if (!square) return null;
  const xs = [...new Set(boundary.map((point) => Math.round(point.x)))].sort((a, b) => a - b);
  const ys = [...new Set(boundary.map((point) => Math.round(point.y)))].sort((a, b) => a - b);
  const inside = (x: number, y: number) => {
    let result = false;
    for (let index = 0, previous = boundary.length - 1; index < boundary.length; previous = index, index += 1) {
      const a = boundary[index]!;
      const b = boundary[previous]!;
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };
  const cells = xs.slice(0, -1).map((x, i) => ys.slice(0, -1).map((y, j) => inside((x + xs[i + 1]!) / 2, (y + ys[j + 1]!) / 2)));
  const covered = cells.map((column) => column.map(() => false));
  const rectangles: Rectangle[] = [];
  for (let guard = 0; guard < 32 && cells.some((column, i) => column.some((cell, j) => cell && !covered[i]![j])); guard += 1) {
    let best: { i0: number; i1: number; j0: number; j1: number; area: number } | null = null;
    for (let i0 = 0; i0 < cells.length; i0 += 1) for (let i1 = i0; i1 < cells.length; i1 += 1) {
      for (let j0 = 0; j0 < cells[0]!.length; j0 += 1) for (let j1 = j0; j1 < cells[0]!.length; j1 += 1) {
        let full = true;
        let fresh = false;
        for (let i = i0; i <= i1 && full; i += 1) for (let j = j0; j <= j1; j += 1) { if (!cells[i]![j]) { full = false; break; } if (!covered[i]![j]) fresh = true; }
        if (!full || !fresh) continue;
        const area = (xs[i1 + 1]! - xs[i0]!) * (ys[j1 + 1]! - ys[j0]!);
        if (!best || area > best.area) best = { i0, i1, j0, j1, area };
      }
    }
    if (!best) break;
    for (let i = best.i0; i <= best.i1; i += 1) for (let j = best.j0; j <= best.j1; j += 1) covered[i]![j] = true;
    rectangles.push({ minX: xs[best.i0]!, maxX: xs[best.i1 + 1]!, minY: ys[best.j0]!, maxY: ys[best.j1 + 1]! });
  }
  return rectangles.length ? rectangles : null;
}

/** How high a pitched roof rises over its eaves: the slope across the
 * shorter span decides it, so the planes meet at the ridge whatever the
 * span; a roof with no slope falls back to its stated height. */
export function pitchedRise(roof: Pick<HouseRoof, "slope" | "height">, width: number, depth: number) {
  const half = Math.min(width, depth) / 2;
  return roof.slope > 0 ? Math.tan((Math.min(roof.slope, 60) * Math.PI) / 180) * half : roof.height;
}

/**
 * A gable or hip roof over a rectangle, eaves at y = 0, ridge along the
 * longer side. Gable: the ridge runs the full length and the ends are
 * vertical triangles. Hip: the ridge is shortened by half the span at each
 * end, so all four sides slope — on a square it becomes a pyramid.
 */
function PitchedRoofGeometry({ width, depth, rise, thickness = 0, hip }: { width: number; depth: number; rise: number; thickness?: number; hip: boolean }) {
  const geometry = useMemo(() => {
    const alongX = width >= depth;
    const long = alongX ? width : depth;
    const short = alongX ? depth : width;
    const ridge = hip ? Math.max(0, (long - short) / 2) : long / 2;
    const at = (along: number, across: number, y: number): Vec => alongX ? [along, y, across] : [across, y, along];
    const a = at(-long / 2, -short / 2, 0);
    const b = at(long / 2, -short / 2, 0);
    const c = at(long / 2, short / 2, 0);
    const d = at(-long / 2, short / 2, 0);
    const r1 = at(-ridge, 0, rise);
    const r2 = at(ridge, 0, rise);
    // Sloped faces are slabs of the roof's thickness, sitting on the walls;
    // a gable's end stays a thin wall, not a slab.
    const sloped: Vec[][] = [[a, b, r2, r1], [c, d, r1, r2]];
    const ends: Vec[][] = [[d, a, r1], [b, c, r2]];
    const triangles: number[] = [];
    for (const face of hip ? [...sloped, ...ends] : sloped) triangles.push(...slab(face, thickness));
    if (!hip) for (const face of ends) triangles.push(...fan(face));
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(triangles, 3));
    result.computeVertexNormals();
    return result;
  }, [width, depth, rise, thickness, hip]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

type Vec = [number, number, number];

function fan(face: readonly Vec[]): number[] {
  const out: number[] = [];
  for (let index = 1; index < face.length - 1; index += 1) out.push(...face[0]!, ...face[index]!, ...face[index + 1]!);
  return out;
}

/** A planar face thickened along its upward normal: underside, top, edges. */
function slab(face: readonly Vec[], thickness: number): number[] {
  if (thickness <= 0) return fan(face);
  const [p, q, r] = face;
  const u = [q![0] - p![0], q![1] - p![1], q![2] - p![2]];
  const v = [r![0] - p![0], r![1] - p![1], r![2] - p![2]];
  let n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  const length = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
  n = n.map((value) => value / length);
  if (n[1]! < 0) n = n.map((value) => -value);
  const top = face.map((point) => [point[0] + n[0]! * thickness, point[1] + n[1]! * thickness, point[2] + n[2]! * thickness] as Vec);
  const out = [...fan(face), ...fan(top)];
  for (let index = 0; index < face.length; index += 1) {
    const next = (index + 1) % face.length;
    out.push(...face[index]!, ...face[next]!, ...top[next]!, ...face[index]!, ...top[next]!, ...top[index]!);
  }
  return out;
}

function FacadeElementMesh({ element, project, bounds, selected, onSelect }: { element: HouseFacadeElement; project: HouseProject; bounds: Bounds; selected: boolean; onSelect: () => void }) {
  const wall = project.walls.find((item) => item.id === element.wallId);
  const level = project.levels.find((item) => item.id === element.levelId);
  if (!wall || !level?.plan) return null;
  const sourceWall = roomWalls(level.plan).find((item) => item.id === wall.sourceWallId);
  if (!sourceWall) return null;
  const dx = (wall.end.x - wall.start.x) / sourceWall.length;
  const dy = (wall.end.y - wall.start.y) / sourceWall.length;
  const distance = element.offset + element.width / 2;
  const projection = wall.thickness / 2 + element.depth / 2;
  const x = wall.start.x + dx * distance - sourceWall.inward.x * projection;
  const y = wall.start.y + dy * distance - sourceWall.inward.y * projection;
  return (
    <mesh
      position={[(x - bounds.centreX) * MM, (element.elevation + element.height / 2) * MM, -(y - bounds.centreY) * MM]}
      rotation={[0, Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x), 0]}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
    >
      <boxGeometry args={[element.width * MM, element.height * MM, element.depth * MM]} />
      <meshStandardMaterial color={selected ? "#1473e6" : element.color} roughness={0.86} />
    </mesh>
  );
}

function BoxObjectMesh({ x, y, elevation, width, height, depth, rotation = 0, bounds, selected, color, onSelect }: { x: number; y: number; elevation: number; width: number; height: number; depth: number; rotation?: number; bounds: Bounds; selected: boolean; color: string; onSelect: () => void }) {
  return (
    <mesh position={[(x - bounds.centreX) * MM, (elevation + height / 2) * MM, -(y - bounds.centreY) * MM]} rotation={[0, rotation * Math.PI / 180, 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <boxGeometry args={[width * MM, height * MM, depth * MM]} />
      <meshStandardMaterial color={selected ? "#1473e6" : color} roughness={0.78} />
    </mesh>
  );
}

function LineObjectMesh({ start, end, elevation, height, bounds, selected, color, onSelect }: { start: { x: number; y: number }; end: { x: number; y: number }; elevation: number; height: number; bounds: Bounds; selected: boolean; color: string; onSelect: () => void }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return (
    <mesh position={[((start.x + end.x) / 2 - bounds.centreX) * MM, (elevation + height / 2) * MM, -((start.y + end.y) / 2 - bounds.centreY) * MM]} rotation={[0, Math.atan2(dy, dx), 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <boxGeometry args={[length * MM, Math.max(20, height) * MM, 24 * MM]} />
      <meshStandardMaterial color={selected ? "#1473e6" : color} roughness={0.6} />
    </mesh>
  );
}

function CameraRig({ bounds, view }: { bounds: Bounds; view: View }) {
  const store = useStore();
  const element = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);

  useEffect(() => {
    const { camera } = store.getState();
    if (!(camera instanceof THREE.PerspectiveCamera) || size.width === 0) return;
    const span = Math.max(bounds.width, bounds.depth, bounds.height) * MM;
    const distance = Math.max(4, span * 1.55);
    const target = new THREE.Vector3(0, bounds.height * MM * 0.45, 0);
    camera.aspect = size.width / size.height;
    if (view === "top") camera.position.set(0, distance * 1.25, 0.001);
    else if (view === "front") camera.position.set(0, target.y, distance);
    else if (view === "back") camera.position.set(0, target.y, -distance);
    else if (view === "left") camera.position.set(-distance, target.y, 0);
    else if (view === "right") camera.position.set(distance, target.y, 0);
    else camera.position.set(distance * 0.72, distance * 0.58, distance);
    camera.near = Math.max(0.01, distance / 100);
    camera.far = distance * 15;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    invalidate();
  }, [bounds, invalidate, size.height, size.width, store, view]);

  useEffect(() => {
    const { camera } = store.getState();
    const target = new THREE.Vector3(0, bounds.height * MM * 0.45, 0);
    const orbit = new OrbitControls(camera, element);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI * 0.495;
    orbit.target.copy(target);
    const changed = () => invalidate();
    orbit.addEventListener("change", changed);
    orbit.update();
    return () => {
      orbit.removeEventListener("change", changed);
      orbit.dispose();
    };
  }, [bounds.height, element, invalidate, store, view]);

  return null;
}

function ViewButtons({ view: currentView, onChange }: { view: View; onChange: (view: View) => void }) {
  const views: { id: View; label: string }[] = [
    { id: "3d", label: "3D" },
    { id: "top", label: "Top" },
    { id: "front", label: "Front" },
    { id: "back", label: "Back" },
    { id: "left", label: "Left" },
    { id: "right", label: "Right" },
  ];
  return (
    <div className="pointer-events-none absolute left-3 right-3 top-3 overflow-x-auto">
      <div className="pointer-events-auto flex w-max rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur">
        {views.map((item) => (
          <button key={item.id} type="button" onClick={() => onChange(item.id)} aria-pressed={item.id === currentView} className={cn("rounded-full px-3 py-1 text-xs", item.id === currentView ? "bg-brand text-brand-foreground" : "text-muted-foreground")}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Bounds = ReturnType<typeof projectBounds>;

function projectBounds(project: HouseProject) {
  const platforms = [...project.balconies, ...project.verandas];
  const platformPoints = platforms.flatMap((item) => rotatedRectanglePoints(item.x, item.y, item.width, item.depth, item.rotation));
  const points = [
    ...project.rooms.flatMap((room) => room.boundary),
    ...(project.site?.boundary ?? []),
    ...platformPoints,
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const roofTop = Math.max(...project.roofs.map((roof) => roof.elevation + roof.height), 0);
  const wallTop = Math.max(...project.levels.map((level) => level.elevation + (level.plan?.ceilingHeight ?? 0)), 1);
  const balconyTop = Math.max(...project.balconies.map((item) => item.elevation + item.railingHeight), 0);
  const verandaTop = Math.max(...project.verandas.map((item) => item.elevation + item.canopyHeight), 0);
  const ceilingTop = Math.max(...project.ceilings.map((item) => item.elevation), 0);
  return {
    centreX: (minX + maxX) / 2,
    centreY: (minY + maxY) / 2,
    width: maxX - minX,
    depth: maxY - minY,
    height: Math.max(roofTop, wallTop, balconyTop, verandaTop, ceilingTop),
  };
}

function rotatedRectanglePoints(x: number, y: number, width: number, depth: number, rotation: number) {
  const angle = rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return ([-1, 1] as const).flatMap((sideX) => ([-1, 1] as const).map((sideY) => {
    const localX = sideX * width / 2;
    const localY = sideY * depth / 2;
    return { x: x + localX * cos - localY * sin, y: y + localX * sin + localY * cos };
  }));
}

function polygonShape(points: { x: number; y: number }[], bounds: Bounds) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    const x = (point.x - bounds.centreX) * MM;
    const y = (point.y - bounds.centreY) * MM;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function boundaryBounds(points: { x: number; y: number }[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, depth: maxY - minY };
}
