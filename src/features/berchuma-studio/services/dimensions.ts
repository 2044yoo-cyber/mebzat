/** Standard visible clearance between adjacent drawer fronts, in millimetres. */
export const DRAWER_FRONT_GAP = 3;

/**
 * Allocates a whole-millimetre dimension between weighted physical sections.
 *
 * The same largest-remainder rule is used for drawer fronts, stacked modules
 * and bay widths. That keeps a rounded list of manufacturing parts exactly as
 * wide/tall as the physical opening it fills.
 */
export function distributeDimension(
  weights: readonly number[],
  available: number,
): number[] {
  const safeWeights = weights.map((weight) => Math.max(0, weight));
  const total = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const usable = Math.max(0, Math.floor(available));

  if (total <= 0 || usable <= 0) {
    return Array.from({ length: weights.length }, () => 0);
  }

  const rawDimensions = safeWeights.map((weight) => (weight / total) * usable);
  const dimensions = rawDimensions.map((dimension) => Math.floor(dimension));
  let remaining = usable - dimensions.reduce((sum, dimension) => sum + dimension, 0);

  // Give each spare millimetre to the largest fractional remainder. Adding all
  // rounding drift to the final section makes equal bays visibly unequal and
  // can push a shelf through its gable.
  const byRemainder = rawDimensions
    .map((dimension, index) => ({
      index,
      remainder: dimension - Math.floor(dimension),
    }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; remaining > 0 && index < byRemainder.length; index += 1) {
    const target = byRemainder[index];
    if (target) {
      dimensions[target.index] = (dimensions[target.index] ?? 0) + 1;
    }
    remaining -= 1;
  }

  return dimensions;
}

/**
 * Allocates sections after reserving their physical minimums.
 *
 * A drawer section is not allowed to become a 14 mm visual sliver merely
 * because another stacked section was given an enormous share.  The caller
 * supplies the minimums (for example 90 mm for drawers and zero for open or
 * hanging sections), then the remaining height is divided with exactly the
 * same whole-millimetre arithmetic used everywhere else.
 *
 * Callers validate that the sum of minimums fits first.  Returning the
 * available height proportionally in the impossible case keeps this low-level
 * arithmetic total-preserving for defensive rendering of legacy input, while
 * preventing it from silently claiming that impossible minimums fit.
 */
export function distributeDimensionWithMinimum(
  weights: readonly number[],
  available: number,
  minimums: readonly number[],
): number[] {
  const usable = Math.max(0, Math.floor(available));
  const floors = weights.map((_, index) =>
    Math.max(0, Math.floor(minimums[index] ?? 0)),
  );
  const reserved = floors.reduce((total, floor) => total + floor, 0);

  if (reserved > usable) {
    return distributeDimension(floors, usable);
  }

  const extra = distributeDimension(weights, usable - reserved);
  return floors.map((floor, index) => floor + (extra[index] ?? 0));
}
