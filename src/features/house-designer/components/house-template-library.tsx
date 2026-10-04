"use client";

import { useMemo, useState } from "react";

import type { Room } from "@/features/berchuma-studio/types/room";
import { cn } from "@/lib/utils";

import {
  DEFAULT_SETBACKS,
  adjustTemplate,
  facePlan,
  rankTemplates,
  usableArea,
  type BuiltTemplate,
  type Fit,
  type Plot,
  type RoadSide,
} from "../services/plan-library";
import { housePlanWalls } from "../types/project";

const metres = (mm: number) => (mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1);
const size = (width: number, length: number) => `${metres(width)} × ${metres(length)} m`;
const STATUS: Record<Fit["status"], string> = { best: "BEST FIT", adjust: "CAN BE ADJUSTED", none: "DOES NOT FIT" };
const ROADS: { id: RoadSide; label: string }[] = [{ id: "north", label: "↑ North" }, { id: "south", label: "↓ South" }, { id: "west", label: "← West" }, { id: "east", label: "→ East" }];

/**
 * "Use a template": the plot first, then the plans that fit it, best first.
 * Every plan is real geometry, drawn from its walls; the one chosen opens in
 * the plan editor, faced to the road.
 */
export function HouseTemplateLibrary({ onUse }: { onUse: (plan: Room, options: { name: string; floors: number }) => void }) {
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [bedrooms, setBedrooms] = useState<number | null>(null);
  const [floors, setFloors] = useState(1);
  const [parking, setParking] = useState<boolean | null>(null);
  const [courtyard, setCourtyard] = useState<boolean | null>(null);
  const [road, setRoad] = useState<RoadSide>("south");
  const [setbacks, setSetbacks] = useState({ front: "3", sides: "0.8", rear: "1.5" });
  const [plot, setPlot] = useState<Plot | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const metresIn = (value: string) => Math.round(Number(value.replace(",", ".")) * 1000);
  const ready = metresIn(width) >= 4000 && metresIn(length) >= 4000;
  const ranked = useMemo(() => plot ? rankTemplates(plot, { bedrooms, parking, courtyard, floors }) : [], [plot, bedrooms, parking, courtyard, floors]);
  const fit = ranked.find((item) => item.built.template.id === chosen) ?? null;

  if (!plot) {
    return (
      <form aria-label="Plot" className="space-y-3 rounded-xl border p-3" onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        const read = (value: string, fallback: number) => { const mm = metresIn(value); return Number.isFinite(mm) && mm >= 0 ? mm : fallback; };
        setPlot({ width: metresIn(width), length: metresIn(length), front: read(setbacks.front, DEFAULT_SETBACKS.front), sides: read(setbacks.sides, DEFAULT_SETBACKS.sides), rear: read(setbacks.rear, DEFAULT_SETBACKS.rear) });
      }}>
        <h3 className="text-base font-semibold">What is your plot size?</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground"><span>Plot width (along the road)</span>
            <span className="flex items-center gap-1"><input aria-label="Plot width" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} placeholder="12" className="min-h-11 w-full rounded-lg border bg-background px-3 text-base text-foreground" /><span>m</span></span>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground"><span>Plot length</span>
            <span className="flex items-center gap-1"><input aria-label="Plot length" inputMode="decimal" value={length} onChange={(event) => setLength(event.target.value)} placeholder="20" className="min-h-11 w-full rounded-lg border bg-background px-3 text-base text-foreground" /><span>m</span></span>
          </label>
        </div>
        <Choice label="Bedrooms" value={bedrooms} options={[[null, "Any"], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5+"]]} onChange={setBedrooms} />
        <Choice label="Floors" value={floors} options={[[1, "1"], [2, "2"], [3, "3+"]]} onChange={(value) => setFloors(value ?? 1)} />
        <Choice label="Parking" value={parking} options={[[null, "Any"], [true, "Yes"], [false, "No"]]} onChange={setParking} />
        <Choice label="Courtyard" value={courtyard} options={[[null, "Any"], [true, "Yes"], [false, "No"]]} onChange={setCourtyard} />
        <Choice label="Which side is the road/front?" value={road} options={ROADS.map((item) => [item.id, item.label])} onChange={(value) => setRoad(value ?? "south")} />
        <details className="text-xs text-muted-foreground">
          <summary className="min-h-9 cursor-pointer py-2">Setbacks: front {setbacks.front} m · sides {setbacks.sides} m · back {setbacks.rear} m</summary>
          <div className="grid grid-cols-3 gap-2">
            {(["front", "sides", "rear"] as const).map((side) => (
              <label key={side} className="space-y-1"><span>{side === "rear" ? "Back" : side === "front" ? "Front" : "Sides"} (m)</span>
                <input aria-label={`${side === "rear" ? "Back" : side === "front" ? "Front" : "Side"} setback`} inputMode="decimal" value={setbacks[side]} onChange={(event) => setSetbacks({ ...setbacks, [side]: event.target.value })} className="min-h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" />
              </label>
            ))}
          </div>
        </details>
        <button type="submit" disabled={!ready} className="min-h-11 w-full rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-40">Find plans</button>
      </form>
    );
  }

  const usable = usableArea(plot);
  if (fit) return <TemplatePreview key={fit.built.template.id} fit={fit} plot={plot} road={road} floors={floors} onBack={() => setChosen(null)} onUse={onUse} />;

  const groups: [Fit["status"], string][] = [["best", "Best fit"], ["adjust", "Can be adjusted"], ...(showAll ? [["none", "Does not fit"] as [Fit["status"], string]] : [])];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm">
        <span><strong>Plot {size(plot.width, plot.length)}</strong><br /><span className="text-xs text-muted-foreground">Building area {size(usable.width, usable.length)} inside the setbacks</span></span>
        <button type="button" onClick={() => setPlot(null)} className="min-h-11 rounded-lg border px-3 text-xs">Change plot</button>
      </div>
      {groups.map(([status, title]) => {
        const items = ranked.filter((item) => item.status === status);
        return (
          <section key={status} aria-label={title} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title} · {items.length}</h3>
            {items.length ? <div className="grid gap-2 sm:grid-cols-2">{items.map((item) => <TemplateCard key={item.built.template.id} fit={item} onOpen={() => setChosen(item.built.template.id)} />)}</div>
              : <p className="text-xs text-muted-foreground">{status === "best" ? "No plan fits this plot as it is." : "None."}</p>}
          </section>
        );
      })}
      <button type="button" onClick={() => setShowAll((value) => !value)} aria-pressed={showAll} className="min-h-11 w-full rounded-xl border text-sm">{showAll ? "Hide plans that do not fit" : "Show all plans"}</button>
    </div>
  );
}

function Choice<T extends string | number | boolean | null>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map(([option, text]) => <button key={String(option)} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)} className={cn("min-h-10 min-w-11 rounded-lg border px-3 text-sm", value === option ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted/40")}>{text}</button>)}
      </div>
    </div>
  );
}

function TemplateCard({ fit, onOpen }: { fit: Fit; onOpen: () => void }) {
  const shown = fit.status === "adjust" && fit.adjusted ? fit.adjusted : fit.built;
  const built = fit.built;
  return (
    <button type="button" onClick={onOpen} aria-label={built.template.name} className="flex gap-3 rounded-xl border p-2 text-left text-xs hover:bg-muted/40">
      <svg aria-hidden viewBox={viewBoxOf(shown.plan, 400)} className="size-24 shrink-0 rounded-lg bg-muted/30"><PlanDrawing plan={shown.plan} /></svg>
      <span className="min-w-0 space-y-0.5">
        <strong className="block text-sm">{built.template.name}</strong>
        <span className="block">{built.bedrooms} bed · {built.bathrooms} bath{built.template.parking ? " · parking" : ""}{built.template.courtyard ? " · courtyard" : ""}</span>
        <span className="block">House: {size(built.width, built.length)}</span>
        <span className="block">Floor area: {built.area.toFixed(1)} m²</span>
        <span className="block text-muted-foreground">Recommended plot: {size(fit.minimumPlot.width, fit.minimumPlot.length)}+</span>
        <span className={cn("inline-block rounded px-1.5 py-0.5 font-semibold", fit.status === "best" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : fit.status === "adjust" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")}>{STATUS[fit.status]}{fit.rotated ? " · turned 90°" : ""}</span>
      </span>
    </button>
  );
}

function TemplatePreview({ fit, plot, road, floors, onBack, onUse }: { fit: Fit; plot: Plot; road: RoadSide; floors: number; onBack: () => void; onUse: (plan: Room, options: { name: string; floors: number }) => void }) {
  const [rotated, setRotated] = useState(fit.rotated);
  const [adjusted, setAdjusted] = useState<BuiltTemplate | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const shown = adjusted ?? fit.built;
  const usable = usableArea(plot);
  // On the plot, road at the bottom: the house turned if asked, set back from the boundary.
  const onPlot = facePlan(shown.plan, "south", rotated);
  const houseWidth = rotated ? shown.length : shown.width;
  const houseLength = rotated ? shown.width : shown.length;
  const x = plot.sides + Math.max(0, (usable.width - houseWidth) / 2) + 100;
  const y = plot.length - plot.front - houseLength + 100;
  const fits = houseWidth <= usable.width && houseLength <= usable.length;
  const pad = 2500;
  const minX = Math.min(0, x - 100) - pad;
  const minY = Math.min(0, y - 100) - pad;
  const maxX = Math.max(plot.width, x - 100 + houseWidth) + pad;
  const maxY = Math.max(plot.length, y - 100 + houseLength) + pad;
  const adjust = () => {
    const result = adjustTemplate(fit.built.template, rotated ? { width: usable.length, length: usable.width } : usable);
    if (!result) { setMessage("This plan cannot be made to fit this plot without making rooms too small."); return; }
    const changed = result.rooms.map((item) => { const before = fit.built.rooms.find((entry) => entry.name === item.name); return before && (before.width !== item.width || before.depth !== item.depth) ? `${item.name} ${size(before.width, before.depth)} → ${size(item.width, item.depth)}` : null; }).filter(Boolean);
    setAdjusted(result);
    setMessage(`House ${size(fit.built.width, fit.built.length)} → ${size(result.width, result.length)}. ${changed.length ? changed.join("; ") : "No room changed size"}. Doors and windows keep their sizes.`);
  };
  return (
    <section aria-label={`${fit.built.template.name} preview`} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="min-h-11 rounded-lg border px-3 text-sm">← Plans</button>
        <span aria-label="Fit status" className="rounded px-2 py-1 text-xs font-semibold">{fits ? (adjusted ? "ADJUSTED · FITS" : STATUS.best) : "DOES NOT FIT AS IS"}</span>
      </div>
      <h3 className="text-base font-semibold">{fit.built.template.name}</h3>
      <svg role="img" aria-label="Plan on the plot" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="w-full rounded-xl border bg-muted/20" style={{ maxHeight: "60vh" }}>
        <rect aria-label="Plot boundary" x={0} y={0} width={plot.width} height={plot.length} fill="none" stroke="#16a34a" strokeWidth={60} strokeDasharray="300 160" />
        <rect aria-label="Setbacks" x={plot.sides} y={plot.rear} width={usable.width} height={usable.length} fill="rgba(22,163,74,.06)" stroke="#16a34a" strokeWidth={25} strokeDasharray="120 120" />
        <g transform={`translate(${x} ${y})`}><PlanDrawing plan={onPlot} labels /></g>
        <Dimension from={{ x: x - 100, y: y - 100 - 900 }} to={{ x: x - 100 + houseWidth, y: y - 100 - 900 }} label={`${metres(houseWidth)} m`} />
        <Dimension from={{ x: x - 100 - 900, y: y - 100 }} to={{ x: x - 100 - 900, y: y - 100 + houseLength }} label={`${metres(houseLength)} m`} vertical />
        <text x={plot.width / 2} y={plot.length + 1500} textAnchor="middle" fontSize={700} fontWeight={700} fill="#16a34a">↓ ROAD · FRONT ({road.toUpperCase()})</text>
        <text x={plot.width / 2} y={-700} textAnchor="middle" fontSize={500} fill="#16a34a">Plot {size(plot.width, plot.length)}</text>
      </svg>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">House</dt><dd>{size(houseWidth, houseLength)}</dd>
        <dt className="text-muted-foreground">Floor area</dt><dd>{shown.area.toFixed(1)} m²</dd>
        <dt className="text-muted-foreground">Bedrooms · bathrooms</dt><dd>{shown.bedrooms} · {shown.bathrooms}</dd>
        <dt className="text-muted-foreground">Recommended plot</dt><dd>{size(fit.minimumPlot.width, fit.minimumPlot.length)}+</dd>
        <dt className="text-muted-foreground">Setbacks</dt><dd>front {metres(plot.front)} · sides {metres(plot.sides)} · back {metres(plot.rear)} m</dd>
      </dl>
      {message ? <p role="status" className="rounded-lg bg-muted/40 p-2 text-xs">{message}</p> : null}
      <button type="button" onClick={() => { setRotated((value) => !value); setAdjusted(null); setMessage(null); }} aria-pressed={rotated} className="min-h-11 w-full rounded-xl border text-sm">Rotate plan 90°</button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onUse(facePlan(shown.plan, road, rotated), { name: fit.built.template.name, floors })} className="min-h-12 rounded-xl bg-brand px-3 text-sm font-semibold text-brand-foreground">Use this plan</button>
        <button type="button" onClick={adjust} className="min-h-12 rounded-xl border px-3 text-sm font-semibold">Adjust to my plot</button>
      </div>
    </section>
  );
}

function Dimension({ from, to, label, vertical = false }: { from: { x: number; y: number }; to: { x: number; y: number }; label: string; vertical?: boolean }) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return (
    <g aria-label={`${vertical ? "Overall Y" : "Overall X"} ${label}`} stroke="#334155" strokeWidth={30}>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      <line x1={from.x - (vertical ? 200 : 0)} y1={from.y - (vertical ? 0 : 200)} x2={from.x + (vertical ? 200 : 0)} y2={from.y + (vertical ? 0 : 200)} />
      <line x1={to.x - (vertical ? 200 : 0)} y1={to.y - (vertical ? 0 : 200)} x2={to.x + (vertical ? 200 : 0)} y2={to.y + (vertical ? 0 : 200)} />
      <text x={mid.x - (vertical ? 250 : 0)} y={mid.y - (vertical ? 0 : 250)} textAnchor="middle" fontSize={450} fontWeight={700} fill="#0f172a" stroke="none" transform={vertical ? `rotate(-90 ${mid.x - 250} ${mid.y})` : undefined}>{label}</text>
    </g>
  );
}

function viewBoxOf(plan: Room, pad: number) {
  const xs = plan.corners.map((point) => point.x);
  const ys = plan.corners.map((point) => point.y);
  return `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;
}

/** The plan as built: rooms, walls at their thickness, doors and windows in them. */
function PlanDrawing({ plan, labels = false }: { plan: Room; labels?: boolean }) {
  const walls = housePlanWalls(plan);
  return (
    <g>
      {(plan.zones ?? []).map((zone) => {
        const xs = zone.boundary.map((point) => point.x);
        const ys = zone.boundary.map((point) => point.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        return (
          <g key={zone.id} aria-label={labels ? `Room ${zone.name}` : undefined}>
            <polygon points={zone.boundary.map((point) => `${point.x},${point.y}`).join(" ")} fill="rgba(56,189,248,.14)" />
            {labels ? <>
              <text x={cx} y={cy - 80} textAnchor="middle" fontSize={300} fontWeight={600} fill="#0f172a">{zone.name}</text>
              <text x={cx} y={cy + 300} textAnchor="middle" fontSize={260} fill="#475569">{metres(Math.max(...xs) - Math.min(...xs))} × {metres(Math.max(...ys) - Math.min(...ys))}</text>
            </> : null}
          </g>
        );
      })}
      {walls.map((wall) => <line key={wall.id} x1={wall.start.x} y1={wall.start.y} x2={wall.end.x} y2={wall.end.y} stroke="#1e293b" strokeWidth={wall.thickness} strokeLinecap="square" />)}
      {plan.openings.map((opening) => {
        const wall = walls.find((item) => item.id === opening.wallId);
        if (!wall) return null;
        const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
        const at = (offset: number) => ({ x: wall.start.x + (wall.end.x - wall.start.x) * offset / length, y: wall.start.y + (wall.end.y - wall.start.y) * offset / length });
        const a = at(opening.offset);
        const b = at(opening.offset + opening.width);
        return <g key={opening.id} aria-label={labels ? (opening.kind === "window" ? "Window" : "Door") : undefined}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="white" strokeWidth={wall.thickness + 20} />
          {opening.kind === "window" ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0284c7" strokeWidth={70} /> : opening.kind === "door" ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ea580c" strokeWidth={50} /> : null}
        </g>;
      })}
    </g>
  );
}
