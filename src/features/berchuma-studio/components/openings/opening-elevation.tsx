"use client";

import { buildOpeningGeometry, frameColour } from "../../services/opening-geometry";
import type { OpeningSpec } from "../../types/openings";

/**
 * The opening as a drawing.
 *
 * Plain SVG from the same geometry the 3D view uses, so the two cannot show
 * different doors. This is the default view and the one that matters most: it
 * is what a fabricator reads, it costs nothing to render, and it is legible on
 * a phone where an orbiting camera is not.
 */

export function OpeningElevation({ spec }: { spec: OpeningSpec }) {
  const geometry = buildOpeningGeometry(spec);
  const colour = frameColour(spec.finish);

  // The drawing is in millimetres with a margin, and the viewBox does the
  // scaling — so a 900 mm window and a 6 m shopfront both fill the frame.
  const margin = Math.max(spec.width, spec.height) * 0.12;
  const viewBox = `${-spec.width / 2 - margin} ${-spec.height / 2 - margin} ${
    spec.width + margin * 2
  } ${spec.height + margin * 2}`;

  // SVG's y runs down the page and the geometry's runs up it.
  const flip = (y: number, height: number) => -(y * 1000) - (height * 1000) / 2;
  const mm = (metres: number) => metres * 1000;

  return (
    <svg
      viewBox={viewBox}
      className="size-full"
      role="img"
      aria-label={`${spec.reference}, ${spec.width} by ${spec.height} millimetres`}
    >
      {geometry.glass.map((pane) => (
        <rect
          key={pane.id}
          x={mm(pane.x) - mm(pane.width) / 2}
          y={flip(pane.y, pane.height)}
          width={mm(pane.width)}
          height={mm(pane.height)}
          fill={geometry.glassTint.colour}
          fillOpacity={geometry.glassTint.opacity}
        />
      ))}

      {[...geometry.frame, ...geometry.sashes].map((part) => (
        <rect
          key={part.id}
          x={mm(part.x) - mm(part.width) / 2}
          y={flip(part.y, part.height)}
          width={mm(part.width)}
          height={mm(part.height)}
          fill={colour}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={Math.max(spec.width, spec.height) / 600}
        />
      ))}

      {geometry.handles.map((handle) => (
        <rect
          key={handle.id}
          x={mm(handle.x) - mm(handle.width) / 2}
          y={flip(handle.y, handle.height)}
          width={mm(handle.width)}
          height={mm(handle.height)}
          rx={mm(handle.width) / 2}
          fill="#2b2f33"
        />
      ))}

      {/* Which way each panel runs. A fabricator reads this before anything
          else on the drawing. */}
      {geometry.moving.map((slides, index) =>
        slides && geometry.sashes[index] ? (
          <text
            key={`arrow-${index}`}
            x={mm(geometry.sashes[index].x)}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.max(spec.width, spec.height) / 14}
            fill="rgba(255,255,255,0.85)"
          >
            ↔
          </text>
        ) : null,
      )}
    </svg>
  );
}
