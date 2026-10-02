"use client";

import { useEffect, useMemo, useState } from "react";
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
  onSelect,
  className,
}: {
  project: HouseProject;
  visibleLevelIds: ReadonlySet<string>;
  selected: HouseSelection | null;
  onSelect: (selection: HouseSelection | null) => void;
  className?: string;
}) {
  const bounds = useMemo(() => projectBounds(project), [project]);
  const [view, setView] = useState<View>("3d");

  return (
    <div className={cn("relative min-h-[320px] w-full min-w-0 overflow-hidden rounded-xl border bg-muted/25", className)}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 38, near: 0.02, far: 200 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", maxWidth: "100%", minWidth: 0, touchAction: "none" }}
        onPointerMissed={() => onSelect(null)}
      >
        <ambientLight intensity={0.72} />
        <directionalLight position={[8, 14, 9]} intensity={1.4} />
        <directionalLight position={[-7, 8, -5]} intensity={0.42} />

        {project.site && visibleLevelIds.has(project.site.levelId) ? (
          <SiteMesh site={project.site} bounds={bounds} selected={selected?.id === project.site.id} onSelect={() => onSelect({ kind: "site", id: project.site!.id })} />
        ) : null}

        {project.rooms.filter((room) => visibleLevelIds.has(room.levelId)).map((room) => {
          const level = project.levels.find((item) => item.id === room.levelId);
          return <RoomSurfaceMesh key={room.id} room={room} elevation={level?.elevation ?? 0} bounds={bounds} selected={selected?.id === room.id} onSelect={() => onSelect({ kind: "room", id: room.id })} />;
        })}

        {project.levels.map((level) => {
          if (!level.plan || !visibleLevelIds.has(level.id)) return null;
          const selectedWall = selected?.kind === "wall"
            ? project.walls.find((wall) => wall.id === selected.id && wall.levelId === level.id)
            : null;
          return (
            <group key={level.id}>
              <RoomShell
                room={level.plan}
                offset={[-bounds.centreX * MM, level.elevation * MM, bounds.centreY * MM]}
                showFloor={false}
                selectedWallId={selectedWall?.sourceWallId ?? null}
                wallColor={project.facade.primaryColor}
                onSelectWall={(sourceWallId) =>
                  onSelect({ kind: "wall", id: wallObjectId(level.id, sourceWallId) })
                }
              />
              <OpeningMeshes
                project={project}
                levelId={level.id}
                room={level.plan}
                elevation={level.elevation}
                bounds={bounds}
                selected={selected}
                onSelect={onSelect}
              />
              <InteriorWallMeshes project={project} levelId={level.id} bounds={bounds} selected={selected} onSelect={onSelect} />
            </group>
          );
        })}

        {project.slabs.filter((slab) => visibleLevelIds.has(slab.levelId)).map((slab) => (
          <SlabMesh key={slab.id} slab={slab} bounds={bounds} selected={selected?.id === slab.id} onSelect={() => onSelect({ kind: "slab", id: slab.id })} />
        ))}
        {project.ceilings.filter((ceiling) => visibleLevelIds.has(ceiling.levelId)).map((ceiling) => (
          <CeilingMesh key={ceiling.id} ceiling={ceiling} bounds={bounds} selected={selected?.id === ceiling.id} onSelect={() => onSelect({ kind: "ceiling", id: ceiling.id })} />
        ))}
        {project.verandas.filter((veranda) => visibleLevelIds.has(veranda.levelId)).map((veranda) => (
          <VerandaMesh key={veranda.id} veranda={veranda} bounds={bounds} selected={selected?.id === veranda.id} onSelect={() => onSelect({ kind: "veranda", id: veranda.id })} />
        ))}
        {project.balconies.filter((balcony) => visibleLevelIds.has(balcony.levelId)).map((balcony) => (
          <BalconyMesh key={balcony.id} balcony={balcony} bounds={bounds} selected={selected?.id === balcony.id} onSelect={() => onSelect({ kind: "balcony", id: balcony.id })} />
        ))}
        {project.stairs.filter((stair) => visibleLevelIds.has(stair.levelId)).map((stair) => (
          <StairMesh key={stair.id} stair={stair} bounds={bounds} selected={selected?.id === stair.id} onSelect={() => onSelect({ kind: "stair", id: stair.id })} />
        ))}
        {project.structuralColumns.filter((column) => visibleLevelIds.has(column.levelId)).map((column) => (
          <ColumnMesh key={column.id} column={column} bounds={bounds} selected={selected?.id === column.id} onSelect={() => onSelect({ kind: "column", id: column.id })} />
        ))}
        {project.structuralBeams.filter((beam) => visibleLevelIds.has(beam.levelId)).map((beam) => (
          <BeamMesh key={beam.id} beam={beam} bounds={bounds} selected={selected?.id === beam.id} onSelect={() => onSelect({ kind: "beam", id: beam.id })} />
        ))}
        {project.structuralGrid.filter((grid) => visibleLevelIds.has(grid.levelId)).map((grid) => (
          <GridMesh key={grid.id} grid={grid} elevation={project.levels.find((level) => level.id === grid.levelId)?.elevation ?? 0} bounds={bounds} selected={selected?.id === grid.id} onSelect={() => onSelect({ kind: "grid", id: grid.id })} />
        ))}
        {project.roofs.filter((roof) => visibleLevelIds.has(roof.levelId)).map((roof) => (
          <RoofMesh key={roof.id} roof={roof} bounds={bounds} color={project.facade.roofColor} selected={selected?.id === roof.id} onSelect={() => onSelect({ kind: "roof", id: roof.id })} />
        ))}
        {project.facadeElements.filter((element) => visibleLevelIds.has(element.levelId)).map((element) => (
          <FacadeElementMesh key={element.id} element={element} project={project} bounds={bounds} selected={selected?.id === element.id} onSelect={() => onSelect({ kind: "facade", id: element.id })} />
        ))}

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
  selected,
  onSelect,
}: {
  project: HouseProject;
  levelId: string;
  room: Room;
  elevation: number;
  bounds: Bounds;
  selected: HouseSelection | null;
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
    const highlighted = selected?.id === id;
    const passage = opening.kind === "passage";

    return (
      <mesh
        key={id}
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

function InteriorWallMeshes({ project, levelId, bounds, selected, onSelect }: { project: HouseProject; levelId: string; bounds: Bounds; selected: HouseSelection | null; onSelect: (selection: HouseSelection) => void }) {
  const level = project.levels.find((item) => item.id === levelId);
  const exteriorIds = new Set(level?.plan?.corners.map((corner) => corner.id) ?? []);
  const walls = project.walls.filter((wall) => wall.levelId === levelId && (!wall.sourceWallId || !exteriorIds.has(wall.sourceWallId)));
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
        <meshStandardMaterial color={selected?.id === wall.id ? "#1473e6" : "#ddd8cf"} roughness={0.95} side={THREE.DoubleSide} />
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

  const width = roofBounds.width + roof.overhang * 2;
  const depth = roofBounds.depth + roof.overhang * 2;
  const centreX = (roofBounds.minX + roofBounds.maxX) / 2;
  const centreY = (roofBounds.minY + roofBounds.maxY) / 2;
  if (roof.type === "hip") {
    return (
      <mesh
        position={[(centreX - bounds.centreX) * MM, (roof.elevation + roof.height / 2) * MM, -(centreY - bounds.centreY) * MM]}
        rotation={[0, Math.PI / 4, 0]}
        scale={[width * MM / Math.SQRT2, roof.height * MM, depth * MM / Math.SQRT2]}
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
      >
        <coneGeometry args={[0.5, 1, 4]} />
        <meshStandardMaterial color={colour} roughness={0.82} />
      </mesh>
    );
  }

  const angle = Math.max(5, roof.slope || 25) * Math.PI / 180;
  const half = width / 2;
  const rise = Math.min(roof.height, Math.tan(angle) * half);
  const span = Math.hypot(half, rise);
  return (
    <group position={[(centreX - bounds.centreX) * MM, roof.elevation * MM, -(centreY - bounds.centreY) * MM]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * half * 0.5 * MM, rise * 0.5 * MM, 0]} rotation={[0, 0, side * -angle]}>
          <boxGeometry args={[span * MM, roof.thickness * MM, depth * MM]} />
          <meshStandardMaterial color={colour} roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
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
