"use client";

import { useMemo } from "react";

import type { DxfEntity } from "@/lib/takeoff/dxf/parse";
import { cn } from "@/lib/utils";

/**
 * The plan, drawn from the drawing's own geometry.
 *
 * Real coordinates out of the DXF, fitted to the viewport — not a diagram of a
 * building, the building. Clicking a line selects the element measured from it,
 * and an element selected anywhere else lights up here. That two-way link is
 * the traceability requirement made visible: a BOQ line highlights the walls it
 * was measured from, and a wall shows the lines it paid for.
 *
 * ## Why this is 2D
 *
 * A DXF floor plan *is* two-dimensional. There is no third coordinate to draw
 * and no honest way to invent one — a plan does not record storey height, and a
 * viewer that extruded every line by an assumed 3 m would be showing a building
 * nobody drew. IFC has the geometry for a real 3D view, but only inside swept
 * solids and B-reps that the importer deliberately does not evaluate yet; until
 * it does, an IFC model is browsed as a list rather than pretended at in a
 * viewport.
 */

export type PlanEntity = {
  /** The element id, so selection matches everything else. */
  elementId: string | null;
  entity: DxfEntity;
};

export function PlanView({
  entities,
  selected,
  highlighted,
  onSelect,
  className,
}: {
  entities: PlanEntity[];
  /** The element clicked, if any. */
  selected: string | null;
  /** Elements lit up from elsewhere — a BOQ line, usually. */
  highlighted: Set<string>;
  onSelect: (elementId: string | null) => void;
  className?: string;
}) {
  const { paths, viewBox, empty } = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const paths: { elementId: string | null; d: string; layer: string }[] = [];

    for (const { elementId, entity } of entities) {
      const points = pointsOf(entity);
      if (points.length < 2) continue;

      for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }

      const closed = entity.type === "LWPOLYLINE" && entity.codes.get(70)?.[0] === 1;
      const d =
        points.map((point, i) => `${i === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ") +
        (closed ? " Z" : "");

      paths.push({ elementId, d, layer: entity.layer });
    }

    if (!Number.isFinite(minX)) {
      return { paths, viewBox: "0 0 100 100", empty: true };
    }

    // A margin of a twentieth of the larger side, so nothing touches the edge.
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const pad = Math.max(width, height) / 20;

    return {
      paths,
      viewBox: `${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`,
      empty: false,
    };
  }, [entities]);

  if (empty) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center rounded-xl border border-dashed p-8 text-center",
          className,
        )}
      >
        <p className="max-w-sm text-sm text-muted-foreground">
          No drawable geometry. An IFC model carries its quantities but not, yet,
          the solids needed to draw it — open the Elements tab to work with it.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("h-full overflow-hidden rounded-xl border bg-card", className)}>
      <svg
        viewBox={viewBox}
        className="size-full"
        // DXF's Y axis points up and SVG's points down, so the whole drawing is
        // flipped once here rather than every coordinate being negated.
        style={{ transform: "scaleY(-1)" }}
        role="img"
        aria-label="Floor plan"
        onClick={() => onSelect(null)}
      >
        {paths.map((path, index) => {
          const isSelected = path.elementId !== null && path.elementId === selected;
          const isLit = path.elementId !== null && highlighted.has(path.elementId);

          return (
            <path
              key={`${path.elementId ?? "none"}-${index}`}
              d={path.d}
              fill="none"
              className={cn(
                "cursor-pointer transition-colors",
                isSelected
                  ? "stroke-brand"
                  : isLit
                    ? "stroke-brand/70"
                    : "stroke-muted-foreground/50 hover:stroke-foreground",
              )}
              // Scaled with the viewBox so the line weight looks the same
              // whether the plan is a cupboard or a city block.
              strokeWidth={isSelected || isLit ? "0.6%" : "0.25%"}
              vectorEffect="non-scaling-stroke"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(path.elementId);
              }}
            >
              <title>{path.layer}</title>
            </path>
          );
        })}
      </svg>
    </div>
  );
}

function pointsOf(entity: DxfEntity): { x: number; y: number }[] {
  if (entity.type === "LWPOLYLINE") return entity.vertices;

  if (entity.type === "LINE") {
    const x1 = numberAt(entity, 10);
    const y1 = numberAt(entity, 20);
    const x2 = numberAt(entity, 11);
    const y2 = numberAt(entity, 21);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return [];
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }

  return [];
}

function numberAt(entity: DxfEntity, code: number): number | null {
  const value = entity.codes.get(code)?.[0];
  return typeof value === "number" ? value : null;
}
