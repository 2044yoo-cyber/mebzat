"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { DimensionLabel } from "./handles";
import type { CabinetDimensions } from "../../services/interior-dimensions";

/**
 * A cabinet's dimensions drawn on its front, as a wardrobe drawing has them:
 * the clear width of each column along the top and the overall width above
 * that, the overall height down the side, and inside every column the clear
 * heights between shelves, each rail with its length and the hanging height
 * under it, and each drawer front's height.
 *
 * Dimension lines with ticks at their ends, drawn over the model (not hidden
 * by the doors), in the design's millimetres turned into scene metres.
 */

const MM = 0.001;
const TICK = 45;

export function CabinetDimensionLines({ dimensions, scale }: { dimensions: CabinetDimensions; scale: number }) {
  const { left, right, bottom, top, front, columns } = dimensions;
  // Just in front of the doors, so the lines read over them.
  const z = -front * MM + 0.012;
  const small = scale * 0.55;

  const { segments, labels } = useMemo(() => {
    const lines: number[] = [];
    const notes: { text: string; at: [number, number]; size: "small" | "large" }[] = [];
    const horizontal = (x0: number, x1: number, y: number) => {
      lines.push(x0, y, x1, y, x0, y - TICK, x0, y + TICK, x1, y - TICK, x1, y + TICK);
    };
    const vertical = (x: number, y0: number, y1: number) => {
      lines.push(x, y0, x, y1, x - TICK, y0, x + TICK, y0, x - TICK, y1, x + TICK, y1);
    };

    // Along the top: each column's clear width, then the whole width above.
    const chain = top + 110;
    for (const column of columns) {
      horizontal(column.from, column.to, chain);
      notes.push({ text: `${column.width}`, at: [(column.from + column.to) / 2, chain + 85], size: "small" });
    }
    const overall = top + 330;
    horizontal(left, right, overall);
    notes.push({ text: `${Math.round(right - left)}`, at: [(left + right) / 2, overall + 95], size: "large" });

    // Down the left: the overall height.
    const side = left - 140;
    vertical(side, bottom, top);
    notes.push({ text: `${Math.round(top - bottom)}`, at: [side - 190, (bottom + top) / 2], size: "large" });

    for (const column of columns) {
      // The clear heights, a chain down the right of the column.
      const x = column.to - 70;
      for (const gap of column.gaps) {
        vertical(x, gap.from, gap.to);
        notes.push({ text: `${gap.size}`, at: [x - 140, (gap.from + gap.to) / 2], size: "small" });
      }
      // A rail: its length just under it, and how far a coat can hang.
      for (const rail of column.rails) {
        const under = rail.y - 70;
        horizontal(rail.from, rail.to, under);
        notes.push({ text: `${rail.length}`, at: [(rail.from + rail.to) / 2, under - 75], size: "small" });
        if (rail.hang && rail.hang.size > 150) {
          const middle = (column.from + column.to) / 2 - 40;
          vertical(middle, rail.hang.from, rail.hang.to);
          notes.push({ text: `${rail.hang.size}`, at: [middle - 130, (rail.hang.from + rail.hang.to) / 2 - 140], size: "small" });
        }
      }
      // Each drawer front's height, at its left.
      for (const drawer of column.drawers) {
        const at = column.from + 70;
        vertical(at, drawer.from, drawer.to);
        notes.push({ text: `${drawer.size}`, at: [at + 140, (drawer.from + drawer.to) / 2], size: "small" });
      }
    }
    return { segments: lines, labels: notes };
  }, [bottom, columns, left, right, top]);

  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let index = 0; index < segments.length; index += 2) points.push(segments[index]! * MM, segments[index + 1]! * MM, z);
    const built = new THREE.BufferGeometry();
    built.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return built;
  }, [segments, z]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group name="cabinet-dimensions">
      <lineSegments geometry={geometry} renderOrder={5} raycast={() => null}>
        <lineBasicMaterial color="#1f2937" depthTest={false} transparent opacity={0.9} />
      </lineSegments>
      {labels.map((label, index) => (
        <DimensionLabel key={index} text={label.text} position={[label.at[0] * MM, label.at[1] * MM, z]} scale={label.size === "large" ? scale * 0.8 : small} tone="muted" />
      ))}
    </group>
  );
}
