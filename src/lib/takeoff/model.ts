/**
 * What a building is made of, and where each number came from.
 *
 * The element model everything downstream measures: takeoff, BOQ, cost, and the
 * highlighting that links a BOQ line back to the walls it was measured from.
 *
 * ## Provenance is not decoration
 *
 * The brief was blunt about this and it is the right instinct: *never present an
 * AI-estimated value as verified BIM information.* A wall length read out of an
 * IFC file and a wall length a vision model guessed off a scanned drawing are
 * both numbers, both plausible, and one of them can be built from.
 *
 * So every dimension carries where it came from, and — this is the part that is
 * easy to get wrong — **a calculation is only as trustworthy as its worst
 * input.** Multiply a BIM length by an estimated height and the answer is an
 * estimate. `weakest()` enforces that, so provenance degrades automatically
 * rather than by remembering to downgrade it at each step.
 */

/**
 * Where a number came from, best first.
 *
 * The order is the trust order and `weakest()` depends on it.
 */
export const DATA_SOURCES = [
  /** Read directly from a BIM model's parameters. */
  "bim",
  /** Typed by the person. Their building, their measurement. */
  "user",
  /** Scaled off vector geometry in a DXF or PDF. */
  "drawing",
  /** Derived arithmetically from other values. Never better than its inputs. */
  "calculated",
  /** A model's reading of an image or an unstructured document. */
  "ai",
] as const;

export type DataSource = (typeof DATA_SOURCES)[number];

export function sourceLabel(source: DataSource): string {
  switch (source) {
    case "bim":
      return "BIM data";
    case "user":
      return "Entered";
    case "drawing":
      return "From drawing";
    case "calculated":
      return "Calculated";
    case "ai":
      return "AI estimate";
  }
}

/**
 * The least trustworthy of several sources.
 *
 * `calculated` is special: it means "arithmetic on other values", so a
 * calculation from BIM inputs is BIM-grade, and a calculation involving one
 * estimate is an estimate. Returning `calculated` for the first case would
 * understate what is known; returning it for the second would overstate it.
 */
export function weakest(...sources: DataSource[]): DataSource {
  const real = sources.filter((source) => source !== "calculated");
  if (real.length === 0) return "calculated";

  let worst = real[0]!;
  for (const source of real) {
    if (DATA_SOURCES.indexOf(source) > DATA_SOURCES.indexOf(worst)) {
      worst = source;
    }
  }
  return worst;
}

/** A number that knows where it came from. */
export type Measured = {
  value: number;
  source: DataSource;
  /** 0–1. A BIM parameter is 1; a vision model's reading rarely is. */
  confidence: number;
};

export function measured(
  value: number,
  source: DataSource,
  confidence = source === "bim" || source === "user" ? 1 : 0.7,
): Measured {
  return { value, source, confidence };
}

/**
 * Combines inputs into a result that is honest about all of them.
 *
 * Confidence is the minimum rather than the product. A product punishes long
 * chains: five BIM values at 0.95 would come out at 0.77, which reads as
 * uncertainty that is not there. The minimum says "no better than the shakiest
 * thing this rests on", which is what a quantity surveyor means.
 */
export function combine(value: number, ...inputs: Measured[]): Measured {
  if (inputs.length === 0) return measured(value, "calculated", 1);
  return {
    value,
    source: weakest(...inputs.map((input) => input.source)),
    confidence: Math.min(...inputs.map((input) => input.confidence)),
  };
}

export const ELEMENT_KINDS = [
  "room",
  "wall",
  "door",
  "window",
  "column",
  "beam",
  "slab",
  "foundation",
  "stair",
  "roof",
  "floor",
  "ceiling",
  "finish",
  "fixture",
  "furniture",
  "cabinet",
] as const;

export type ElementKind = (typeof ELEMENT_KINDS)[number];

/**
 * One thing in the building.
 *
 * `id` is the element's identity everywhere: on the 3D model, on the takeoff
 * sheet, in the BOQ line it contributed to, and in the cut list where it has
 * one. That single shared id is what makes clicking a BOQ line able to
 * highlight the walls behind it — the traceability the brief asks for is not a
 * separate index, it is this field used consistently.
 */
export type BuildingElement = {
  id: string;
  kind: ElementKind;
  /** What a person calls it: "W-104", "Ground floor slab". */
  name: string;
  /** Storey or zone. Groups the takeoff and drives floor isolation in 3D. */
  level?: string | null;
  /** Room or area, for the takeoff sheet's Location column. */
  location?: string | null;
  /** Sheet the measurement came off, when it came off a sheet. */
  drawingRef?: string | null;

  /** Millimetres, all of them, because mixing units is how buildings go wrong. */
  length?: Measured;
  width?: Measured;
  height?: Measured;
  /** Wall or slab thickness. */
  thickness?: Measured;
  /** How many identical ones. Six identical columns are one element × 6. */
  count?: Measured;

  /** Ids of elements that make holes in this one. Doors and windows in a wall. */
  openings?: string[];
  /** The material specified, matched to the marketplace downstream. */
  material?: string | null;
  /** Anything worth carrying: block size, concrete grade, paint system. */
  properties?: Record<string, string | number | null>;
};

/** A project's elements, indexed for the lookups every stage needs. */
export class ElementIndex {
  private readonly byId = new Map<string, BuildingElement>();

  constructor(elements: BuildingElement[] = []) {
    for (const element of elements) this.byId.set(element.id, element);
  }

  add(element: BuildingElement): void {
    this.byId.set(element.id, element);
  }

  get(id: string): BuildingElement | undefined {
    return this.byId.get(id);
  }

  all(): BuildingElement[] {
    return [...this.byId.values()];
  }

  ofKind(kind: ElementKind): BuildingElement[] {
    return this.all().filter((element) => element.kind === kind);
  }

  /**
   * The openings in an element, resolved.
   *
   * An id that names nothing is dropped rather than treated as a zero-area
   * hole. A missing door is a wall measured too large, which is the direction
   * that costs money, so it is worth the caller checking `openings` against
   * what comes back.
   */
  openingsOf(element: BuildingElement): BuildingElement[] {
    return (element.openings ?? [])
      .map((id) => this.byId.get(id))
      .filter((entry): entry is BuildingElement => entry !== undefined);
  }
}
