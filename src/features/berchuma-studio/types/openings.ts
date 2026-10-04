import { z } from "zod";

/**
 * Openings: aluminium doors and windows, interior doors, glass partitions.
 *
 * Berchuma's cabinets are boxes made of sheet material. These are frames made
 * of extruded profile with something transparent in the middle, and almost
 * nothing about the cabinet model transfers — a wardrobe has no sash, no
 * interlock, no rebate, no rollers, and its parts are cut from a sheet rather
 * than a bar.
 *
 * So this is a second spec alongside `spec.ts` rather than an extension of it.
 * They meet downstream, where both produce cut lists and both are costed by the
 * same pricing chain.
 *
 * ## Dimensions are the customer's, not ours
 *
 * `given` records whether each dimension came from the person or was estimated
 * for them. The brief was explicit and it is the right rule: a stated dimension
 * is authoritative and is never quietly adjusted, because somebody who says
 * 2400 has usually measured a hole that is 2400. An estimate is labelled as one
 * so it can be corrected before it reaches a saw.
 */

export const openingKinds = [
  "sliding-door",
  "hinged-door",
  "sliding-window",
  "casement-window",
  "fixed-window",
  "shopfront",
  "glass-partition",
  "interior-door",
] as const;

export type OpeningKind = (typeof openingKinds)[number];

/**
 * The profile system, which decides every section size and rebate.
 *
 * Real systems are a supplier's catalogue — this is a small set of the ones
 * common in Addis, with the dimensions that actually drive the cut lengths.
 * Adding a supplier's system is a row here, not a code change.
 */
export const profileSystems = {
  "sliding-27": {
    label: "27 mm sliding (2-track)",
    /** Outer frame section depth, and the width it takes off the opening. */
    frameSection: 27,
    /** Sash section — stiles and rails are cut from this. */
    sashSection: 40,
    /** How far the sash sits inside the frame on each side. */
    sashOverlap: 18,
    /** How deep the glass sits into the sash all round. */
    glassRebate: 12,
    /** Where two sashes meet on a slider. */
    interlock: 30,
    kinds: ["sliding-door", "sliding-window"] as OpeningKind[],
  },
  "casement-45": {
    label: "45 mm casement",
    frameSection: 45,
    sashSection: 45,
    sashOverlap: 8,
    glassRebate: 14,
    interlock: 0,
    // An interior door is a timber leaf in a frame, but the frame is cut the
    // same way a casement frame is, and `defaultOpening` has always given it
    // this system. Leaving it out of this list meant `systemsFor` returned
    // nothing for it — a spec whose own system was not one the picker would
    // offer, and a validation rule that its default violated.
    kinds: [
      "hinged-door",
      "casement-window",
      "fixed-window",
      "interior-door",
    ] as OpeningKind[],
  },
  "shopfront-60": {
    label: "60 mm shopfront",
    frameSection: 60,
    sashSection: 60,
    sashOverlap: 0,
    glassRebate: 16,
    interlock: 0,
    kinds: ["shopfront", "glass-partition"] as OpeningKind[],
  },
} as const;

export type ProfileSystemId = keyof typeof profileSystems;

export const glassTypes = {
  "clear-4": { label: "4 mm clear float", thickness: 4, kgPerM2: 10 },
  "clear-5": { label: "5 mm clear float", thickness: 5, kgPerM2: 12.5 },
  "clear-6": { label: "6 mm clear float", thickness: 6, kgPerM2: 15 },
  "tinted-6": { label: "6 mm tinted", thickness: 6, kgPerM2: 15 },
  "reflective-6": { label: "6 mm reflective", thickness: 6, kgPerM2: 15 },
  "frosted-6": { label: "6 mm frosted", thickness: 6, kgPerM2: 15 },
  "tempered-8": { label: "8 mm toughened", thickness: 8, kgPerM2: 20 },
  "tempered-10": { label: "10 mm toughened", thickness: 10, kgPerM2: 25 },
  "laminated-6.38": { label: "6.38 mm laminated", thickness: 6.38, kgPerM2: 16 },
} as const;

export type GlassTypeId = keyof typeof glassTypes;

/** Which dimensions the customer actually stated. */
const givenSchema = z.object({
  width: z.boolean().default(false),
  height: z.boolean().default(false),
});

export const openingSpecSchema = z.object({
  version: z.literal(1),
  kind: z.enum(openingKinds),
  /** A name a person recognises on a quotation: "Main entrance", "W-04". */
  reference: z.string().min(1).max(60).default("Opening"),

  /** Structural opening, in millimetres. */
  width: z.number().int().min(200).max(12_000),
  height: z.number().int().min(200).max(6_000),
  given: givenSchema.default({ width: false, height: false }),

  system: z.enum(
    Object.keys(profileSystems) as [ProfileSystemId, ...ProfileSystemId[]],
  ),
  /** Leaves, sashes or bays. A two-panel slider is 2. */
  panels: z.number().int().min(1).max(8).default(2),
  /** How many of those panels actually move. The rest are fixed lights. */
  opening: z.number().int().min(0).max(8).default(1),

  finish: z.string().min(1).max(60).default("Natural anodised"),
  glass: z.enum(Object.keys(glassTypes) as [GlassTypeId, ...GlassTypeId[]]),

  /** Fitted with a lock. Adds hardware and, on a door, a keep. */
  lockable: z.boolean().default(true),
  /** Fly screen on a slider — an extra track and an extra sash. */
  flyScreen: z.boolean().default(false),
  quantity: z.number().int().min(1).max(500).default(1),
});

export type OpeningSpec = z.infer<typeof openingSpecSchema>;

/**
 * A sensible opening when somebody has not said.
 *
 * Every one of these is a real standard size, so an estimate is at least a size
 * that exists rather than an average of sizes that do not. `given` stays false
 * on both, which is what makes the UI show them as estimates.
 */
export function defaultOpening(kind: OpeningKind): OpeningSpec {
  const base = {
    version: 1 as const,
    kind,
    reference: "Opening",
    given: { width: false, height: false },
    finish: "Natural anodised",
    lockable: true,
    flyScreen: false,
    quantity: 1,
  };

  switch (kind) {
    case "sliding-door":
      return { ...base, width: 2400, height: 2100, system: "sliding-27", panels: 2, opening: 1, glass: "clear-6" };
    case "sliding-window":
      return { ...base, width: 1500, height: 1200, system: "sliding-27", panels: 2, opening: 1, glass: "clear-4" };
    case "hinged-door":
      return { ...base, width: 900, height: 2100, system: "casement-45", panels: 1, opening: 1, glass: "clear-6" };
    case "casement-window":
      return { ...base, width: 1200, height: 1200, system: "casement-45", panels: 2, opening: 2, glass: "clear-4" };
    case "fixed-window":
      return { ...base, width: 1200, height: 1200, system: "casement-45", panels: 1, opening: 0, glass: "clear-4", lockable: false };
    case "shopfront":
      return { ...base, width: 3000, height: 2700, system: "shopfront-60", panels: 3, opening: 1, glass: "tempered-10" };
    case "glass-partition":
      return { ...base, width: 3000, height: 2700, system: "shopfront-60", panels: 3, opening: 0, glass: "tempered-10", lockable: false };
    case "interior-door":
      // Timber, not aluminium — the frame is still a frame and the engine
      // treats it the same way, with a solid leaf instead of glass.
      return { ...base, width: 900, height: 2100, system: "casement-45", panels: 1, opening: 1, glass: "clear-6" };
  }
}

export function openingLabel(kind: OpeningKind): string {
  switch (kind) {
    case "sliding-door": return "Sliding door";
    case "hinged-door": return "Hinged door";
    case "sliding-window": return "Sliding window";
    case "casement-window": return "Casement window";
    case "fixed-window": return "Fixed light";
    case "shopfront": return "Shopfront";
    case "glass-partition": return "Glass partition";
    case "interior-door": return "Interior door";
  }
}

/** Which systems can build this kind, for the picker and for validation. */
export function systemsFor(kind: OpeningKind): ProfileSystemId[] {
  return (Object.keys(profileSystems) as ProfileSystemId[]).filter((id) =>
    (profileSystems[id].kinds as readonly OpeningKind[]).includes(kind),
  );
}
