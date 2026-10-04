import {
  defaultOpening,
  openingLabel,
  systemsFor,
  type GlassTypeId,
  type OpeningKind,
  type OpeningSpec,
} from "../types/openings";

/**
 * Windows and doors you can start from, the way a wardrobe is.
 *
 * `starting-designs.ts` does this for casework: pick "Wardrobe", get a finished
 * wardrobe to argue with rather than a blank form. Openings had the whole
 * engine — every profile cut, every pane, every roller — and no way in. You
 * could price a wardrobe in two clicks and not a window at all.
 *
 * So this is the openings half of the same idea, and deliberately the same
 * shape: a category, a handful of sizes people actually ask for, and a spec
 * handed back complete.
 *
 * ## The sizes are real, and they are still not measurements
 *
 * Every size below is a standard one a supplier in Addis will recognise. That
 * makes them a good place to start and a bad thing to cut to, because a
 * standard size is a fact about a catalogue and a structural opening is a fact
 * about a wall.
 *
 * So picking a size from the list leaves `given` false, and the engine keeps
 * saying "check them against the structural opening before cutting". Only a
 * number somebody types themselves flips it to true — see {@link statedSize} —
 * because typing 1460 is what measuring looks like.
 */

export type OpeningSample = {
  kind: OpeningKind;
  label: string;
  /** One line saying what this is for, in a customer's words. */
  hint: string;
  /**
   * Width × height pairs, in millimetres, commonest first.
   *
   * Not a grid of every width against every height: a 600 mm wide sliding
   * window does not exist and offering it wastes the list.
   */
  sizes: { width: number; height: number }[];
};

/**
 * Windows before doors.
 *
 * The list is ordered by what gets quoted most, and in Addis that is windows —
 * a villa has fourteen of them and two external doors.
 */
export const OPENING_SAMPLES: OpeningSample[] = [
  {
    kind: "sliding-window",
    label: "Sliding window",
    hint: "Two sashes on a track. The ordinary bedroom window",
    sizes: [
      { width: 1500, height: 1200 },
      { width: 1200, height: 1200 },
      { width: 1800, height: 1200 },
      { width: 1800, height: 1500 },
      { width: 2400, height: 1500 },
    ],
  },
  {
    kind: "casement-window",
    label: "Casement window",
    hint: "Hinged sashes that swing out. Opens fully",
    sizes: [
      { width: 1200, height: 1200 },
      { width: 900, height: 1200 },
      { width: 600, height: 900 },
      { width: 1500, height: 1200 },
      { width: 1800, height: 1500 },
    ],
  },
  {
    kind: "fixed-window",
    label: "Fixed light",
    hint: "Glass that does not open. Light without a sash",
    sizes: [
      { width: 1200, height: 1200 },
      { width: 900, height: 900 },
      { width: 600, height: 600 },
      { width: 600, height: 1800 },
      { width: 1800, height: 900 },
    ],
  },
  {
    kind: "sliding-door",
    label: "Sliding door",
    hint: "Balcony or terrace, two panels, one sliding",
    sizes: [
      { width: 2400, height: 2100 },
      { width: 1800, height: 2100 },
      { width: 2100, height: 2100 },
      { width: 2400, height: 2700 },
      { width: 3000, height: 2400 },
    ],
  },
  {
    kind: "hinged-door",
    label: "Hinged door",
    hint: "Aluminium entrance door with glass",
    sizes: [
      { width: 900, height: 2100 },
      { width: 1000, height: 2100 },
      { width: 1200, height: 2100 },
      { width: 1500, height: 2400 },
    ],
  },
  {
    kind: "shopfront",
    label: "Shopfront",
    hint: "Full-height glazing with a door in it",
    // Nothing wider than about 5.8 m. The head and the sill are cut to the
    // full opening width, the longest bar sold is 6 m, and 10 mm of that goes
    // on the end trim — so a 6000 mm shopfront needs a joined head, which is a
    // fabrication decision and not something a sample tile should make for
    // somebody. Type 6000 in and the panel still builds it and says which
    // pieces cannot come off a bar.
    sizes: [
      { width: 3000, height: 2700 },
      { width: 4000, height: 2700 },
      { width: 5400, height: 3000 },
      { width: 4500, height: 3000 },
    ],
  },
  {
    kind: "glass-partition",
    label: "Glass partition",
    hint: "Office division. Glass to the ceiling, nothing opens",
    sizes: [
      { width: 3000, height: 2700 },
      { width: 4000, height: 2400 },
      { width: 2400, height: 2700 },
      { width: 5400, height: 2700 },
    ],
  },
  {
    kind: "interior-door",
    label: "Interior door",
    hint: "Room door in a frame. Solid leaf, no glass",
    sizes: [
      { width: 900, height: 2100 },
      { width: 800, height: 2100 },
      { width: 700, height: 2100 },
    ],
  },
];

export function sampleFor(kind: OpeningKind): OpeningSample | undefined {
  return OPENING_SAMPLES.find((entry) => entry.kind === kind);
}

/** The size shown first for a category — the one at the top of its list. */
export function firstSize(kind: OpeningKind): { width: number; height: number } {
  const sample = sampleFor(kind);
  if (sample?.sizes[0]) return sample.sizes[0];

  const fallback = defaultOpening(kind);
  return { width: fallback.width, height: fallback.height };
}

export type SampleOptions = {
  width?: number;
  height?: number;
  /** True only for a dimension the person typed. See the note at the top. */
  stated?: { width?: boolean; height?: boolean };
  glass?: GlassTypeId;
  quantity?: number;
  reference?: string;
};

/**
 * A complete opening for a category, ready to build.
 *
 * Mirrors `startingDesign(kind, { width })`: same call shape, same promise —
 * everything is filled in, and everything can be changed afterwards.
 *
 * The panel count is not passed in. It comes from `defaultOpening`, which knows
 * that a casement is two sashes and a fixed light is one, and getting that
 * wrong produces a frame with an interlock down the middle of a window that
 * does not open.
 */
export function openingSample(
  kind: OpeningKind,
  options: SampleOptions = {},
): OpeningSpec {
  const base = defaultOpening(kind);
  const size = firstSize(kind);

  const width = options.width ?? size.width;
  const height = options.height ?? size.height;

  return {
    ...base,
    width,
    height,
    given: {
      width: options.stated?.width ?? false,
      height: options.stated?.height ?? false,
    },
    glass: options.glass ?? base.glass,
    quantity: options.quantity ?? base.quantity,
    reference: options.reference ?? referenceFor(kind),
  };
}

/**
 * The mark a fabricator writes on the drawing.
 *
 * W-01 for windows, D-01 for doors, P-01 for partitions. It is the first thing
 * anyone looks for on a schedule of openings, and "Opening" — the schema
 * default — is not it.
 */
export function referenceFor(kind: OpeningKind): string {
  switch (kind) {
    case "sliding-window":
    case "casement-window":
    case "fixed-window":
      return "W-01";
    case "sliding-door":
    case "hinged-door":
    case "interior-door":
      return "D-01";
    case "shopfront":
    case "glass-partition":
      return "P-01";
  }
}

/**
 * Marks a dimension as the customer's own.
 *
 * Used when somebody types over a preset. Kept here rather than written inline
 * in the component so the rule — typed is stated, picked is not — lives with
 * the sizes it governs.
 */
export function statedSize(
  spec: OpeningSpec,
  axis: "width" | "height",
  value: number,
): OpeningSpec {
  return {
    ...spec,
    [axis]: value,
    given: { ...spec.given, [axis]: true },
  };
}

/** Human title for a sample, for headings and for the quotation. */
export function sampleTitle(spec: OpeningSpec): string {
  return `${openingLabel(spec.kind)}, ${spec.width} × ${spec.height} mm`;
}

/**
 * The profile system a sample uses, and whether there is a choice to offer.
 *
 * A sliding window can only be built in a sliding system, so the picker is
 * hidden rather than shown with one option — a control that cannot change
 * anything reads as broken.
 */
export function systemChoices(kind: OpeningKind) {
  return systemsFor(kind);
}
