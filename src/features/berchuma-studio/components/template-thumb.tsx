"use client";

import { useMemo } from "react";

import { buildParts } from "../services/geometry";
import { partWorldBounds } from "../services/part-transform";
import type { DesignSpec } from "../types/spec";

/**
 * A design seen from the front, as a small line drawing.
 *
 * Drawn from the design's own parts — the ones the cut list and the price are
 * made of — so a template card shows the cabinet it will make, not an
 * illustration of one. Every board is projected onto the front plane and
 * outlined; fronts are filled lightly so doors and drawers read as the face.
 * Cheap enough for a grid of them: no canvas, no three.js.
 */
export function TemplateThumb({ spec, className }: { spec: DesignSpec; className?: string }) {
  const drawing = useMemo(() => {
    try {
      const { parts } = buildParts(spec);
      const boxes = parts.flatMap((part) =>
        part.placements.map((placement) => {
          const bounds = partWorldBounds(part, placement);
          return {
            front: part.role === "door" || part.role === "drawer_front",
            x: bounds.min.x,
            y: bounds.min.y,
            width: bounds.max.x - bounds.min.x,
            height: bounds.max.y - bounds.min.y,
            // z runs backwards from the front face: smaller is nearer.
            z: bounds.min.z,
          };
        }),
      );
      if (!boxes.length) return null;
      const minX = Math.min(...boxes.map((box) => box.x));
      const maxX = Math.max(...boxes.map((box) => box.x + box.width));
      const maxY = Math.max(...boxes.map((box) => box.y + box.height));
      const minY = Math.min(0, ...boxes.map((box) => box.y));
      // Back to front, so the fronts are drawn over the carcass behind them.
      return { boxes: boxes.sort((a, b) => b.z - a.z), minX, minY, width: maxX - minX, height: maxY - minY };
    } catch {
      return null;
    }
  }, [spec]);

  if (!drawing) return <div className={className} aria-hidden />;
  const pad = Math.max(drawing.width, drawing.height) * 0.04;
  return (
    <svg
      viewBox={`${drawing.minX - pad} ${-pad} ${drawing.width + 2 * pad} ${drawing.height + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={`Front view, ${Math.round(drawing.width)} × ${Math.round(drawing.height)} mm`}
    >
      <g transform={`translate(0 ${drawing.height + drawing.minY}) scale(1 -1)`}>
        {drawing.boxes.map((box, index) => (
          <rect
            key={index}
            x={box.x}
            y={box.y}
            width={Math.max(box.width, 1)}
            height={Math.max(box.height, 1)}
            fill={box.front ? "var(--thumb-front, #f5f5f4)" : "none"}
            stroke="currentColor"
            strokeWidth={Math.max(drawing.width, drawing.height) / 220}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}
