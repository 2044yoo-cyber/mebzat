import { round } from "./units";

/**
 * Plane and solid geometry, plus the two things buildings do with an angle:
 * stairs and slopes.
 */

// ---------------------------------------------------------------------------
// Areas
// ---------------------------------------------------------------------------

export const AREA_SHAPES = [
  { value: "rectangle", label: "Rectangle" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle (base × height)" },
  { value: "triangle_sides", label: "Triangle (three sides)" },
  { value: "circle", label: "Circle" },
  { value: "trapezoid", label: "Trapezoid" },
] as const;

export type AreaShape = (typeof AREA_SHAPES)[number]["value"];

export function shapeArea(
  shape: AreaShape,
  d: { a?: number; b?: number; c?: number; h?: number },
): { area: number; formula: string } {
  const a = d.a ?? 0;
  const b = d.b ?? 0;
  const c = d.c ?? 0;
  const h = d.h ?? 0;

  switch (shape) {
    case "rectangle":
      return { area: a * b, formula: `${a} × ${b} = ${(a * b).toFixed(3)} m²` };
    case "square":
      return { area: a * a, formula: `${a}² = ${(a * a).toFixed(3)} m²` };
    case "triangle":
      return { area: (a * h) / 2, formula: `(${a} × ${h}) ÷ 2 = ${((a * h) / 2).toFixed(3)} m²` };
    case "triangle_sides": {
      // Heron's formula. It returns nothing for three lengths that cannot close
      // into a triangle, which is a real thing to type by accident.
      const s = (a + b + c) / 2;
      const under = s * (s - a) * (s - b) * (s - c);
      if (under <= 0) {
        return { area: 0, formula: `Those three sides cannot form a triangle.` };
      }
      const area = Math.sqrt(under);
      return {
        area,
        formula: `s = ${s.toFixed(3)}; √(s(s−a)(s−b)(s−c)) = ${area.toFixed(3)} m²`,
      };
    }
    case "circle": {
      const r = a / 2;
      return { area: Math.PI * r * r, formula: `π × (${a} ÷ 2)² = ${(Math.PI * r * r).toFixed(3)} m²` };
    }
    case "trapezoid":
      return {
        area: ((a + b) / 2) * h,
        formula: `((${a} + ${b}) ÷ 2) × ${h} = ${(((a + b) / 2) * h).toFixed(3)} m²`,
      };
  }
}

// ---------------------------------------------------------------------------
// Volumes
// ---------------------------------------------------------------------------

export const VOLUME_SHAPES = [
  { value: "box", label: "Box / cuboid" },
  { value: "cylinder", label: "Cylinder" },
  { value: "cone", label: "Cone" },
  { value: "sphere", label: "Sphere" },
  { value: "pyramid", label: "Rectangular pyramid" },
  { value: "prism", label: "Triangular prism" },
] as const;

export type VolumeShape = (typeof VOLUME_SHAPES)[number]["value"];

export function shapeVolume(
  shape: VolumeShape,
  d: { a?: number; b?: number; h?: number },
): { volume: number; formula: string } {
  const a = d.a ?? 0;
  const b = d.b ?? 0;
  const h = d.h ?? 0;

  switch (shape) {
    case "box":
      return { volume: a * b * h, formula: `${a} × ${b} × ${h} = ${(a * b * h).toFixed(4)} m³` };
    case "cylinder": {
      const r = a / 2;
      const v = Math.PI * r * r * h;
      return { volume: v, formula: `π × (${a} ÷ 2)² × ${h} = ${v.toFixed(4)} m³` };
    }
    case "cone": {
      const r = a / 2;
      const v = (Math.PI * r * r * h) / 3;
      return { volume: v, formula: `π × (${a} ÷ 2)² × ${h} ÷ 3 = ${v.toFixed(4)} m³` };
    }
    case "sphere": {
      const r = a / 2;
      const v = (4 / 3) * Math.PI * r ** 3;
      return { volume: v, formula: `4/3 × π × (${a} ÷ 2)³ = ${v.toFixed(4)} m³` };
    }
    case "pyramid": {
      const v = (a * b * h) / 3;
      return { volume: v, formula: `(${a} × ${b} × ${h}) ÷ 3 = ${v.toFixed(4)} m³` };
    }
    case "prism": {
      const v = ((a * b) / 2) * h;
      return { volume: v, formula: `((${a} × ${b}) ÷ 2) × ${h} = ${v.toFixed(4)} m³` };
    }
  }
}

// ---------------------------------------------------------------------------
// Slope
// ---------------------------------------------------------------------------

export type Slope = {
  percent: number;
  degrees: number;
  ratio: string;
  /** Length along the slope, for the same rise and run. */
  slopeLength: number;
};

export function slope(rise: number, run: number): Slope | null {
  if (run <= 0) return null;
  const percent = (rise / run) * 100;
  const degrees = (Math.atan(rise / run) * 180) / Math.PI;
  const ratio = rise === 0 ? "flat" : `1 : ${round(run / rise, 2)}`;
  return {
    percent: round(percent, 2),
    degrees: round(degrees, 2),
    ratio,
    slopeLength: round(Math.hypot(rise, run), 3),
  };
}

// ---------------------------------------------------------------------------
// Stairs
// ---------------------------------------------------------------------------

export type StairResult = {
  risers: number;
  riserHeight: number;
  treads: number;
  treadDepth: number;
  totalRun: number;
  angle: number;
  /** 2R + T, the comfort rule. Comfortable flights land near 620 mm. */
  walkingLine: number;
  warnings: string[];
  formula: string[];
};

/**
 * A straight flight.
 *
 * Risers come first because the floor-to-floor height is fixed and the riser
 * has to divide into it exactly — you cannot have 14.6 steps. So the preferred
 * riser picks the *count*, and the count then sets the actual riser height.
 * Doing it the other way round leaves a short step at the top, which is both a
 * building-code failure and the single most common way people fall on stairs.
 *
 * There is one tread fewer than there are risers: the top riser lands on the
 * floor above, and that floor is its tread.
 */
export function stairs(input: {
  floorToFloor: number;
  preferredRiser: number;
  treadDepth: number;
  availableRun?: number;
}): StairResult | null {
  const { floorToFloor, preferredRiser, treadDepth } = input;
  if (floorToFloor <= 0 || preferredRiser <= 0) return null;

  const risers = Math.max(1, Math.round(floorToFloor / preferredRiser));
  const riserHeight = floorToFloor / risers;
  const treads = Math.max(1, risers - 1);
  const totalRun = treads * treadDepth;
  const angle = (Math.atan(riserHeight / treadDepth) * 180) / Math.PI;
  const walkingLine = 2 * riserHeight + treadDepth;

  const warnings: string[] = [];
  const riserMm = riserHeight * 1000;
  const treadMm = treadDepth * 1000;

  if (riserMm < 150 || riserMm > 190) {
    warnings.push(
      `Riser is ${riserMm.toFixed(0)} mm. Comfortable stairs are 150–190 mm; outside that, check the local code.`,
    );
  }
  if (treadMm < 250) {
    warnings.push(
      `Tread is ${treadMm.toFixed(0)} mm. Below 250 mm a foot overhangs the step going down.`,
    );
  }
  if (walkingLine * 1000 < 550 || walkingLine * 1000 > 700) {
    warnings.push(
      `2 × riser + tread is ${(walkingLine * 1000).toFixed(0)} mm. The comfort rule wants 550–700 mm, ideally about 620 mm.`,
    );
  }
  if (angle > 42) {
    warnings.push(`The flight is ${angle.toFixed(1)}° — steep. Most codes cap a private stair near 42°.`);
  }
  if (input.availableRun && input.availableRun > 0 && totalRun > input.availableRun) {
    warnings.push(
      `The flight needs ${totalRun.toFixed(2)} m of run but only ${input.availableRun.toFixed(2)} m is available. Use a landing, a winder, or a deeper riser.`,
    );
  }

  return {
    risers,
    // Deliberately NOT rounded. `risers × riserHeight` has to come back to the
    // storey height exactly — that is the whole point of deriving the riser
    // from the count rather than the other way round — and rounding here to
    // four places leaves 0.5 mm unaccounted for across a flight, which is a
    // short step at the top. The display formats it; the value stays exact.
    riserHeight,
    treads,
    treadDepth: round(treadDepth, 3),
    totalRun: round(totalRun, 3),
    angle: round(angle, 2),
    walkingLine: round(walkingLine, 3),
    warnings,
    formula: [
      `Risers = round(${floorToFloor.toFixed(3)} m ÷ ${preferredRiser.toFixed(3)} m) = ${risers}`,
      `Riser height = ${floorToFloor.toFixed(3)} ÷ ${risers} = ${(riserHeight * 1000).toFixed(1)} mm`,
      `Treads = ${risers} − 1 = ${treads} (the top riser lands on the floor above)`,
      `Total run = ${treads} × ${treadMm.toFixed(0)} mm = ${totalRun.toFixed(3)} m`,
      `Angle = atan(${(riserHeight * 1000).toFixed(1)} ÷ ${treadMm.toFixed(0)}) = ${round(angle, 2)}°`,
      `2R + T = ${(walkingLine * 1000).toFixed(0)} mm`,
    ],
  };
}
