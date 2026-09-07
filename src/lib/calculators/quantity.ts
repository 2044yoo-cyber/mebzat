import type { Quantity } from "@/lib/takeoff/measure";

/**
 * A measured quantity from numbers a person typed.
 *
 * The takeoff engine's trade functions — `concreteQuantity`, `paintQuantity`,
 * `masonryQuantity` — all take a `Quantity`, which carries provenance as well
 * as a number. That provenance is the point of the takeoff system and it is
 * worth keeping here: a figure a reader typed into a calculator is `"user"`
 * source at full confidence, which is exactly what it is, and it means the
 * calculators can hand their results straight to the same trade functions the
 * model-based takeoff uses instead of a parallel set that might disagree.
 *
 * `elementIds` is empty because there is no model behind a typed dimension.
 */
export function typed(label: string, value: number, unit: string, formula: string): Quantity {
  return {
    label,
    value,
    unit,
    formula,
    source: "user",
    confidence: 1,
    elementIds: [],
  };
}
