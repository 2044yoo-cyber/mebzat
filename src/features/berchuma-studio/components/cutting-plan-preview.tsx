"use client";

import { useMemo, useState } from "react";
import type { ProjectProductionSummary } from "../services/cabinet-project";

export function CuttingPlanPreview({ layouts }: {
  layouts: ProjectProductionSummary["layouts"];
}) {
  const [selected, setSelected] = useState("0");
  const current = layouts[Number(selected)] ?? layouts[0];
  const options = useMemo(() => layouts.map((layout, index) => ({
    value: String(index),
    label: `${layout.board} · Sheet ${layout.sheet}`,
  })), [layouts]);

  if (!layouts.length) return null;
  const area = current.length * current.width;
  const used = current.parts.reduce((sum, part) => sum + part.width * part.height, 0);
  const waste = Math.max(0, area - used);
  const scale = Math.min(560 / current.length, 340 / current.width);
  const margin = 20;
  const viewWidth = current.length * scale + margin * 2;
  const viewHeight = current.width * scale + margin * 2;

  return (
    <section className="space-y-3 rounded-xl border p-3" aria-label="Visual cutting plan">
      <div>
        <h3 className="text-sm font-semibold">Visual cutting plan</h3>
        <p className="text-xs text-muted-foreground">Check the numbered panel layout before sending it to the workshop.</p>
      </div>
      <label className="block text-xs font-medium">
        Board and sheet
        <select value={selected} onChange={event => setSelected(event.target.value)}
          className="mt-1 min-h-10 w-full rounded-lg border bg-background px-3 text-sm">
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="overflow-x-auto rounded-lg bg-muted/30 p-2">
        <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="img"
          aria-label={`${current.board}, sheet ${current.sheet}, ${current.parts.length} panels`}
          className="mx-auto block w-full min-w-[300px] max-w-3xl">
          <rect x={margin} y={margin} width={current.length * scale} height={current.width * scale}
            rx="2" fill="currentColor" fillOpacity="0.035" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5"/>
          {current.parts.map((part, index) => {
            const x = margin + part.x * scale;
            const y = margin + part.y * scale;
            const w = part.width * scale;
            const h = part.height * scale;
            return <g key={`${part.label}-${index}`}>
              <rect x={x} y={y} width={w} height={h} fill="currentColor" fillOpacity="0.13"
                stroke="currentColor" strokeOpacity="0.75" strokeWidth="1"/>
              {/* Dimension graphics are drawn inside each panel so they are
                  never clipped by the sheet boundary or hidden off-canvas. */}
              {w > 30 && h > 24 ? (
                <g>
                  <line x1={x + 4} y1={y + 5} x2={x + w - 4} y2={y + 5}
                    stroke="#1757b8" strokeWidth="1.2" />
                  <line x1={x + 4} y1={y + 1} x2={x + 4} y2={y + 9}
                    stroke="#1757b8" strokeWidth="1.2" />
                  <line x1={x + w - 4} y1={y + 1} x2={x + w - 4} y2={y + 9}
                    stroke="#1757b8" strokeWidth="1.2" />
                  <text x={x + w / 2} y={y + 17} textAnchor="middle"
                    dominantBaseline="middle" fill="#174a9c"
                    fontSize={Math.max(7, Math.min(11, w / 10))}
                    fontWeight="600" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 2 }}>
                    {Math.round(part.width)} mm
                  </text>
                  <line x1={x + 5} y1={y + 24} x2={x + 5} y2={y + h - 4}
                    stroke="#1757b8" strokeWidth="1.2" />
                  <line x1={x + 1} y1={y + 24} x2={x + 9} y2={y + 24}
                    stroke="#1757b8" strokeWidth="1.2" />
                  <line x1={x + 1} y1={y + h - 4} x2={x + 9} y2={y + h - 4}
                    stroke="#1757b8" strokeWidth="1.2" />
                  <text x={x + 17} y={y + Math.max(34, h / 2)} textAnchor="middle"
                    dominantBaseline="middle" transform={`rotate(-90 ${x + 17} ${y + Math.max(34, h / 2)})`}
                    fill="#174a9c" fontSize={Math.max(7, Math.min(11, h / 10))}
                    fontWeight="600" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 2 }}>
                    {Math.round(part.height)} mm
                  </text>
                  <text x={x + w / 2} y={y + h - 10} textAnchor="middle"
                    dominantBaseline="middle" fill="currentColor"
                    fontSize={Math.max(8, Math.min(12, Math.min(w / 5, h / 4)))}>
                    #{index + 1}
                  </text>
                </g>
              ) : (
                <text x={x + w / 2} y={y + h / 2} textAnchor="middle"
                  dominantBaseline="middle" fill="currentColor" fontSize="8">
                  #{index + 1}
                </text>
              )}
            </g>;
          })}
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-muted/30 p-2"><p className="text-[11px] text-muted-foreground">Sheet size</p><p className="text-xs font-semibold">{current.length} × {current.width} mm</p></div>
        <div className="rounded-lg bg-muted/30 p-2"><p className="text-[11px] text-muted-foreground">Panels</p><p className="text-xs font-semibold">{current.parts.length}</p></div>
        <div className="rounded-lg bg-muted/30 p-2"><p className="text-[11px] text-muted-foreground">Used area</p><p className="text-xs font-semibold">{area ? Math.round(used / area * 100) : 0}%</p></div>
        <div className="rounded-lg bg-muted/30 p-2"><p className="text-[11px] text-muted-foreground">Approx. offcut</p><p className="text-xs font-semibold">{(waste / 1_000_000).toFixed(2)} m²</p></div>
      </div>
      <ol className="grid gap-1 sm:grid-cols-2">
        {current.parts.map((part, index) => <li key={`${part.label}-${index}`}
          className="flex min-w-0 items-start gap-2 rounded-md border px-2 py-1.5 text-xs">
          <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-semibold">{index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block break-words font-medium">{part.label}</span>
            <span className="text-muted-foreground">{Math.round(part.width)} × {Math.round(part.height)} mm{part.rotated ? " · rotated" : ""}</span>
          </span>
        </li>)}
      </ol>
      <p className="text-[11px] text-muted-foreground">Diagram is a scale-based nesting preview. Confirm saw kerf, grain direction, trim, and machine setup before cutting.</p>
    </section>
  );
}
