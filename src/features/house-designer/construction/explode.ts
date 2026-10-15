import type { Shape, V3 } from "./geometry";
import { CATEGORY_IDS, type CategoryId, type ComponentRecord, type ConstructionModel, type ViewState } from "./types";

/**
 * The exploded view. Nothing here touches geometry: it works out a temporary
 * offset for each component (and, for wall layers, each shape) from the
 * explode slider. At zero every offset is exactly zero, so assembling the
 * model again restores the geometry exactly.
 */

/** mm of separation between storeys at full explosion. */
export const FLOOR_STEP = 2600;
/** mm of separation between categories at full explosion, along a fixed diagonal. */
export const CATEGORY_STEP = 900;
/** mm between adjacent layers of a component at full explosion. */
export const LAYER_STEP = 350;

const DIAGONAL = { x: 0.6, y: -0.8, z: 0 };

export const ZERO: V3 = { x: 0, y: 0, z: 0 };
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const isZero = (v: V3) => v.x === 0 && v.y === 0 && v.z === 0;

export type ExplodeInfo = {
  /** Whole-component offset: from the storey and the category. */
  base: V3;
  /** Layer shift, per layer index: along `dir`, or away from the centre when `radial`. */
  layerDistance: number;
  dir: V3;
  radial: boolean;
};

const CATEGORY_RANK = new Map<CategoryId, number>(CATEGORY_IDS.map((id, i) => [id, i]));

export function explodeInfo(c: ComponentRecord, view: ViewState, model: ConstructionModel): ExplodeInfo {
  const a = Math.max(0, Math.min(1, view.explode.amount));
  if (a === 0) return { base: ZERO, layerDistance: 0, dir: ZERO, radial: false };
  let base = ZERO;
  if (view.explode.floors) {
    // Below-ground work sinks, each storey above rises.
    const lift = c.storeyIndex < 0 ? -0.6 : c.storeyIndex;
    base = add(base, { x: 0, y: 0, z: lift * a * FLOOR_STEP });
  }
  if (view.explode.categories) {
    const rank = (CATEGORY_RANK.get(c.category) ?? 0) - (CATEGORY_IDS.length - 1) / 2;
    base = add(base, scale(DIAGONAL, rank * a * CATEGORY_STEP));
  }
  const radial = isZero(c.explode.dir);
  const dir = radial ? ZERO : c.explode.dir;
  const layerDistance = view.explode.layers ? c.explode.layerIndex * a * LAYER_STEP : 0;
  void model;
  return { base, layerDistance, dir, radial };
}

/** Offset for one shape: the component's base offset plus its layer shift. */
export function shapeOffset(shape: Shape, info: ExplodeInfo, centre: V3): V3 {
  if (info.layerDistance === 0) return info.base;
  if (!info.radial) return add(info.base, scale(info.dir, info.layerDistance));
  const p = shape.t === "prism" ? { x: shape.poly[0]!.x, y: shape.poly[0]!.y } : { x: shape.c.x, y: shape.c.y };
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  const len = Math.hypot(dx, dy) || 1;
  return add(info.base, { x: (dx / len) * info.layerDistance, y: (dy / len) * info.layerDistance, z: 0 });
}

/** True when nothing is displaced: the model is assembled. */
export function isAssembled(view: ViewState): boolean {
  return view.explode.amount === 0;
}
