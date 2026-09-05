import { z } from "zod";

import { openingClashes, openingFaults } from "../services/room-geometry";
import { roomSchema } from "./room";

import {
  cornerKinds,
  furnitureTypes,
  layoutKinds,
  runSchema,
  type FurnitureType,
} from "./layout";

/**
 * The design specification.
 *
 * This is the single source of truth for a Berchuma project, and the reason
 * the whole feature holds together.
 *
 * Berchuma AI does not draw. It fills in this object. Everything downstream —
 * the 3D model, the cost panel, the cut list, the BOQ, the CNC export — is
 * derived from it by deterministic code. That ordering is not an
 * implementation detail; it is what makes the numbers trustworthy. A language
 * model asked to produce geometry produces something that looks like a
 * wardrobe and cannot be built: panels at thicknesses no supplier sells, spans
 * that sag, a cost with nothing behind it. A model asked to produce *this*
 * produces a brief, and carpentry turns a brief into parts.
 *
 * It also makes "make it wider" cheap. That edit is `envelope.width = 2400`
 * and a re-derive, which is arithmetic in the browser — not a regeneration,
 * not a round trip.
 *
 * Everything is millimetres. Not "usually millimetres" — the `units` field
 * exists to be read, and there is exactly one legal value, because a project
 * that mixes units is a project that ships a wardrobe 25 times too small.
 */

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/**
 * A board product.
 *
 * `priceKey` is what connects a design to real money: it is matched against
 * `price_listings.item` so the cost panel quotes what suppliers are actually
 * charging this week rather than a number somebody typed into a constant a
 * year ago. When no listing matches, `fallbackRate` carries the estimate and
 * the cost breakdown says the rate was assumed.
 */
export const boardSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Board thickness in mm. 18 for carcasses, 3–6 for backs. */
  thickness: z.number().positive().max(50),
  /** The sheet as sold. Ethiopian yards stock 2440×1220 almost universally. */
  sheet: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
  }),
  /**
   * Whether parts must be cut with the grain running a particular way. A
   * veneered or foil-wrapped board looks wrong with parts rotated, and the
   * nesting has to respect that even though it wastes material.
   */
  grain: z.enum(["none", "length", "width"]).default("none"),
  priceKey: z.string().min(1),
  /** ETB per sheet, used when no live listing matches. */
  fallbackRate: z.number().nonnegative(),
});

export type Board = z.infer<typeof boardSchema>;

export const edgeBandSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  thickness: z.number().positive().max(5),
  priceKey: z.string().min(1),
  /** ETB per linear metre. */
  fallbackRate: z.number().nonnegative(),
});

export type EdgeBand = z.infer<typeof edgeBandSchema>;

export const hardwareKinds = [
  "hinge",
  "handle",
  "drawer_runner",
  "shelf_pin",
  "hanging_rail",
  "leg",
  "lift_mechanism",
  "sliding_gear",
  "lock",
] as const;

export type HardwareKind = (typeof hardwareKinds)[number];

export const hardwareSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(hardwareKinds),
  /** How it is sold. A runner is a pair; a hinge is each. */
  unit: z.enum(["each", "pair", "set", "metre"]),
  priceKey: z.string().min(1),
  fallbackRate: z.number().nonnegative(),
});

export type Hardware = z.infer<typeof hardwareSchema>;

// ---------------------------------------------------------------------------
// Fittings
// ---------------------------------------------------------------------------

/**
 * What is inside one bay.
 *
 * A bay is a vertical slice of a casework unit between two dividers. It is the
 * unit people actually talk about — "make the middle one drawers" — so it is
 * the unit the spec models.
 */
export const bayFittingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("shelves"),
    count: z.number().int().min(0).max(20),
    /** Adjustable shelves sit on pins; fixed ones are housed into the sides. */
    adjustable: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("hanging"),
    /** Two rails means short hanging over short hanging. */
    rails: z.number().int().min(1).max(2),
    /** A shelf above the rail is standard; some people do not want it. */
    shelfAbove: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("drawers"),
    count: z.number().int().min(1).max(8),
    /**
     * Front heights in mm, top to bottom. Omitted means equal division, which
     * is what most people mean and nobody says.
     */
    frontHeights: z.array(z.number().positive()).optional(),
  }),
  /**
   * A bay divided into stacked sections.
   *
   * The model above says a bay is *one* thing — shelves, or hanging, or
   * drawers. That cannot describe the commonest wardrobe module there is:
   * hanging at the top, a shelf across the middle, two drawers at the bottom.
   * It is what Part 6 asks for by name and what every fitted wardrobe in Addis
   * actually contains.
   *
   * Sections run top to bottom, the way somebody describes a wardrobe. Each
   * takes a share of the bay's interior height, and the shares are normalised
   * rather than required to sum to one — a person editing three numbers should
   * not have to make them add up, and a section given no share takes what is
   * left.
   *
   * Deliberately not recursive. A section inside a section is a thing nobody
   * has asked for and a source of infinite geometry, so a section is always a
   * leaf.
   */
  z.object({
    kind: z.literal("stack"),
    sections: z
      .array(
        z.object({
          id: z.string().min(1),
          kind: z.enum(["hanging", "shelves", "drawers", "open"]),
          /** Relative height. Normalised across the stack. */
          share: z.number().positive().default(1),
          /** For shelves. */
          count: z.number().int().min(0).max(20).optional(),
          /** For hanging. */
          rails: z.number().int().min(1).max(2).optional(),
          /** For drawers. */
          drawers: z.number().int().min(1).max(8).optional(),
        }),
      )
      .min(2)
      .max(6),
  }),

  z.object({ kind: z.literal("open") }),
  z.object({
    kind: z.literal("appliance"),
    appliance: z.string().min(1),
    /** The opening the appliance needs, not the appliance itself. */
    openingHeight: z.number().positive(),
  }),
]);

export type BayFitting = z.infer<typeof bayFittingSchema>;

/**
 * One band of a stacked bay.
 *
 * Named because two places need it — the code that builds what is inside a bay
 * and the code that builds what is on the front of it — and a drawer front that
 * does not agree with the drawer box behind it is the bug this type exists to
 * make impossible to write.
 */
export type StackSection = Extract<BayFitting, { kind: "stack" }>["sections"][number];

export const doorStyles = ["none", "hinged", "sliding", "bifold"] as const;
export type DoorStyle = (typeof doorStyles)[number];

export const baySchema = z.object({
  id: z.string().min(1),
  /** Nominal width of the bay in mm, measured between divider centres. */
  width: z.number().positive(),
  fitting: bayFittingSchema,
  door: z.enum(doorStyles).default("hinged"),
  /** A pair of doors on one bay, for bays too wide for a single leaf. */
  doorLeaves: z.number().int().min(1).max(2).default(1),
});

export type Bay = z.infer<typeof baySchema>;

// ---------------------------------------------------------------------------
// The spec
// ---------------------------------------------------------------------------

export const designKinds = [
  "wardrobe",
  "kitchen",
  "tv_unit",
  "vanity",
  "shelving",
  "bookshelf",
  "office_storage",
  "custom",
] as const;

export type DesignKind = (typeof designKinds)[number];

// ---------------------------------------------------------------------------
// Cabinets
// ---------------------------------------------------------------------------

/**
 * What a cabinet is for, which decides how it behaves rather than how it looks.
 *
 * A wall unit has no plinth and hangs at a height; a tall unit runs from floor
 * to ceiling and interrupts the worktop; a base unit carries the worktop. These
 * are not labels — the geometry, the starting designs and the kitchen rules all
 * branch on them, and getting the kind wrong puts a plinth under a cabinet
 * screwed to a wall.
 */
export const cabinetKinds = [
  "base",
  "wall",
  "tall",
  "island",
  "vanity",
  "open",
] as const;

export type CabinetKind = (typeof cabinetKinds)[number];

/**
 * One cabinet, somewhere in the design.
 *
 * This is the change that lets Berchuma describe a kitchen. Until now a design
 * was a single box with bays in it, which can describe a wardrobe and cannot
 * describe a kitchen at all — a kitchen is base units *and* a wall unit above
 * them *and* a tall housing at the end, at three different heights. There was
 * nowhere to put the second box.
 *
 * Position is the bottom-left-front corner in the design's own frame: x runs
 * right from the left end of the run, y up from the floor, z backwards from the
 * front plane. The same convention as `Part`, so a cabinet's parts are placed
 * by adding two vectors and nothing has to be reasoned about twice.
 */
export const cabinetSchema = z.object({
  id: z.string().min(1),
  /** What a person calls it: "Sink unit", "Oven housing", "Left wardrobe". */
  label: z.string().min(1).max(80),
  kind: z.enum(cabinetKinds).default("base"),

  /**
   * Which wall run this cabinet belongs to, and how far along it sits.
   *
   * When these are set, `position.x` and `position.z` are *derived* by the
   * layout solver and whatever is stored in them is ignored. That is the whole
   * of Part 59: a cabinet whose place in the world is a stored coordinate does
   * not move when its wall does, and the person who lengthened the wall has to
   * drag twelve boxes by hand.
   *
   * They stay optional because a v2 design has neither, and because an island
   * genuinely belongs to no wall — for those, the stored position is the
   * truth.
   */
  runId: z.string().min(1).optional(),
  /** Distance from the run's start to this cabinet's left edge, in mm. */
  offset: z.number().nonnegative().optional(),

  position: z.object({
    x: z.number(),
    y: z.number().min(0),
    z: z.number().default(0),
  }),

  size: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
  }),

  bays: z.array(baySchema).min(1).max(24),

  /**
   * Height of the plinth this cabinet stands on, zero for anything hung.
   *
   * On the cabinet rather than on the carcass, because in one kitchen the base
   * units have a 100 mm plinth and the wall units have none, and a single
   * global number cannot say that.
   */
  plinthHeight: z.number().nonnegative().default(0),
});

export type Cabinet = z.infer<typeof cabinetSchema>;

export const finishSchema = z.object({
  /** A human colour name; the render prompt and the 3D material both read it. */
  colour: z.string().min(1),
  /** Hex, for the viewer. Derived from `colour` when the model omits it. */
  hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#c8b9a6"),
  sheen: z.enum(["matt", "satin", "gloss"]).default("satin"),
});

export const lightingSchema = z.object({
  /** LED strip inside the unit, priced per metre and drawn in the viewer. */
  ledStrip: z.boolean().default(false),
  /** Metres of strip. Derived from the bays when the model does not say. */
  metres: z.number().nonnegative().optional(),
  colourTemperature: z.number().int().min(2200).max(6500).default(3000),
});

/**
 * The counter over a run of base cabinets.
 *
 * Optional, because a wardrobe has none. Present on every kitchen, because a
 * kitchen without a worktop is not a kitchen — and because leaving it out was
 * the thing that made the old studio's kitchens look like a row of boxes.
 *
 * One worktop covers a contiguous run of base cabinets rather than one per
 * cabinet: that is how it is cut, how it is priced, and how it looks. Where a
 * tall unit interrupts the run, the top stops and starts again.
 */
/**
 * What the carcass stands on.
 *
 * Zekolo is the Ethiopian standard — a turned or square timber foot at each
 * corner — and it is the default because it is what a shop in Addis will make
 * without being asked twice.
 *
 * The alternative to legs is a plinth: a board across the front, which is what
 * this code produced before and produced *only at the front*. A wardrobe
 * standing on a single front board is a wardrobe resting on its back edge, and
 * it is why the generated model looked wrong.
 */
export const legKinds = ["zekolo", "standard", "adjustable", "none"] as const;
export type LegKind = (typeof legKinds)[number];

export const legsSchema = z.object({
  kind: z.enum(legKinds).default("zekolo"),
  /** Floor to the underside of the carcass. */
  height: z.number().nonnegative().max(300).default(100),
  /** Square section, in mm. */
  thickness: z.number().positive().max(120).default(50),
  /**
   * How far in from the carcass edge each corner leg sits.
   *
   * Not zero: a leg flush with the side would be visible in the reveal between
   * two units, and a leg flush with the front is the first thing a toe finds.
   */
  inset: z.number().nonnegative().max(200).default(35),
  /** Shown in the BOQ and on the leg itself in the viewer. */
  material: z.string().default("Black steel"),
});

export type Legs = z.infer<typeof legsSchema>;

export const worktopSchema = z.object({
  board: boardSchema,
  /** How far it oversails the cabinet fronts. 20 mm is the usual detail. */
  overhang: z.number().nonnegative().max(200).default(20),
  /** Upstand at the back. Zero for a tiled splashback instead. */
  backsplashHeight: z.number().nonnegative().max(900).default(0),
});

export type Worktop = z.infer<typeof worktopSchema>;

export const designSpecSchema = z.object({
  /** Schema version. A stored spec outlives the code that wrote it. */
  version: z.literal(3),
  kind: z.enum(designKinds),

  /**
   * What is being built, which decides the components offered.
   *
   * Distinct from `kind`, which is the preset somebody started from. A design
   * can begin as "bookshelf" and end up a cabinet run; the furniture type is
   * what the editor branches on and the preset is only how it opened.
   */
  furnitureType: z.enum(furnitureTypes).default("wardrobe"),

  /** Straight, L, U or custom. */
  layout: z.enum(layoutKinds).default("straight"),

  /**
   * The walls, as measured.
   *
   * One for a straight run, two for an L, three for a U. Cabinet positions are
   * solved from these — see `services/layout` — so this array is the thing
   * that changes when somebody says "make the back wall four metres".
   */
  runs: z.array(runSchema).min(1).max(8).default([
    { id: "run-1", label: "Wall A", length: 2400, depth: 600, height: 2400 },
  ]),

  /**
   * The room, when the design was drawn in one.
   *
   * Optional, and deliberately not a version bump: an optional field parses
   * every stored v3 spec unchanged, where `z.literal(4)` would reject all of
   * them and make this depend on an upgrade path working perfectly the first
   * time. A design with no room is a design that behaves exactly as it did
   * before the plan editor existed.
   *
   * `runs` stays authoritative for the cabinets. When a room is present its
   * chosen walls *derive* the runs — see services/room-geometry — so the
   * layout solver, buildParts, the cut list and the price are all reached
   * through the path that already exists rather than a second one.
   */
  room: roomSchema.optional(),

  /** How the runs meet. Ignored for a straight layout. */
  cornerKind: z.enum(cornerKinds).default("l_corner"),
  units: z.literal("mm"),
  title: z.string().min(1).max(160),

  /**
   * Everything in the design, positioned.
   *
   * One entry for a wardrobe; a dozen or more for a kitchen.
   */
  cabinets: z.array(cabinetSchema).min(1).max(40),

  /**
   * The overall bounding box.
   *
   * Derived, not authored — `validateSpec` recomputes it from the cabinets on
   * every edit. It is stored rather than computed on demand because the
   * viewer's camera, the page header and the elevation all want it, and three
   * places each deriving it is three chances to derive it differently.
   */
  envelope: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
  }),

  carcass: z.object({
    board: boardSchema,
    backBoard: boardSchema,
    edgeBand: edgeBandSchema,
    /** The plinth a newly added base cabinet gets. Cabinets carry their own. */
    plinthHeight: z.number().nonnegative().default(100),
    /** Gap around a door leaf, per edge. 2 mm is the usual shop standard. */
    doorGap: z.number().nonnegative().default(2),
    /** How far a shelf is set back from the front edge. */
    shelfSetback: z.number().nonnegative().default(10),
  }),

  hardware: z.array(hardwareSchema),
  finish: finishSchema,
  lighting: lightingSchema.optional(),
  worktop: worktopSchema.optional(),

  /**
   * The legs. Optional so a v2 design without them still parses; the geometry
   * falls back to Zekolo at the carcass's own plinth height, which is what
   * every existing design was already reserving room for.
   */
  legs: legsSchema.optional(),

  meta: z.object({
    style: z.string().default("modern"),
    /** What the user asked for, verbatim. Shown on the public page. */
    prompt: z.string().default(""),
    /**
     * What the model invented because the user did not say.
     *
     * This is not a nicety. A cost derived from a guessed ceiling height is
     * an estimate wearing a number's clothes, and the person reading it is
     * entitled to know which parts were measured and which were assumed.
     */
    assumptions: z.array(z.string()).default([]),
    /** Corrections the validator made. Same reasoning as `assumptions`. */
    corrections: z.array(z.string()).default([]),
  }),
});

export type DesignSpec = z.infer<typeof designSpecSchema>;

// ---------------------------------------------------------------------------
// Physical validation
// ---------------------------------------------------------------------------

/**
 * Limits that come from carpentry rather than from software.
 *
 * A model will happily propose a 1400 mm unsupported shelf in 18 mm board. It
 * will sag, visibly, within a year. The schema cannot express that — it is a
 * relationship between a span, a thickness and a material — so it lives here
 * and runs after parsing.
 */
export const LIMITS = {
  /** Unsupported shelf span in 18 mm board before visible deflection. */
  shelfSpan: 900,
  /** A hinged leaf wider than this fouls on adjacent furniture and sags. */
  hingedLeafWidth: 600,
  /** Below this a wardrobe cannot take a hanger across its depth. */
  hangingDepth: 550,
  /** Above this the top is out of reach and the panel is hard to handle. */
  maxHeight: 2700,
  /** Below this the carcass is not worth making. */
  minWidth: 300,
  /** A drawer wider than this needs centre support on the runners. */
  drawerWidth: 1200,
  /**
   * The shortest drawer front worth making, in mm.
   *
   * Below this the box behind it holds nothing and the handle has nowhere to
   * go. It is a floor on what somebody can type rather than a rule about
   * design: a 90 mm cutlery drawer is real, and 40 mm is a mistake.
   */
  minDrawerFront: 90,
} as const;

export type SpecIssue = {
  severity: "error" | "warning";
  path: string;
  message: string;
  /** What the validator did about it, when it could fix it. */
  correction?: string;
};

export type ValidationResult = {
  spec: DesignSpec;
  issues: SpecIssue[];
};

/**
 * Checks a parsed spec against physical reality and repairs what it can.
 *
 * Repairs rather than rejects, because rejecting means the user watches a
 * chat say "I cannot do that" when what it means is "that shelf is too long
 * and I have split it". Every repair is recorded in `meta.corrections` and
 * surfaces in the UI.
 */
export function validateSpec(input: DesignSpec): ValidationResult {
  // Structured clone rather than a spread: the cabinets, their bays and the
  // fittings inside those are nested, and a shallow copy would let a repair
  // reach back into the caller's object.
  const spec: DesignSpec = structuredClone(input);
  const issues: SpecIssue[] = [];
  const t = spec.carcass.board.thickness;

  for (const [index, cabinet] of spec.cabinets.entries()) {
    validateCabinet(cabinet, index, t, issues);
  }

  // The walls, repaired before anything is solved from them. A run is what the
  // cabinet positions are derived from, so an absurd one propagates into every
  // placement rather than staying in one box.
  for (const run of spec.runs) {
    repairRun(run, issues);
  }

  // The overall box follows from the cabinets, so it is recomputed rather than
  // trusted. A caller that widened one cabinet has not updated the envelope,
  // and a camera framed on a stale envelope crops the design.
  spec.envelope = boundingBox(spec.cabinets);

  // Deliberately no cap on the overall height. It used to be capped at 2700,
  // which was right when a design was one box and is wrong now: a kitchen with
  // wall units over base units is legitimately 2170 tall, and a tall larder
  // beside them takes it higher. The limit belongs on a single carcass — no
  // shop builds one 3 m panel — and that is where it now runs, per cabinet.

  spec.meta.corrections = [
    ...new Set([
      ...spec.meta.corrections,
      ...issues.flatMap((issue) => (issue.correction ? [issue.correction] : [])),
    ]),
  ];

  // Cabinets standing where a door or a window is.
  //
  // Reported here rather than in a panel of its own, because this is the list
  // the workspace already shows and a warning in a second place is a warning
  // somebody has to know to look for. A door is an error — nothing can stand
  // in a doorway. A tall unit across a window is a warning: a base unit under
  // one is completely normal, and a joiner who wants one should not have to
  // argue with the software.
  if (spec.room) {
    for (const clash of openingClashes(spec.room, spec.cabinets)) {
      issues.push({
        severity: clash.severity,
        path: `cabinets.${clash.cabinetId}`,
        message: clash.message,
      });
    }

    for (const fault of openingFaults(spec.room)) {
      issues.push({ severity: "warning", path: "room.openings", message: fault });
    }
  }

  return { spec, issues };
}

/**
 * One cabinet, checked against carpentry and repaired where it can be.
 *
 * Exactly the rules that used to run over the single envelope, now run per
 * cabinet — which is the point of the change. A kitchen with a sagging shelf in
 * the third unit and a door too wide on the seventh gets told about both,
 * naming the cabinet, rather than being checked as one impossible 4 m box.
 */
function validateCabinet(
  cabinet: Cabinet,
  index: number,
  t: number,
  issues: SpecIssue[],
): void {
  const at = `cabinets[${index}]`;
  const named = cabinet.label || `cabinet ${index + 1}`;

  if (cabinet.size.height > LIMITS.maxHeight) {
    issues.push({
      severity: "warning",
      path: `${at}.size.height`,
      message: `${named} is ${Math.round(cabinet.size.height)} mm tall, above the ${LIMITS.maxHeight} mm this trade builds in one carcass.`,
      correction: `${named} capped to a buildable height.`,
    });
    cabinet.size.height = LIMITS.maxHeight;
  }

  if (cabinet.size.width < LIMITS.minWidth) {
    issues.push({
      severity: "error",
      path: `${at}.size.width`,
      message: `${named} is ${Math.round(cabinet.size.width)} mm wide, narrower than a single bay.`,
      correction: `${named} set to ${LIMITS.minWidth} mm.`,
    });
    cabinet.size.width = LIMITS.minWidth;
  }

  // Bay widths must account for the material they sit between: the interior is
  // the cabinet less its two gables and its internal dividers.
  const interior =
    cabinet.size.width - 2 * t - Math.max(0, cabinet.bays.length - 1) * t;

  if (interior <= 0) {
    const fits = Math.max(
      1,
      Math.floor((cabinet.size.width - 2 * t) / (t + 300)),
    );
    issues.push({
      severity: "error",
      path: `${at}.bays`,
      message: `${cabinet.bays.length} bays do not fit in ${Math.round(cabinet.size.width)} mm of ${named}.`,
      correction: `${named}: reduced to the number of bays that fit.`,
    });
    cabinet.bays = cabinet.bays.slice(0, fits);
  }

  const target =
    cabinet.size.width - 2 * t - Math.max(0, cabinet.bays.length - 1) * t;
  const declared = cabinet.bays.reduce((total, bay) => total + bay.width, 0);

  // Rescale rather than reject when the declared widths do not add up. Somebody
  // who said "three equal bays" in a 2400 mm unit meant three equal bays, and
  // got the arithmetic slightly wrong.
  if (Math.abs(declared - target) > 1 && declared > 0) {
    const scale = target / declared;
    for (const bay of cabinet.bays) bay.width = Math.round(bay.width * scale);
    issues.push({
      severity: "warning",
      path: `${at}.bays[].width`,
      message: `Bay widths in ${named} summed to ${Math.round(declared)} mm inside a ${Math.round(target)} mm carcass.`,
      correction: `${named}: bay widths scaled proportionally to fit.`,
    });
  }

  for (const [bayIndex, bay] of cabinet.bays.entries()) {
    const bayAt = `${at}.bays[${bayIndex}]`;

    if (bay.fitting.kind === "shelves" && bay.width > LIMITS.shelfSpan) {
      issues.push({
        severity: "warning",
        path: `${bayAt}.width`,
        message: `A ${Math.round(bay.width)} mm shelf in ${t} mm board will sag; ${LIMITS.shelfSpan} mm is the practical span.`,
        correction: `${named}: add a divider or specify a thicker board for the ${Math.round(bay.width)} mm shelf.`,
      });
    }

    if (bay.fitting.kind === "drawers" && bay.width > LIMITS.drawerWidth) {
      issues.push({
        severity: "warning",
        path: `${bayAt}.width`,
        message: `Drawers wider than ${LIMITS.drawerWidth} mm need centre support.`,
      });
    }

    if (
      bay.fitting.kind === "hanging" &&
      cabinet.size.depth < LIMITS.hangingDepth
    ) {
      issues.push({
        severity: "warning",
        path: `${at}.size.depth`,
        message: `A hanging rail needs about ${LIMITS.hangingDepth} mm of depth; ${named} is ${Math.round(cabinet.size.depth)} mm.`,
        correction: `${named} deepened to ${LIMITS.hangingDepth} mm.`,
      });
      cabinet.size.depth = LIMITS.hangingDepth;
    }

    if (
      bay.door === "hinged" &&
      // A drawer bay is fronted by its drawers. Counting leaves for it warned
      // about a door that was never going to exist.
      bay.fitting.kind !== "drawers" &&
      bay.doorLeaves === 1 &&
      bay.width > LIMITS.hingedLeafWidth
    ) {
      bay.doorLeaves = 2;
      issues.push({
        severity: "warning",
        path: `${bayAt}.doorLeaves`,
        message: `A single ${Math.round(bay.width)} mm hinged leaf in ${named} is beyond the ${LIMITS.hingedLeafWidth} mm practical limit.`,
        correction: `${named}: changed to a pair of doors.`,
      });
    }
  }
}

/**
 * Every bay in the design, left to right, cabinet by cabinet.
 *
 * The old spec had one list of bays and a dozen places read it. Those places
 * mostly wanted "all the bays", not "the bays of the cabinet I am looking at",
 * so they call this rather than each writing their own flatMap.
 */
/**
 * Clamps a run to something that can be built.
 *
 * Same contract as the cabinet repairs above: correct it, say so, and carry
 * on. A run is a wall somebody measured, so a wrong one is usually a typo — a
 * missing zero or an extra one — and the useful response is a buildable design
 * with a note attached rather than a refusal.
 */
function repairRun(
  run: { label: string; length: number; depth: number; height: number },
  issues: SpecIssue[],
): void {
  if (run.height > LIMITS.maxHeight) {
    issues.push({
      severity: "warning",
      path: `runs.${run.label}.height`,
      message: `${run.label} is ${Math.round(run.height)} mm tall, above the ${LIMITS.maxHeight} mm this trade builds in one carcass.`,
      correction: `${run.label} capped at ${LIMITS.maxHeight} mm.`,
    });
    run.height = LIMITS.maxHeight;
  }

  if (run.length < LIMITS.minWidth) {
    issues.push({
      severity: "warning",
      path: `runs.${run.label}.length`,
      message: `${run.label} is ${Math.round(run.length)} mm long, too short for a carcass.`,
      correction: `${run.label} set to ${LIMITS.minWidth} mm.`,
    });
    run.length = LIMITS.minWidth;
  }

  // 1200 mm is the widest board this trade cuts a side panel from, so a
  // deeper carcass needs a joint the cut list does not describe.
  if (run.depth > 1200) {
    issues.push({
      severity: "warning",
      path: `runs.${run.label}.depth`,
      message: `${run.label} is ${Math.round(run.depth)} mm deep, beyond a single board width.`,
      correction: `${run.label} capped at 1200 mm.`,
    });
    run.depth = 1200;
  }
}

export function allBays(spec: DesignSpec): Bay[] {
  return spec.cabinets.flatMap((cabinet) => cabinet.bays);
}

/** The smallest box containing every cabinet, in the design's own frame. */
export function boundingBox(cabinets: Cabinet[]): {
  width: number;
  height: number;
  depth: number;
} {
  let right = 0;
  let top = 0;
  let back = 0;

  for (const cabinet of cabinets) {
    right = Math.max(right, cabinet.position.x + cabinet.size.width);
    top = Math.max(top, cabinet.position.y + cabinet.size.height);
    back = Math.max(back, cabinet.position.z + cabinet.size.depth);
  }

  // A design with nothing in it cannot happen — the schema requires one
  // cabinet — but a zero would divide by zero in the camera framing, and a
  // guard is cheaper than the bug report.
  return {
    width: Math.max(1, Math.round(right)),
    height: Math.max(1, Math.round(top)),
    depth: Math.max(1, Math.round(back)),
  };
}

/**
 * Parses untrusted JSON into a spec, then validates it physically.
 *
 * Both halves matter and they fail differently: a schema failure means the
 * model returned something that is not a design at all, a validation issue
 * means it returned a design that cannot be built. The first is an error, the
 * second is a note on the drawing.
 */
/**
 * Reads a design written before cabinets existed.
 *
 * Version 1 was one envelope with bays in it, which is exactly one cabinet —
 * so the upgrade is not a guess, it is a rename. Every design already published
 * on Medosha is version 1, and they have to keep opening: a customer whose
 * wardrobe stops loading because the schema moved on has been let down by us,
 * not by their browser.
 *
 * It also accepts the shape without a version at all, because that is what
 * Berchuma AI still returns. The model is taught cabinets in a later phase;
 * until then its answers come through here and arrive as one cabinet, which is
 * what a single wardrobe is anyway.
 */
export function upgradeSpec(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;

  const value = input as Record<string, unknown>;

  // Already has cabinets: version 2 or later. Only the run layer may be
  // missing.
  if (Array.isArray(value.cabinets)) return addRunLayer(value);

  const envelope = value.envelope;
  const bays = value.bays;
  if (typeof envelope !== "object" || envelope === null || !Array.isArray(bays)) {
    // Not a version 1 design either. Hand it to the parser, which will say
    // precisely what is wrong with it in the language of the schema.
    return value;
  }

  const carcass = (value.carcass ?? {}) as Record<string, unknown>;
  const plinth =
    typeof carcass.plinthHeight === "number" ? carcass.plinthHeight : 100;

  const { bays: _bays, ...rest } = value;

  return addRunLayer({
    ...rest,
    envelope,
    cabinets: [
      {
        id: "cabinet-1",
        label: typeof value.title === "string" ? value.title : "Unit",
        kind: cabinetKindFor(value.kind),
        position: { x: 0, y: 0, z: 0 },
        size: envelope,
        bays,
        plinthHeight: plinth,
      },
    ],
  });
}

/**
 * Version 2 to version 3: one straight run around what is already there.
 *
 * Every design Berchuma has produced so far is a straight run — that is all
 * the model could describe — so the upgrade is to say so explicitly rather
 * than to rearrange anything. The run's length is the envelope's width, its
 * depth and height the envelope's, and each cabinet is bound to it at the
 * offset its stored x already implies.
 *
 * Binding the cabinets matters as much as adding the run. A v2 design left
 * with no `runId` would keep its stored positions and stop being parametric —
 * it would open fine, look right, and then not move when the wall changed,
 * which is the most confusing possible outcome.
 */
function addRunLayer(value: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(value.runs) && value.runs.length > 0) {
    return { ...value, version: 3 };
  }

  const envelope = (value.envelope ?? {}) as Record<string, unknown>;
  const width = typeof envelope.width === "number" ? envelope.width : 2400;
  const depth = typeof envelope.depth === "number" ? envelope.depth : 600;
  const height = typeof envelope.height === "number" ? envelope.height : 2400;

  const runId = "run-1";

  const cabinets = Array.isArray(value.cabinets)
    ? value.cabinets.map((entry) => {
        if (typeof entry !== "object" || entry === null) return entry;
        const cabinet = entry as Record<string, unknown>;

        // An island has no wall, and forcing one onto a run would drag it to
        // the back of the room the first time the wall was edited.
        if (cabinet.kind === "island") return cabinet;

        const position = (cabinet.position ?? {}) as Record<string, unknown>;
        const x = typeof position.x === "number" ? position.x : 0;

        return { ...cabinet, runId, offset: Math.max(0, x) };
      })
    : value.cabinets;

  return {
    ...value,
    version: 3,
    cabinets,
    furnitureType: value.furnitureType ?? furnitureTypeFor(value.kind),
    layout: value.layout ?? "straight",
    cornerKind: value.cornerKind ?? "l_corner",
    runs: [{ id: runId, label: "Wall A", length: width, depth, height }],
  };
}

/** The furniture family a v2 design kind belongs to. */
function furnitureTypeFor(kind: unknown): FurnitureType {
  switch (kind) {
    case "kitchen":
      return "kitchen";
    case "wardrobe":
      return "wardrobe";
    case "tv_unit":
    case "vanity":
    case "shelving":
    case "bookshelf":
    case "office_storage":
      return "cabinet";
    default:
      return "custom";
  }
}

/** The sensible cabinet kind for a whole design of that type. */
function cabinetKindFor(kind: unknown): CabinetKind {
  switch (kind) {
    case "wardrobe":
    case "office_storage":
      return "tall";
    case "vanity":
      return "vanity";
    case "shelving":
    case "bookshelf":
      return "open";
    default:
      return "base";
  }
}

export function parseSpec(
  input: unknown,
):
  | { ok: true; spec: DesignSpec; issues: SpecIssue[] }
  | { ok: false; error: string } {
  const parsed = designSpecSchema.safeParse(upgradeSpec(input));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first
        ? `${first.path.join(".") || "spec"}: ${first.message}`
        : "The design could not be read.",
    };
  }

  const { spec, issues } = validateSpec(parsed.data);
  return { ok: true, spec, issues };
}
