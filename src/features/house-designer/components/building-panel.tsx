"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import {
  BUILDING_TEMPLATES,
  TEMPLATES,
  areaRange,
  widthBounds,
  type BuildingAreas,
  type BuildingConfig,
  type BuildingTemplateId,
  type BuiltBuilding,
} from "../construction/building-config";
import { Section } from "./construction-panels";

/** m² for display: one decimal, so 149.99 reads 150.0. */
export const fmtArea = (m2: number) => m2.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtMetres = (mm: number) => (mm / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

const FLOOR_NAMES = ["Ground floor", "First floor", "Second floor", "Third floor"];
export const floorName = (index: number) => FLOOR_NAMES[index] ?? `Floor ${index}`;

/** One line that says which building is on screen. */
export function buildingSummary(building: BuiltBuilding): string {
  const { config, areas } = building;
  return `${TEMPLATES[config.template].label} · ${fmtMetres(config.length)} × ${fmtMetres(config.width)} m · ${config.floors} ${config.floors === 1 ? "floor" : "floors"} · ${fmtArea(areas.footprint)} m² a floor · ${fmtArea(areas.grossFloorArea)} m² in all`;
}

/**
 * A number the learner types. It follows the typing while the value is in range and settles
 * to the nearest allowed value when they leave the box, so "14150" is not mangled on its way
 * through "1", "14" and "141".
 */
function NumberField({ label, field, value, min, max, step, unit, disabled, note, onCommit }: {
  label: string; field: string; value: number; min: number; max: number; step: number; unit: string; disabled?: boolean; note?: string; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const settle = (raw: string, final: boolean) => {
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (n >= min && n <= max) onCommit(n);
    else if (final) onCommit(Math.min(max, Math.max(min, n)));
  };
  return (
    <label className="block text-xs">{label}
      <input
        type="number" inputMode="decimal" data-field={field} min={min} max={max} step={step} disabled={disabled}
        value={draft ?? String(value)}
        onChange={(e) => { setDraft(e.target.value); settle(e.target.value, false); }}
        onBlur={() => { if (draft !== null) settle(draft, true); setDraft(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="mt-1 min-h-11 w-full rounded-lg border bg-background px-2 text-sm disabled:opacity-60"
      />
      <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{note ?? `${min.toLocaleString("en-US")}–${max.toLocaleString("en-US")} ${unit}`}</span>
    </label>
  );
}

/** Column lines typed as a list, for the Existing Building. */
function LinesField({ label, field, value, editable, onCommit }: { label: string; field: "gridX" | "gridY"; value: number[]; editable: boolean; onCommit: (lines: number[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const parse = (text: string) => text.split(/[ ,;]+/).filter(Boolean).map(Number);
  return (
    <label className="block text-xs">{label}
      <input
        data-field={field} readOnly={!editable} value={draft ?? value.join(", ")}
        onChange={(e) => { setDraft(e.target.value); onCommit(parse(e.target.value)); }}
        onBlur={() => setDraft(null)}
        className={cn("mt-1 min-h-11 w-full rounded-lg border bg-background px-2 text-sm", !editable && "opacity-70")}
      />
    </label>
  );
}

const roofLabel = (areas: BuildingAreas) => (areas.roofType === "pitched" ? "Roof covering, along the slope" : "Roof, inside the parapet");

/** The areas, each with its definition: they are different numbers and are easy to mix up. */
export function AreaTable({ areas, floorNames }: { areas: BuildingAreas; floorNames?: string[] }) {
  const rows: { key: string; label: string; value: number | null; note: string; strong?: boolean }[] = [
    { key: "footprint", label: "Footprint", value: areas.footprint, note: "The ground-floor slab outline: what the building covers on the plot." },
    ...areas.areaPerFloor.map((a, i) => ({ key: `floor-${i}`, label: floorNames?.[i] ?? floorName(i), value: a, note: i === 0 ? "Area per floor: the slab outline of that floor, stairwell included, balconies not." : "" })),
    { key: "gfa", label: "Total gross floor area", value: areas.grossFloorArea, note: "All floors added up, balconies not included.", strong: true },
    { key: "balconies", label: "Cantilever balconies", value: areas.balconyPerFloor.reduce((s, a) => s + a, 0), note: "Slab outside the floor outline, counted apart from the floors." },
    { key: "roof", label: roofLabel(areas), value: areas.roofArea, note: areas.roofType === "pitched" ? `Plan area with the overhang: ${fmtArea(areas.roofPlanArea)} m².` : "The flat roof slab, less the parapet." },
  ];
  return (
    <table className="w-full text-xs" data-testid="building-areas">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} data-area={r.key} className="border-t first:border-t-0 align-top">
            <th scope="row" className={cn("py-1.5 pr-2 text-left font-medium", r.strong && "font-semibold")}>
              {r.label}
              {r.note ? <span className="block text-[11px] font-normal leading-tight text-muted-foreground">{r.note}</span> : null}
            </th>
            <td className={cn("whitespace-nowrap py-1.5 text-right tabular-nums", r.strong && "font-semibold")} data-value={r.value === null ? "" : r.value.toFixed(2)}>{r.value === null ? "–" : `${fmtArea(r.value)} m²`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export type BuildingPanelProps = {
  building: BuiltBuilding;
  /** The areas as they stand, with the roof the learner has chosen. */
  areas: BuildingAreas;
  onPatch: (patch: Partial<BuildingConfig>) => void;
  onArea: (areaM2: number) => void;
  onTemplate: (id: BuildingTemplateId) => void;
  onReset: () => void;
};

/** The building configurator: pick a template, change its size, see the areas that come out. */
export function BuildingPanel({ building, areas, onPatch, onArea, onTemplate, onReset }: BuildingPanelProps) {
  const { config, params } = building;
  const def = TEMPLATES[config.template];
  const [areaLo, areaHi] = areaRange(config.template, config.floorToFloor);
  const [widthLo, widthHi] = widthBounds(config.template, config.floorToFloor);
  const fixedFloors = def.limits.floors[0] === def.limits.floors[1];
  const existing = config.template === "existing";
  const perFloor = Math.round(areas.footprint * 10) / 10;
  return (
    <div className="space-y-2" data-testid="building-panel">
      <Section title="Building" testId="building-section">
        <div role="radiogroup" aria-label="Building template" className="grid grid-cols-2 gap-1.5">
          {BUILDING_TEMPLATES.map((id) => {
            const t = TEMPLATES[id];
            const on = id === config.template;
            return (
              <button key={id} type="button" role="radio" aria-checked={on} data-template={id} onClick={() => onTemplate(id)} className={cn("min-h-16 rounded-xl border p-2 text-left text-xs", on ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground")}>
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className="block text-[11px] leading-tight">{t.defaults.floors} floors · {t.roofType} roof</span>
                <span className="block text-[11px] leading-tight">{fmtMetres(t.defaults.length)} × {fmtMetres(t.defaults.width)} m</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="template-summary">{def.summary}</p>
        <ul className="flex flex-wrap gap-1 text-[11px]">{def.features.map((f) => <li key={f} className="rounded-full border px-2 py-0.5">{f}</li>)}</ul>
      </Section>

      <Section title="Size" testId="size-section">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <NumberField label="Length (mm)" field="length" value={config.length} min={def.limits.length[0]} max={def.limits.length[1]} step={50} unit="mm" onCommit={(length) => onPatch({ length, gridX: undefined })} />
          <NumberField label="Width (mm)" field="width" value={config.width} min={widthLo} max={widthHi} step={50} unit="mm" onCommit={(width) => onPatch({ width, gridY: undefined })} />
          <NumberField label="Area per floor (m²)" field="areaPerFloor" value={perFloor} min={Math.ceil(areaLo)} max={Math.floor(areaHi)} step={1} unit="m²" note={`Changes length and width together, keeping the shape. ${Math.ceil(areaLo)}–${Math.floor(areaHi)} m².`} onCommit={onArea} />
          <NumberField label="Total floor area (m²)" field="totalFloorArea" value={Math.round(areas.grossFloorArea * 10) / 10} min={Math.ceil(areaLo * config.floors)} max={Math.floor(areaHi * config.floors)} step={1} unit="m²" note={`All ${config.floors} floors together; sets the area per floor.`} onCommit={(total) => onArea(total / config.floors)} />
          <NumberField label="Floors" field="floors" value={config.floors} min={def.limits.floors[0]} max={def.limits.floors[1]} step={1} unit="floors" disabled={fixedFloors} note={fixedFloors ? def.floorsNote ?? `${def.label} has ${config.floors} floors.` : undefined} onCommit={(floors) => onPatch({ floors })} />
          <NumberField label="Floor to floor height (mm)" field="floorToFloor" value={config.floorToFloor} min={def.limits.floorToFloor[0]} max={def.limits.floorToFloor[1]} step={50} unit="mm" onCommit={(floorToFloor) => onPatch({ floorToFloor })} />
        </div>
        {existing ? (
          <details className="text-xs">
            <summary className="min-h-9 cursor-pointer py-2 font-medium">Column lines (millimetres)</summary>
            <div className="space-y-2">
              <LinesField label="Lines across (5, increasing, at least 1500 apart)" field="gridX" value={params.gridX} editable onCommit={(gridX) => onPatch({ gridX })} />
              <LinesField label="Lines deep (3)" field="gridY" value={params.gridY} editable onCommit={(gridY) => onPatch({ gridY })} />
            </div>
          </details>
        ) : (
          <p className="text-[11px] text-muted-foreground">The column lines are set from the length and width: {params.gridX.join(", ")} across, {params.gridY.join(", ")} deep.</p>
        )}
      </Section>

      <Section title="Areas" testId="areas-section">
        <AreaTable areas={areas} />
      </Section>

      <button type="button" data-testid="reset-building" onClick={onReset} className="min-h-10 rounded-xl border px-4 text-sm">Back to the example dimensions</button>
    </div>
  );
}
