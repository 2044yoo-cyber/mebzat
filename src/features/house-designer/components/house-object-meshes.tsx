"use client";

import { useMemo } from "react";
import * as THREE from "three";

import { definitionOf, type ModelId } from "../services/object-library";
import { stairGeometry, stairParams } from "../services/stair-geometry";
import type { HouseProject } from "../types/project";

/**
 * The 3D of the objects on the plan, from the same records the plan draws:
 * one object, two views. Plan (x, y) is scene (x, −z); millimetres in, metres
 * out. An object turns about its centre by its rotation, as on the plan.
 */

const MM = 0.001;
type Centre = { centreX: number; centreY: number };
type Part = { x: number; y: number; z: number; w: number; h: number; d: number; color: string; round?: boolean };

const COLORS: Record<string, string> = { Fabric: "#8b9bb4", Timber: "#b08a62", MDF: "#d9d2c5", "Stainless steel": "#c7ccd1", Steel: "#e3e5e8", Ceramic: "#f4f4f2", Acrylic: "#f7f7f7", Generic: "#c9c3b8" };

/** A model's parts in its own frame: x across, y up from the floor, z from back (−) to front (+). */
function parts(model: ModelId, w: number, d: number, h: number, material: string): Part[] {
  const main = COLORS[material] ?? COLORS.Generic!;
  const box = (x: number, y: number, z: number, pw: number, ph: number, pd: number, color = main, round = false): Part => ({ x, y, z, w: pw, h: ph, d: pd, color, round });
  switch (model) {
    case "bed": return [box(0, h * 0.3, 0, w, h * 0.6, d, "#a07c58"), box(0, h * 0.75, d * 0.02, w - 40, h * 0.35, d - 80, "#f2f0ea"), box(0, 450, -d / 2 + 40, w, 900, 80, "#8a6a4a")];
    case "sofa": return [box(0, h * 0.25, d * 0.08, w, h * 0.5, d * 0.84), box(0, h * 0.55, -d / 2 + d * 0.11, w, h * 1.1, d * 0.22), box(-w / 2 + 60, h * 0.35, 0, 120, h * 0.7, d), box(w / 2 - 60, h * 0.35, 0, 120, h * 0.7, d)];
    case "chair": return [box(0, h * 0.45, 0, w * 0.8, 60, d * 0.8), box(0, h * 0.7, -d * 0.35, w * 0.8, h * 0.5, 60), box(0, h * 0.22, 0, 60, h * 0.45, 60, "#555")];
    case "table": {
      const leg = (sx: number, sz: number) => box(sx * (w / 2 - 60), (h - 40) / 2, sz * (d / 2 - 60), 50, h - 40, 50);
      return [box(0, h - 20, 0, w, 40, d), leg(-1, -1), leg(1, -1), leg(-1, 1), leg(1, 1)];
    }
    case "round-table": return [box(0, h - 20, 0, w, 40, d, main, true), box(0, (h - 40) / 2, 0, 120, h - 40, 120, main, true)];
    case "cabinet": case "tall-cabinet": return [box(0, h / 2, 0, w, h, d), box(0, h / 2, d / 2 - 5, w - 20, h - 20, 10, "#efe9df")];
    case "wall-cabinet": return [box(0, h / 2, 0, w, h, d)];
    case "toilet": return [box(0, h * 0.75, -d / 2 + d * 0.13, w, h * 0.5, d * 0.26), box(0, h * 0.25, d * 0.12, w * 0.85, h * 0.5, d * 0.7, main, true)];
    case "basin": return [box(0, h * 0.45, 0, w, h * 0.9, d, "#d9d2c5"), box(0, h * 0.92, 0, w * 0.7, 60, d * 0.6, main)];
    case "bathtub": return [box(0, h / 2, 0, w, h, d)];
    case "shower": return [box(0, 30, 0, w, 60, d), box(0, h / 2, 0, w, h, d, "#bfe3f5")];
    case "car": return [box(0, h * 0.3, 0, w, h * 0.45, d, "#6b7f99"), box(0, h * 0.72, d * 0.03, w * 0.85, h * 0.4, d * 0.48, "#9fb2c8")];
    default: return [box(0, h / 2, 0, w, h, d)];
  }
}

export function FurnitureMesh({ item, flipped, centre, selected, onSelect }: { item: HouseProject["components"][number]; flipped: boolean; centre: Centre; selected: boolean; onSelect: () => void }) {
  const definition = definitionOf(item);
  return (
    <group position={[(item.x - centre.centreX) * MM, item.elevation * MM, -(item.y - centre.centreY) * MM]} rotation={[0, (item.rotation * Math.PI) / 180, 0]} scale={[flipped ? -1 : 1, 1, 1]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {parts(definition.model, item.width, item.depth, item.height, item.material).map((part, index) => (
        // The plan's front (+y) is the scene's −z.
        <mesh key={index} position={[part.x * MM, part.y * MM, -part.z * MM]}>
          {part.round ? <cylinderGeometry args={[(part.w / 2) * MM, (part.w / 2) * MM, part.h * MM, 24]} /> : <boxGeometry args={[part.w * MM, part.h * MM, part.d * MM]} />}
          <meshStandardMaterial color={selected ? "#1473e6" : part.color} roughness={0.8} transparent={part.color === "#bfe3f5"} opacity={part.color === "#bfe3f5" ? 0.35 : 1} />
        </mesh>
      ))}
    </group>
  );
}

/** A stair raised from its treads: each one a block up to its riser's height. */
export function StairMesh({ stair, centre, selected, onSelect }: { stair: HouseProject["stairs"][number]; centre: Centre; selected: boolean; onSelect: () => void }) {
  const geometry = useMemo(() => stairGeometry(stairParams(stair)), [stair]);
  const blocks = useMemo(() => geometry.pieces.map((piece) => {
    const shape = new THREE.Shape(piece.points.map((point) => new THREE.Vector2(point.x * MM, point.y * MM)));
    const height = (piece.level === 0 ? stair.height : piece.level * geometry.riserHeight) * MM;
    const solid = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    // Extruded along +z, turned to stand up: shape (x, y) → scene (x, −y).
    solid.rotateX(-Math.PI / 2);
    return solid;
  }), [geometry, stair.height]);
  return (
    <group position={[(stair.x - centre.centreX) * MM, stair.elevation * MM, -(stair.y - centre.centreY) * MM]} rotation={[0, (stair.rotation * Math.PI) / 180, 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {blocks.map((solid, index) => <mesh key={index} geometry={solid}><meshStandardMaterial color={selected ? "#1473e6" : "#bdb7ad"} roughness={0.9} /></mesh>)}
    </group>
  );
}

export function ColumnMesh({ column, centre, selected, onSelect }: { column: HouseProject["structuralColumns"][number]; centre: Centre; selected: boolean; onSelect: () => void }) {
  return (
    <mesh position={[(column.x - centre.centreX) * MM, (column.elevation + column.height / 2) * MM, -(column.y - centre.centreY) * MM]} rotation={[0, ((column.rotation ?? 0) * Math.PI) / 180, 0]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {column.type === "circular" ? <cylinderGeometry args={[(column.width / 2) * MM, (column.width / 2) * MM, column.height * MM, 32]} /> : <boxGeometry args={[column.width * MM, column.height * MM, column.depth * MM]} />}
      <meshStandardMaterial color={selected ? "#1473e6" : "#9e9a92"} roughness={0.92} transparent opacity={selected ? 1 : 0.72} />
    </mesh>
  );
}
