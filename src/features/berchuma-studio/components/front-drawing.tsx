import type { FrontDrawingData } from "../services/front-drawing";

export { frontDrawing, type FrontDrawingData } from "../services/front-drawing";

/** The front view drawn: see `frontDrawing`. No hooks, so a server page can use it. */
export function FrontDrawing({ drawing, className }: { drawing: FrontDrawingData | null; className?: string }) {
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
      {/* Flipped so y runs up from the floor, as the spec measures it. */}
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
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}
