import type { BoqSectionCode } from "@/lib/takeoff/boq";

import { box, cyl, type P2, type Shape } from "./geometry";
import type { Ctx } from "./context";
import type { ComponentRecord, Allowance, Provenance, QuantityItem, QuantityUnit } from "./types";

export const MM3_TO_M3 = 1e-9;
export const MM2_TO_M2 = 1e-6;
export const m3 = (x: number, y: number, z: number) => (x * y * z) * MM3_TO_M3;
export const m2 = (x: number, y: number) => (x * y) * MM2_TO_M2;
export const metres = (mm: number) => mm / 1000;
export const f2 = (n: number) => n.toFixed(2);
export const f3 = (n: number) => n.toFixed(3);

/** A shape list for a rectangular hoop in the XY plane (a column stirrup), made of four thin bars. */
export function hoopXY(cx: number, cy: number, z: number, sx: number, sy: number, bar: number): Shape[] {
  return [
    box(cx, cy - sy / 2 + bar / 2, z, sx, bar, bar), box(cx, cy + sy / 2 - bar / 2, z, sx, bar, bar),
    box(cx - sx / 2 + bar / 2, cy, z, bar, sy, bar), box(cx + sx / 2 - bar / 2, cy, z, bar, sy, bar),
  ];
}

/** A hoop standing in the YZ plane (a stirrup around a beam running along X). */
export function hoopYZ(cx: number, cy: number, cz: number, sy: number, sz: number, bar: number): Shape[] {
  return [
    box(cx, cy, cz - sz / 2 + bar / 2, bar, sy, bar), box(cx, cy, cz + sz / 2 - bar / 2, bar, sy, bar),
    box(cx, cy - sy / 2 + bar / 2, cz, bar, bar, sz), box(cx, cy + sy / 2 - bar / 2, cz, bar, bar, sz),
  ];
}

/** A hoop in the XZ plane (a stirrup around a beam running along Y). */
export function hoopXZ(cx: number, cy: number, cz: number, sx: number, sz: number, bar: number): Shape[] {
  return [
    box(cx, cy, cz - sz / 2 + bar / 2, sx, bar, bar), box(cx, cy, cz + sz / 2 - bar / 2, sx, bar, bar),
    box(cx - sx / 2 + bar / 2, cy, cz, bar, bar, sz), box(cx + sx / 2 - bar / 2, cy, cz, bar, bar, sz),
  ];
}

/** A bar between two plan points at height z: a cylinder when it runs along an axis, a thin box otherwise. */
export function barBetween(a: P2, b: P2, z: number, diameter: number): Shape {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  if (Math.abs(dy) < 1e-6) return cyl(cx, cy, z, diameter / 2, len, "x");
  if (Math.abs(dx) < 1e-6) return cyl(cx, cy, z, diameter / 2, len, "y");
  return box(cx, cy, z, len, diameter, diameter, Math.atan2(dy, dx));
}

/** Evenly spaced positions from `from` to `to` (inclusive), no closer than `spacing`. */
export function spaced(from: number, to: number, spacing: number): number[] {
  if (to <= from) return [from];
  const n = Math.max(1, Math.floor((to - from) / spacing));
  const step = (to - from) / n;
  return Array.from({ length: n + 1 }, (_, i) => from + i * step);
}

/** Points from `from` to `to`, evenly spread, no two more than `max` apart, the ends included. (`spaced` can leave nearly twice its spacing between two.) */
export function spacedWithin(from: number, to: number, max: number): number[] {
  if (to <= from) return [from];
  const n = Math.max(1, Math.ceil((to - from) / max - 1e-9));
  const step = (to - from) / n;
  return Array.from({ length: n + 1 }, (_, i) => from + i * step);
}

// ---------------------------------------------------------------------------
// Steel: weight only from approved data
// ---------------------------------------------------------------------------

export const STEEL_DENSITY = 7850; // kg/m³, the conventional value

/** Theoretical mass of a plain round bar, kg per metre: π/4 · d² · density (≈ d²/162.2 with d in mm). */
export function steelKgPerMetre(diameterMm: number): number {
  const d = diameterMm / 1000;
  return (Math.PI / 4) * d * d * STEEL_DENSITY;
}

export type ApprovedBar = { componentId: string; mark: string; diameterMm: number; lengthMm: number; count: number };

export function steelWeightKg(bars: readonly { diameterMm: number; lengthMm: number; count: number }[]): number {
  return bars.reduce((sum, bar) => sum + steelKgPerMetre(bar.diameterMm) * (bar.lengthMm / 1000) * bar.count, 0);
}

// ---------------------------------------------------------------------------
// Quantity builders: one place that shapes each kind of BOQ line
// ---------------------------------------------------------------------------

type Common = { workItem: string; description: string; section: BoqSectionCode; unit: QuantityUnit };

export function addQuantity(
  ctx: Ctx,
  component: ComponentRecord,
  base: Common & { value: number | null; formula: string; inputs: Record<string, number | string>; status: Provenance },
  extra: { allowance?: Allowance | null; assumptions?: string[]; exclusions?: string[]; sourceGeometry?: string; materialSpec?: string; room?: string | null } = {},
): QuantityItem {
  return ctx.quantity(component, { ...base, ...(extra.allowance !== undefined ? { allowance: extra.allowance } : {}), assumptions: extra.assumptions ?? [], exclusions: extra.exclusions ?? [], ...(extra.sourceGeometry ? { sourceGeometry: extra.sourceGeometry } : {}), ...(extra.materialSpec ? { materialSpec: extra.materialSpec } : {}), ...(extra.room !== undefined ? { room: extra.room } : {}) });
}

/** Net concrete volume; the allowance is a separate field. */
export function concreteQuantity(ctx: Ctx, component: ComponentRecord, workItem: string, description: string, volumeM3: number, formula: string, inputs: Record<string, number | string>, status: Provenance, assumptions: string[] = [], exclusions: string[] = []) {
  return addQuantity(ctx, component, { workItem, description, section: "C", unit: "m³", value: round(volumeM3, 4), formula, inputs, status },
    { allowance: { rule: "Ordering allowance for spillage and level variation (example assumption)", percent: ctx.rules.allowances.concrete }, assumptions, exclusions: ["Reinforcement steel", "Formwork", ...exclusions] });
}

export function formworkQuantity(ctx: Ctx, component: ComponentRecord, workItem: string, description: string, areaM2: number, formula: string, inputs: Record<string, number | string>, status: Provenance = "calculated", assumptions: string[] = []) {
  return addQuantity(ctx, component, { workItem, description, section: "E", unit: "m²", value: round(areaM2, 3), formula, inputs, status }, { assumptions, exclusions: ["Props", "Reuse allowance"] });
}

/**
 * Reinforcement is quantified only from an approved bar schedule. Without
 * one the line exists, says what is missing, and has no number: the bars in
 * the 3D model are an illustration, and a weight taken from them would read
 * as a figure somebody could order.
 */
export function rebarQuantity(ctx: Ctx, component: ComponentRecord, description: string, approved: readonly ApprovedBar[]) {
  const mine = approved.filter((bar) => bar.componentId === component.id);
  if (mine.length === 0) {
    return addQuantity(ctx, component, {
      workItem: `steel.${component.kind}`, description, section: "D", unit: "kg", value: null,
      formula: "Σ (π/4 · d² · 7850 · bar length · number of bars) — needs an approved bar schedule (bar marks, diameters, lengths, numbers)",
      inputs: { schedule: "none" }, status: "missing",
    }, { assumptions: ["The bars drawn in 3D are schematic and are not counted."], exclusions: ["Laps", "Cover blocks", "Tying wire", "Cutting waste"] });
  }
  const kg = steelWeightKg(mine);
  return addQuantity(ctx, component, {
    workItem: `steel.${component.kind}`, description, section: "D", unit: "kg", value: round(kg, 2),
    formula: mine.map((bar) => `${bar.count} × ${f3(bar.lengthMm / 1000)} m × ${f3(steelKgPerMetre(bar.diameterMm))} kg/m (⌀${bar.diameterMm}, ${bar.mark})`).join(" + ") + ` = ${f2(kg)} kg`,
    inputs: Object.fromEntries(mine.map((bar) => [bar.mark, `${bar.count} × ⌀${bar.diameterMm} × ${bar.lengthMm} mm`])), status: "review",
  }, { allowance: { rule: "Cutting waste and laps per the approved schedule", percent: null }, assumptions: ["Weight is theoretical, from the supplied approved schedule."] });
}

export function round(value: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
