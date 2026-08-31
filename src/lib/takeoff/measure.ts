import {
  combine,
  measured,
  weakest,
  type BuildingElement,
  type DataSource,
  type ElementIndex,
  type Measured,
} from "./model";

/**
 * The arithmetic.
 *
 * The brief drew the line exactly where it belongs: *AI extracts and
 * interprets, the application calculates.* A model reading a drawing and saying
 * "this wall is 18.40 m long and 3.00 m high with two doors in it" is doing the
 * thing models are good at. A model then answering "so the net plaster area is
 * 46.80 m²" is doing arithmetic badly and unrepeatably, and there is no way to
 * check it short of doing the sum yourself.
 *
 * So every quantity below is a formula over stated dimensions, and every result
 * carries the formula that produced it as a string. The brief's requirement is
 * that a user can inspect *why* a quantity was generated; the answer is that
 * they can read the sum.
 *
 *   18.40 × 3.00 − 8.40 = 46.80 m²
 *
 * Millimetres in, metres and square metres out. The conversion happens once,
 * here, rather than being remembered at forty call sites.
 */

/** One measured quantity, with its working shown. */
export type Quantity = {
  /** What was measured: "Net wall area", "Concrete volume". */
  label: string;
  value: number;
  unit: string;
  /** The sum, in the units it was done in. Printed on the takeoff sheet. */
  formula: string;
  source: DataSource;
  confidence: number;
  /** Which elements this came from. The link back to the 3D model. */
  elementIds: string[];
};

const MM_TO_M = 1000;

function m(value: Measured | undefined): number {
  return (value?.value ?? 0) / MM_TO_M;
}

function fmt(value: number, places = 2): string {
  return value.toFixed(places);
}

/**
 * Gross area of one face of a wall or slab.
 *
 * Length × height, before anything is taken out of it.
 */
export function grossArea(element: BuildingElement): Quantity | null {
  if (!element.length || !element.height) return null;

  const length = m(element.length);
  const height = m(element.height);
  const count = element.count?.value ?? 1;
  const value = round(length * height * count, 3);

  const result = combine(
    value,
    element.length,
    element.height,
    ...(element.count ? [element.count] : []),
  );

  return {
    label: `${element.name} gross area`,
    value,
    unit: "m²",
    formula:
      count === 1
        ? `${fmt(length)} × ${fmt(height)} = ${fmt(value)} m²`
        : `${fmt(length)} × ${fmt(height)} × ${count} = ${fmt(value)} m²`,
    source: result.source,
    confidence: result.confidence,
    elementIds: [element.id],
  };
}

/**
 * Area of the holes in an element.
 *
 * Doors and windows, resolved through the index. An opening with no dimensions
 * contributes nothing and is named in the formula as unmeasured, rather than
 * silently counting as zero — a wall that quietly loses a 2.1 m² door is a wall
 * that is over-plastered and over-painted on every subsequent line.
 */
export function openingArea(
  element: BuildingElement,
  index: ElementIndex,
): Quantity {
  const openings = index.openingsOf(element);
  const terms: string[] = [];
  const inputs: Measured[] = [];
  const ids: string[] = [];
  let total = 0;
  let unmeasured = 0;

  for (const opening of openings) {
    // Named in the model, so it belongs to this line whether or not it could
    // be measured — clicking the quantity should highlight the door somebody
    // still has to go and measure.
    ids.push(opening.id);

    if (!opening.width || !opening.height) {
      unmeasured += 1;
      continue;
    }
    const width = m(opening.width);
    const height = m(opening.height);
    const count = opening.count?.value ?? 1;
    const area = width * height * count;

    total += area;
    inputs.push(opening.width, opening.height);
    terms.push(
      count === 1
        ? `${fmt(width)} × ${fmt(height)}`
        : `${fmt(width)} × ${fmt(height)} × ${count}`,
    );
  }

  const value = round(total, 3);
  const result = combine(value, ...inputs);

  return {
    label: `${element.name} openings`,
    value,
    unit: "m²",
    // The unmeasured count is appended in every branch. An earlier version put
    // it only on the branch where something *was* measured, so a wall whose
    // openings were all unmeasured reported a flat "no measured openings" and
    // lost the warning — in exactly the case where the wall is most overstated.
    formula:
      (terms.length === 0
        ? "no measured openings"
        : `${terms.join(" + ")} = ${fmt(value)} m²`) +
      (unmeasured > 0
        ? ` (${unmeasured} opening${unmeasured === 1 ? "" : "s"} not measured)`
        : ""),
    source: inputs.length === 0 ? "calculated" : result.source,
    confidence: inputs.length === 0 ? 1 : result.confidence,
    elementIds: [element.id, ...ids],
  };
}

/**
 * What is actually left to plaster, paint or tile.
 *
 * The brief's worked example, and the one every estimator checks first:
 *
 *   18.40 × 3.00 − 8.40 = 46.80 m²
 *
 * Clamped at zero. Openings larger than the wall mean the input is wrong, and a
 * negative area propagating into a cost is worse than a zero that gets queried.
 */
export function netArea(
  element: BuildingElement,
  index: ElementIndex,
): Quantity | null {
  const gross = grossArea(element);
  if (!gross) return null;

  const openings = openingArea(element, index);
  const value = round(Math.max(0, gross.value - openings.value), 3);

  return {
    label: `${element.name} net area`,
    value,
    unit: "m²",
    formula:
      openings.value > 0
        ? `${gross.formula.split(" = ")[0]} − ${fmt(openings.value)} = ${fmt(value)} m²`
        : gross.formula,
    source: openings.value > 0 ? weakest(gross.source, openings.source) : gross.source,
    confidence: Math.min(gross.confidence, openings.confidence),
    elementIds: [...new Set([...gross.elementIds, ...openings.elementIds])],
  };
}

/**
 * Both faces of a wall, which is what plastering and painting are measured in.
 *
 * An internal wall is plastered twice; an external one is plastered inside and
 * rendered outside, which are different trades at different rates. So this
 * returns the one-face figure doubled and the caller decides — rather than
 * quietly assuming two faces and being wrong on every external wall.
 */
export function bothFaces(area: Quantity): Quantity {
  return {
    ...area,
    label: `${area.label}, both faces`,
    value: round(area.value * 2, 3),
    formula: `(${area.formula.split(" = ")[0]}) × 2 = ${fmt(area.value * 2)} m²`,
  };
}

/** Volume of a rectangular element: length × width or thickness × height. */
export function volume(element: BuildingElement): Quantity | null {
  const length = element.length;
  const height = element.height;
  const thickness = element.thickness ?? element.width;

  if (!length || !height || !thickness) return null;

  const l = m(length);
  const h = m(height);
  const t = m(thickness);
  const count = element.count?.value ?? 1;
  const value = round(l * h * t * count, 4);

  const result = combine(
    value,
    length,
    height,
    thickness,
    ...(element.count ? [element.count] : []),
  );

  return {
    label: `${element.name} volume`,
    value,
    unit: "m³",
    formula:
      count === 1
        ? `${fmt(l)} × ${fmt(h)} × ${fmt(t, 3)} = ${fmt(value, 3)} m³`
        : `${fmt(l)} × ${fmt(h)} × ${fmt(t, 3)} × ${count} = ${fmt(value, 3)} m³`,
    source: result.source,
    confidence: result.confidence,
    elementIds: [element.id],
  };
}

/**
 * Wall volume with the openings taken out.
 *
 * Masonry and concrete are bought by volume, and a wall with four doors in it
 * contains noticeably less blockwork than its gross volume suggests.
 */
export function netVolume(
  element: BuildingElement,
  index: ElementIndex,
): Quantity | null {
  const area = netArea(element, index);
  const thickness = element.thickness ?? element.width;
  if (!area || !thickness) return null;

  const t = m(thickness);
  const value = round(area.value * t, 4);

  return {
    label: `${element.name} net volume`,
    value,
    unit: "m³",
    formula: `${fmt(area.value)} × ${fmt(t, 3)} = ${fmt(value, 3)} m³`,
    source: weakest(area.source, thickness.source),
    confidence: Math.min(area.confidence, thickness.confidence),
    elementIds: area.elementIds,
  };
}

/** Floor area of a room. */
export function floorArea(element: BuildingElement): Quantity | null {
  if (!element.length || !element.width) return null;

  const length = m(element.length);
  const width = m(element.width);
  const value = round(length * width, 3);
  const result = combine(value, element.length, element.width);

  return {
    label: `${element.name} floor area`,
    value,
    unit: "m²",
    formula: `${fmt(length)} × ${fmt(width)} = ${fmt(value)} m²`,
    source: result.source,
    confidence: result.confidence,
    elementIds: [element.id],
  };
}

/** Perimeter of a room, for skirting and cornice. */
export function perimeter(element: BuildingElement): Quantity | null {
  if (!element.length || !element.width) return null;

  const length = m(element.length);
  const width = m(element.width);
  const value = round((length + width) * 2, 3);
  const result = combine(value, element.length, element.width);

  return {
    label: `${element.name} perimeter`,
    value,
    unit: "m",
    formula: `(${fmt(length)} + ${fmt(width)}) × 2 = ${fmt(value)} m`,
    source: result.source,
    confidence: result.confidence,
    elementIds: [element.id],
  };
}

/**
 * Adds a waste allowance to a measured quantity.
 *
 * Kept as its own step with its own line rather than folded into the
 * measurement, because the measured quantity and the ordered quantity are
 * different numbers and a bill that shows only the second cannot be checked
 * against a drawing.
 */
export function withWaste(quantity: Quantity, wastePercent: number): Quantity {
  const waste = Math.max(0, wastePercent);
  const value = round(quantity.value * (1 + waste / 100), 3);

  return {
    ...quantity,
    label: `${quantity.label} incl. ${waste}% waste`,
    value,
    formula: `${fmt(quantity.value)} + ${waste}% = ${fmt(value)} ${quantity.unit}`,
  };
}

/** Sums quantities of the same unit, keeping the provenance of the worst. */
export function total(label: string, parts: Quantity[]): Quantity | null {
  if (parts.length === 0) return null;

  const unit = parts[0]!.unit;
  const mismatched = parts.find((part) => part.unit !== unit);
  if (mismatched) {
    // Adding m² to m³ is not a rounding problem, it is a wrong answer with a
    // plausible magnitude. Refusing is the only safe behaviour.
    return null;
  }

  const value = round(
    parts.reduce((sum, part) => sum + part.value, 0),
    3,
  );

  return {
    label,
    value,
    unit,
    formula: `${parts.map((part) => fmt(part.value)).join(" + ")} = ${fmt(value)} ${unit}`,
    // `weakest` rather than a running comparison seeded with "calculated":
    // seeding that way made a total of five BIM quantities come out as
    // "calculated", which reads as less certain than it is. A sum of BIM
    // numbers is still BIM-grade.
    source: weakest(...parts.map((part) => part.source)),
    confidence: Math.min(...parts.map((part) => part.confidence)),
    elementIds: [...new Set(parts.flatMap((part) => part.elementIds))],
  };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export { measured };
