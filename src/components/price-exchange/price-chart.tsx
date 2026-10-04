"use client";

import { useMemo, useState } from "react";

import { TREND_RANGES } from "@/lib/constants/price-exchange";
import { cn } from "@/lib/utils";

/**
 * Price history for one listing.
 *
 * A year of points is fetched once and the shorter ranges are windows over it,
 * so switching between 30, 90 and 365 days is instant and costs no round trip.
 * Drawn as plain SVG rather than pulling in a charting library for one line.
 */

type Point = { day: string; price: number };

const WIDTH = 720;
const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 28, left: 56 };

export function PriceChart({
  points,
  currency,
  unit,
  asOf,
}: {
  points: Point[];
  currency: string;
  unit: string;
  /** Render time, supplied by the server so the window stays pure. */
  asOf: string;
}) {
  const [days, setDays] = useState<number>(90);

  const windowed = useMemo(() => {
    const cutoff = new Date(asOf).getTime() - days * 86_400_000;
    return points.filter((point) => new Date(point.day).getTime() >= cutoff);
  }, [points, days, asOf]);

  const chart = useMemo(() => {
    if (windowed.length === 0) return null;

    const prices = windowed.map((point) => Number(point.price));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    // A flat line would divide by zero and hug an edge; give it a band.
    const span = max - min || Math.max(max * 0.1, 1);
    const low = max === min ? min - span / 2 : min;

    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const x = (index: number) =>
      PADDING.left +
      (windowed.length === 1
        ? innerWidth / 2
        : (index / (windowed.length - 1)) * innerWidth);
    const y = (price: number) =>
      PADDING.top + innerHeight - ((price - low) / span) * innerHeight;

    const line = windowed
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(Number(point.price))}`)
      .join(" ");

    const area =
      `${line} L${x(windowed.length - 1)},${PADDING.top + innerHeight}` +
      ` L${x(0)},${PADDING.top + innerHeight} Z`;

    return {
      line,
      area,
      min,
      max,
      // The memo has already returned null for an empty series, so these are
      // present — the defaults state that rather than assert it.
      first: prices[0] ?? 0,
      last: prices.at(-1) ?? 0,
      ticks: [low + span, low + span / 2, low],
      tickY: [PADDING.top, PADDING.top + innerHeight / 2, PADDING.top + innerHeight],
      baseline: PADDING.top + innerHeight,
    };
  }, [windowed]);

  // The two axis labels. Read once, beside the chart itself, so nothing in
  // the render body has to reach into the array or invent a date.
  const firstDay = windowed[0]?.day ?? null;
  const lastDay = windowed.at(-1)?.day ?? null;

  const change =
    chart && chart.first !== 0
      ? ((chart.last - chart.first) / chart.first) * 100
      : null;

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Price history</h2>
          <p className="text-sm text-muted-foreground">
            {currency} per {unit}
            {change !== null && (
              <>
                {" · "}
                <span
                  className={cn(
                    change > 0 && "text-destructive",
                    change < 0 && "text-emerald-500",
                  )}
                >
                  {change > 0 ? "+" : ""}
                  {change.toFixed(1)}% over this period
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
          {TREND_RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              aria-pressed={days === range.days}
              onClick={() => setDays(range.days)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                days === range.days
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {chart === null ? (
        <p className="py-14 text-center text-sm text-muted-foreground">
          No price changes recorded in this period.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mt-4 w-full"
          role="img"
          aria-label={`Price history over the last ${days} days`}
        >
          <defs>
            <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {chart.tickY.map((ty, index) => (
            <g key={ty}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={ty}
                y2={ty}
                stroke="currentColor"
                strokeOpacity="0.12"
              />
              <text
                x={PADDING.left - 8}
                y={ty + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {Math.round(chart.ticks[index] ?? 0).toLocaleString()}
              </text>
            </g>
          ))}

          <path d={chart.area} fill="url(#price-fill)" />
          <path
            d={chart.line}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <text
            x={PADDING.left}
            y={HEIGHT - 8}
            className="fill-muted-foreground text-[11px]"
          >
            {firstDay && new Date(firstDay).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </text>
          <text
            x={WIDTH - PADDING.right}
            y={HEIGHT - 8}
            textAnchor="end"
            className="fill-muted-foreground text-[11px]"
          >
            {lastDay &&
              new Date(lastDay).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
          </text>
        </svg>
      )}
    </div>
  );
}
