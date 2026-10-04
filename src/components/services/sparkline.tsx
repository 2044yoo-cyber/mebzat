import { cn } from "@/lib/utils";

/**
 * A small bar chart for a daily series.
 *
 * Bars rather than a line: the series is counts of discrete events, and a line
 * between two days with no data in between implies a trend that was never
 * measured. Plain SVG, because one chart does not justify a dependency.
 *
 * A server component — the data is fixed at render and nothing here is
 * interactive, so it costs the client nothing.
 */
export function Sparkline({
  points,
  className,
}: {
  points: { day: string; total: number }[];
  className?: string;
}) {
  if (points.length === 0) return null;

  const max = Math.max(...points.map((point) => point.total), 1);
  const first = points[0];
  const last = points.at(-1);
  // Both are present whenever `points` is — the guard states it rather than
  // asserting it, and an empty series renders nothing, which is correct.
  if (!first || !last) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className="flex h-24 items-end gap-px"
        role="img"
        aria-label={`${points.reduce((sum, point) => sum + point.total, 0)} in total across ${points.length} days`}
      >
        {points.map((point) => (
          <div
            key={point.day}
            className="group relative flex-1 rounded-t bg-brand/70 transition-colors hover:bg-brand"
            // A zero day still gets a hairline, so the axis reads as continuous.
            style={{ height: `${Math.max((point.total / max) * 100, 2)}%` }}
            title={`${new Date(point.day).toLocaleDateString()}: ${point.total}`}
          />
        ))}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {new Date(first.day).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
        <span className="tabular-nums">peak {max}</span>
        <span>
          {new Date(last.day).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}
