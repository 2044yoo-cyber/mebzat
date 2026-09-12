import { z } from "zod";

import { findBoard, findEdgeBand, findHardware } from "./catalogue";
import {
  DRAWER_FRONT_GAP,
  distributeDimension,
  distributeDimensionWithMinimum,
} from "../services/dimensions";
import {
  minimumDrawerInteriorDepth,
  resolveDrawerFaces,
} from "../services/drawer-construction";
import { cornerFits } from "../services/layout";
import { designWorldBounds } from "../services/resolve";
import { openingClashes, openingFaults } from "../services/room-geometry";
import { roomSchema } from "./room";
import { kitchenSetupSchema } from "./kitchen";

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
 * The visible finish of a stocked board.
 *
 * This belongs to the board rather than to a render-only palette. A front
 * selected as walnut is a walnut item in the cut list and quote as well as in
 * the 3D view; the viewer is not allowed to invent a different material.
 */
export const boardAppearanceSchema = z.object({
  colour: z.string().min(1),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sheen: z.enum(["matt", "satin", "gloss"]).default("satin"),
});

export type BoardAppearance = z.infer<typeof boardAppearanceSchema>;

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
  /**
   * Optional for persisted designs written before board appearances existed.
   * Those designs keep using their legacy design finish as a visual fallback.
   */
  appearance: boardAppearanceSchema.optional(),
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

/**
 * Construction data supplied by a drawer-runner product.
 *
 * `boxLengthAllowance` accounts for the front/rear members of the drawer box:
 * a 500 mm runner produces the 480 mm side length measured on the reference
 * wardrobe. Keeping this on the purchased runner makes depth selection a
 * product rule rather than a magic number in mesh generation.
 */
export const drawerRunnerSchema = z.object({
  nominalLengths: z.array(z.number().positive()).min(1),
  sideClearance: z.number().nonnegative().max(50).default(13),
  frontSetback: z.number().nonnegative().max(100).default(20),
  rearClearance: z.number().nonnegative().max(100).default(20),
  boxLengthAllowance: z.number().nonnegative().max(100).default(20),
});

export type DrawerRunner = z.infer<typeof drawerRunnerSchema>;

export const hardwareSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(hardwareKinds),
  /** How it is sold. A runner is a pair; a hinge is each. */
  unit: z.enum(["each", "pair", "set", "metre"]),
  priceKey: z.string().min(1),
  fallbackRate: z.number().nonnegative(),
  /** Present only on drawer-runner products. */
  drawerRunner: drawerRunnerSchema.optional(),
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
    count: z.number().int().min(1).max(12),
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
          drawers: z.number().int().min(1).max(12).optional(),
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
  kitchenRole: z.enum(["fridge", "sink", "stove", "hood"]).optional(),
  frontInsets: z.object({ start: z.number().nonnegative(), end: z.number().nonnegative() }).optional(),
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
  /** The lower wardrobe cabinet this separate overhead carcass sits on. */
  stackedOn: z.string().min(1).optional(),
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
  cabinets: z.array(cabinetSchema).min(1).max(160),

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
    /** Doors and drawer fronts. Falls back to `board` for older designs. */
    frontBoard: boardSchema.optional(),
    /** Shelves, drawer boxes and fixed interior panels. */
    interiorBoard: boardSchema.optional(),
    backBoard: boardSchema,
    /** The wardrobe's continuous recessed plinth. */
    plinthBoard: boardSchema.optional(),
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
  kitchenSetup: kitchenSetupSchema.optional(),

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
  /** A wardrobe drawer front above this is a door-sized false drawer. */
  maxDrawerFront: 280,
  /** A divider-supported wardrobe module fits stock board and will not sag. */
  wardrobeBayWidth: 900,
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

function requiredBoard(id: string): Board {
  const board = findBoard(id);
  if (!board) throw new Error(`Required catalogue board '${id}' is missing.`);
  return board;
}

function requiredEdgeBand(id: string): EdgeBand {
  const band = findEdgeBand(id);
  if (!band) throw new Error(`Required catalogue edge band '${id}' is missing.`);
  return band;
}

/** Replaces mutable payload copies with the product records the shop stocks. */
function canonicaliseCatalogueParts(spec: DesignSpec, issues: SpecIssue[]): void {
  const canonicalBoard = (
    selected: Board | undefined,
    fallback: Board,
    path: string,
  ): Board => {
    const stocked = selected ? findBoard(selected.id) : undefined;
    if (stocked) return stocked;

    issues.push({
      severity: "warning",
      path,
      message: selected
        ? `${selected.id} is not a stocked Medosha board.`
        : "A required board was missing.",
      correction: `${path} reset to ${fallback.label}.`,
    });
    return fallback;
  };

  const defaultBody = requiredBoard("mdf-18-white");
  spec.carcass.board = canonicalBoard(
    spec.carcass.board,
    defaultBody,
    "carcass.board",
  );
  spec.carcass.frontBoard = spec.carcass.frontBoard
    ? canonicalBoard(spec.carcass.frontBoard, spec.carcass.board, "carcass.frontBoard")
    : undefined;
  spec.carcass.interiorBoard = spec.carcass.interiorBoard
    ? canonicalBoard(spec.carcass.interiorBoard, spec.carcass.board, "carcass.interiorBoard")
    : undefined;
  spec.carcass.plinthBoard = spec.carcass.plinthBoard
    ? canonicalBoard(spec.carcass.plinthBoard, spec.carcass.board, "carcass.plinthBoard")
    : undefined;
  spec.carcass.backBoard = canonicalBoard(
    spec.carcass.backBoard,
    requiredBoard("hdf-4-white"),
    "carcass.backBoard",
  );

  const stockedBand = findEdgeBand(spec.carcass.edgeBand.id);
  if (stockedBand) {
    spec.carcass.edgeBand = stockedBand;
  } else {
    const fallbackBand = requiredEdgeBand("pvc-1-white");
    issues.push({
      severity: "warning",
      path: "carcass.edgeBand",
      message: `${spec.carcass.edgeBand.id} is not a stocked Medosha edge band.`,
      correction: `carcass.edgeBand reset to ${fallbackBand.label}.`,
    });
    spec.carcass.edgeBand = fallbackBand;
  }

  const hardware: Hardware[] = [];
  const seenKinds = new Set<Hardware["kind"]>();
  for (const item of spec.hardware) {
    const stocked = findHardware(item.id);
    if (!stocked) {
      issues.push({
        severity: "warning",
        path: "hardware",
        message: `${item.id} is not a stocked Medosha hardware item.`,
        correction: `${item.id} was removed from the hardware selection.`,
      });
      continue;
    }
    // One selected product per hardware kind keeps the shared construction
    // rule and its quote aligned: a drawer cannot be built for one runner and
    // priced as another one.
    if (!seenKinds.has(stocked.kind)) {
      hardware.push(stocked);
      seenKinds.add(stocked.kind);
    }
  }
  spec.hardware = hardware;
}

/**
 * Restores stable unique identities before any parts are generated.
 *
 * A duplicate bay or stack-section id does not look wrong in JSON, but it
 * produces duplicate React keys and duplicate manufactured-part identifiers.
 * Those ids are how selection, a cut entry and eventual CNC traceability
 * agree on the same physical object, so they are construction data rather
 * than a cosmetic UI concern.
 */
function normalisePartIds(spec: DesignSpec, issues: SpecIssue[]): void {
  const unique = (requested: string, fallback: string, seen: Set<string>) => {
    const base = requested.trim() || fallback;
    if (!seen.has(base)) {
      seen.add(base);
      return base;
    }
    let suffix = 2;
    let candidate = `${base}-${suffix}`;
    while (seen.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    seen.add(candidate);
    return candidate;
  };

  const cabinetIds = new Set<string>();
  const bayIds = new Set<string>();
  const sectionIds = new Set<string>();

  for (const [cabinetIndex, cabinet] of spec.cabinets.entries()) {
    const cabinetId = unique(cabinet.id, `cabinet-${cabinetIndex + 1}`, cabinetIds);
    if (cabinetId !== cabinet.id) {
      issues.push({
        severity: "warning",
        path: `cabinets[${cabinetIndex}].id`,
        message: "Duplicate cabinet identifier would merge generated parts.",
        correction: `Cabinet identifier changed to ${cabinetId}.`,
      });
      cabinet.id = cabinetId;
    }

    for (const [bayIndex, bay] of cabinet.bays.entries()) {
      const bayId = unique(bay.id, `bay-${cabinetIndex + 1}-${bayIndex + 1}`, bayIds);
      if (bayId !== bay.id) {
        issues.push({
          severity: "warning",
          path: `cabinets[${cabinetIndex}].bays[${bayIndex}].id`,
          message: "Duplicate bay identifier would merge generated parts.",
          correction: `Bay identifier changed to ${bayId}.`,
        });
        bay.id = bayId;
      }

      if (bay.fitting.kind !== "stack") continue;
      for (const [sectionIndex, section] of bay.fitting.sections.entries()) {
        const sectionId = unique(
          section.id,
          `section-${cabinetIndex + 1}-${bayIndex + 1}-${sectionIndex + 1}`,
          sectionIds,
        );
        if (sectionId !== section.id) {
          issues.push({
            severity: "warning",
            path: `cabinets[${cabinetIndex}].bays[${bayIndex}].fitting.sections[${sectionIndex}].id`,
            message: "Duplicate stacked-section identifier would merge generated parts.",
            correction: `Section identifier changed to ${sectionId}.`,
          });
          section.id = sectionId;
        }
      }
    }
  }
}

/** Wardrobe structural zones are 18 mm stock board; only the back is 6 mm. */
function normaliseWardrobeBoards(spec: DesignSpec, issues: SpecIssue[]): void {
  const fallbackBody = requiredBoard("mdf-18-white");
  if (Math.abs(spec.carcass.board.thickness - 18) > 0.1) {
    issues.push({
      severity: "warning",
      path: "carcass.board",
      message: `Wardrobe carcass is ${spec.carcass.board.thickness} mm; this construction uses 18 mm board.`,
      correction: `Wardrobe carcass reset to ${fallbackBody.label}.`,
    });
    spec.carcass.board = fallbackBody;
  }

  const defaults: Record<"frontBoard" | "interiorBoard" | "plinthBoard", Board> = {
    frontBoard: spec.carcass.board,
    interiorBoard: spec.carcass.board,
    plinthBoard: requiredBoard("mdf-18-black"),
  };

  for (const field of ["frontBoard", "interiorBoard", "plinthBoard"] as const) {
    const selected = spec.carcass[field];
    if (!selected) {
      spec.carcass[field] = defaults[field];
      continue;
    }
    if (Math.abs(selected.thickness - 18) > 0.1) {
      issues.push({
        severity: "warning",
        path: `carcass.${field}`,
        message: `Wardrobe ${field} is ${selected.thickness} mm; this construction uses 18 mm board.`,
        correction: `${field} reset to ${defaults[field].label}.`,
      });
      spec.carcass[field] = defaults[field];
    }
  }

  const hdf6 = requiredBoard("hdf-6-white");
  if (Math.abs(spec.carcass.backBoard.thickness - 6) > 0.1) {
    issues.push({
      severity: "warning",
      path: "carcass.backBoard",
      message: `Wardrobe back board is ${spec.carcass.backBoard.thickness} mm; this construction uses a stocked 6 mm HDF panel.`,
      correction: `Wardrobe back panel set to ${hdf6.label}.`,
    });
    spec.carcass.backBoard = hdf6;
  }
}

/** Largest wardrobe envelope height whose gables and fronts fit stocked board. */
export function maximumWardrobeHeight(
  body: Board,
  fronts: Board,
  plinthHeight: number,
): number {
  const usable = Math.min(
    body.grain === "none" ? Math.max(body.sheet.length, body.sheet.width) : body.sheet.length,
    fronts.grain === "none" ? Math.max(fronts.sheet.length, fronts.sheet.width) : fronts.sheet.length,
  );
  return Math.min(LIMITS.maxHeight, Math.floor(plinthHeight + usable));
}

/**
 * Largest wardrobe envelope depth that leaves every gable and corner panel
 * inside the shorter side of the stocked carcass sheet.
 *
 * A straight cabinet could technically add the 6 mm back outside a 1220 mm
 * shell, but L/U corner gables use the whole recorded depth. Keeping this one
 * conservative envelope rule prevents a straight run and its corner module
 * from disagreeing by six millimetres.
 */
export function maximumWardrobeDepth(body: Board): number {
  return Math.floor(Math.min(body.sheet.length, body.sheet.width));
}

/**
 * A diagonal corner face is √2 longer than its cabinet opening. Its outer
 * depth must therefore be reduced before an otherwise-valid deep wardrobe
 * produces a diagonal front wider than any stocked sheet.
 */
function maximumWardrobeDepthForLayout(spec: DesignSpec): number {
  const normal = maximumWardrobeDepth(spec.carcass.board);
  if (
    (spec.layout !== "l_shaped" && spec.layout !== "u_shaped") ||
    spec.cornerKind !== "diagonal"
  ) {
    return normal;
  }

  const fronts = spec.carcass.frontBoard ?? spec.carcass.board;
  const faceLimit = Math.min(fronts.sheet.length, fronts.sheet.width);
  const diagonal = Math.floor(
    faceLimit / Math.SQRT2 + 2 * spec.carcass.board.thickness,
  );
  return Math.max(1, Math.min(normal, diagonal));
}

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

  // A schema proves an object has a board-shaped value; it cannot prove that
  // the value is one of Medosha's stocked boards rather than a client-injected
  // 10 m, zero-price sheet. Replace every known catalogue item by its canonical
  // record before any physical equation or price sees it.
  canonicaliseCatalogueParts(spec, issues);
  normalisePartIds(spec, issues);

  if (spec.furnitureType === "wardrobe") {
    normaliseWardrobeBoards(spec, issues);
    if (spec.carcass.plinthHeight < 50 || spec.carcass.plinthHeight > 250) {
      issues.push({
        severity: "warning",
        path: "carcass.plinthHeight",
        message: `Wardrobe plinth height must be a practical 50–250 mm structural base.`,
        correction: "Wardrobe plinth height set to 100 mm.",
      });
      spec.carcass.plinthHeight = 100;
    }
  }

  const t = spec.carcass.board.thickness;

  // The current joinery equations are 18 mm carcass construction. A front,
  // shelf or plinth can have a different *finish*, but allowing a different
  // structural thickness without re-solving every reveal and housed joint
  // would make a very convincing render of an unbuildable cabinet. Preserve
  // the body board when malformed/legacy input tries to mix thicknesses.
  for (const field of ["frontBoard", "interiorBoard", "plinthBoard"] as const) {
    const selected = spec.carcass[field];
    if (selected && Math.abs(selected.thickness - t) > 0.1) {
      issues.push({
        severity: "warning",
        path: `carcass.${field}`,
        message: `${field} is ${selected.thickness} mm while the carcass is ${t} mm. This construction uses one structural board thickness.`,
        correction: `${field} reset to the ${t} mm carcass board.`,
      });
      spec.carcass[field] = spec.carcass.board;
    }
  }

  // The walls, repaired before anything is solved from them. A run is what the
  // cabinet positions are derived from, so an absurd one propagates into every
  // placement rather than staying in one box.
  for (const run of spec.runs) {
    repairRun(run, spec, issues);
  }

  // A diagonal corner is a single physical 45° face spanning both returns.
  // It cannot bridge a 600 mm carcass on one wall to a 400 mm carcass on the
  // other without leaving an open triangular void behind the face. Keep the
  // requested corner type, but make its connected wardrobe runs one compatible
  // depth before cabinet geometry is derived from them.
  normaliseDiagonalWardrobeCornerDepths(spec, issues);

  for (const [index, cabinet] of spec.cabinets.entries()) {
    validateCabinet(cabinet, index, t, spec, issues);
  }

  // The overall box follows from the cabinets, so it is recomputed rather than
  // trusted. A caller that widened one cabinet has not updated the envelope,
  // and a camera framed on a stale envelope crops the design.
  const resolvedBounds = designWorldBounds(spec);
  spec.envelope = {
    width: resolvedBounds.width,
    height: resolvedBounds.height,
    depth: resolvedBounds.depth,
  };

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
 * A wardrobe is a collection of divider-supported modules, not one arbitrary
 * wide box. Splitting an oversized bay creates real gables/dividers, gives
 * shelves and drawer runners a practical span, and gives long top, bottom,
 * back and plinth panels supported cut joints. The fitting is cloned into each
 * resulting module, which is exactly what a joiner does when a 1.6 m drawer
 * bank becomes two usable drawer columns.
 */
function splitWideWardrobeBays(
  cabinet: Cabinet,
  thickness: number,
  at: string,
  named: string,
  issues: SpecIssue[],
): void {
  const originals = cabinet.bays;
  const initialCounts = originals.map((bay) =>
    Math.max(1, Math.ceil(bay.width / LIMITS.wardrobeBayWidth)),
  );

  if (initialCounts.every((count) => count === 1)) return;

  let counts = initialCounts;
  let modules: { source: Bay; widths: number[] }[] = [];

  // Adding a divider consumes 18 mm, so assign the remaining interior after
  // every requested split. Retry if proportional allocation made a module one
  // millimetre too wide; this avoids a hidden 901 mm shelf at an awkward size.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const moduleCount = counts.reduce((total, count) => total + count, 0);
    const usable = Math.max(
      0,
      Math.round(
        cabinet.size.width -
          2 * thickness -
          Math.max(0, moduleCount - 1) * thickness,
      ),
    );
    const grouped = distributeDimension(
      originals.map((bay) => bay.width),
      usable,
    );
    modules = originals.map((source, index) => ({
      source,
      widths: distributeDimension(
        Array.from({ length: counts[index] ?? 1 }, () => 1),
        grouped[index] ?? 0,
      ),
    }));

    const oversized = modules.findIndex((module) =>
      module.widths.some((width) => width > LIMITS.wardrobeBayWidth),
    );
    if (oversized < 0) break;
    counts = counts.map((count, index) =>
      index === oversized ? count + 1 : count,
    );
  }

  const split = modules.flatMap(({ source, widths }) =>
    widths.map((width, index) => ({
      ...structuredClone(source),
      // Keep the first identifier so an open editor selection stays on the
      // left-most new module. Added modules get deterministic descendants.
      id: index === 0 ? source.id : `${source.id}-module-${index + 1}`,
      width,
      doorLeaves:
        source.door === "sliding"
          ? 2
          : width > LIMITS.hingedLeafWidth
            ? 2
            : 1,
    })),
  );

  if (split.length === originals.length) return;

  cabinet.bays = split;
  issues.push({
    severity: "warning",
    path: `${at}.bays`,
    message: `${named} contained a bay wider than ${LIMITS.wardrobeBayWidth} mm.`,
    correction: `${named}: divided wide bays into ${split.length} supported wardrobe modules.`,
  });
}

/** Ensures every retained wardrobe bay can contain real drawer/door parts. */
function repairMinimumWardrobeBays(
  cabinet: Cabinet,
  thickness: number,
  at: string,
  named: string,
  issues: SpecIssue[],
): void {
  const clearAtOneBay = Math.max(1, cabinet.size.width - 2 * thickness);
  // A 300 mm module is a sensible lower practical bound. The smallest allowed
  // 300 mm cabinet has only 264 mm clear, so one such narrow cabinet remains
  // valid rather than being made impossible by its own global minimum.
  const minimum = Math.min(300, clearAtOneBay);
  const maxCount = Math.max(
    1,
    Math.floor(
      (cabinet.size.width - 2 * thickness + thickness) /
        (minimum + thickness),
    ),
  );

  if (cabinet.bays.length > maxCount) {
    const source = cabinet.bays;
    cabinet.bays = Array.from({ length: maxCount }, (_, index) => {
      // Spread retained configurations across the width rather than keeping
      // only the first few; malformed AI input with 24 bays should not turn a
      // drawers/shelves/hanging mix into one arbitrary repeated fitting.
      const sourceIndex = Math.min(
        source.length - 1,
        Math.floor((index * source.length) / maxCount),
      );
      const retained = structuredClone(source[sourceIndex]!);
      return {
        ...retained,
        // A retained source can be sampled more than once when malformed input
        // has many bays. Part and selection identifiers must stay unique even
        // when their construction recipe is deliberately repeated.
        id: index === 0 ? retained.id : `${retained.id}-retained-${index + 1}`,
      };
    });
    issues.push({
      severity: "warning",
      path: `${at}.bays`,
      message: `${named} had ${source.length} bays, too many for its physical width.`,
      correction: `${named}: reduced to ${maxCount} buildable modules.`,
    });
  }

  const target = Math.max(
    0,
    Math.round(
      cabinet.size.width -
        2 * thickness -
        Math.max(0, cabinet.bays.length - 1) * thickness,
    ),
  );
  if (target < cabinet.bays.length * minimum) return;

  const widths = distributeDimension(
    cabinet.bays.map((bay) => bay.width),
    target - cabinet.bays.length * minimum,
  ).map((width) => width + minimum);
  for (const [index, bay] of cabinet.bays.entries()) {
    bay.width = widths[index] ?? minimum;
  }
}

/**
 * The count range that keeps every visible drawer front manufacturable.
 *
 * Exported for the editor operations too: the add/duplicate buttons must not
 * offer a sixth 82 mm front and leave validation to quietly undo the click.
 */
export function practicalDrawerCount(opening: number): {
  minimum: number;
  maximum: number;
} {
  const height = Math.max(0, Math.floor(opening));
  return {
    minimum: Math.max(
      1,
      Math.ceil(
        (height + DRAWER_FRONT_GAP) /
          (LIMITS.maxDrawerFront + DRAWER_FRONT_GAP),
      ),
    ),
    maximum: Math.max(
      1,
      Math.floor(
        (height + DRAWER_FRONT_GAP) /
          (LIMITS.minDrawerFront + DRAWER_FRONT_GAP),
      ),
    ),
  };
}

/** Repairs explicit and implicit drawer fronts to the same practical limits. */
function repairWardrobeDrawerBank(
  fitting: Extract<Bay["fitting"], { kind: "drawers" }>,
  opening: number,
  path: string,
  named: string,
  issues: SpecIssue[],
): void {
  const originalFaces = resolveDrawerFaces({
    count: fitting.count,
    openingHeight: opening,
    openingFloor: 0,
    frontHeights: fitting.frontHeights,
  });
  const invalid = originalFaces.some(
    (face) =>
      face.height < LIMITS.minDrawerFront ||
      face.height > LIMITS.maxDrawerFront,
  );
  if (!invalid) return;

  const range = practicalDrawerCount(opening);
  let replacement: number[] | undefined;

  if (fitting.frontHeights?.length === fitting.count) {
    // Preserve an intentional proportion where possible: only split an
    // oversized declared front into proportionate practical fronts. A small
    // front after the new gaps would violate the 90 mm floor, so that case
    // deliberately falls back to an even bank rather than making a sliver.
    const expanded = originalFaces.flatMap((face) =>
      distributeDimension(
        Array.from(
          {
            length: Math.max(
              1,
              Math.ceil(
                (face.height + DRAWER_FRONT_GAP) /
                  (LIMITS.maxDrawerFront + DRAWER_FRONT_GAP),
              ),
            ),
          },
          () => 1,
        ),
        face.height,
      ),
    );
    const resolved = resolveDrawerFaces({
      count: expanded.length,
      openingHeight: opening,
      openingFloor: 0,
      frontHeights: expanded,
    });
    if (
      expanded.length <= 12 &&
      resolved.every(
        (face) =>
          face.height >= LIMITS.minDrawerFront &&
          face.height <= LIMITS.maxDrawerFront,
      )
    ) {
      replacement = expanded;
    }
  }

  if (replacement) {
    fitting.count = replacement.length;
    fitting.frontHeights = replacement;
  } else {
    const count = Math.min(
      12,
      Math.max(range.minimum, Math.min(fitting.count, range.maximum)),
    );
    fitting.count = count;
    delete fitting.frontHeights;
  }

  issues.push({
    severity: "warning",
    path,
    message: `${named} contained drawer fronts outside the ${LIMITS.minDrawerFront}–${LIMITS.maxDrawerFront} mm manufactured range.`,
    correction: `${named}: redistributed the drawer bank into ${fitting.count} practical fronts.`,
  });
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
  spec: DesignSpec,
  issues: SpecIssue[],
): void {
  const at = `cabinets[${index}]`;
  const named = cabinet.label || `cabinet ${index + 1}`;
  const furnitureType = spec.furnitureType;

  // The recessed plinth is structural wardrobe construction, not a decorative
  // option. Every connected wardrobe module uses the same positive height, so
  // a corner or adjacent module cannot develop a step in its continuous base.
  if (furnitureType === "wardrobe" && cabinet.stackedOn) {
    cabinet.plinthHeight = 0;
    cabinet.bays = cabinet.bays.map((bay) => ({
      ...bay,
      fitting: { kind: "open" },
    }));
  } else if (furnitureType === "wardrobe") {
    const standardPlinth = Math.max(50, Math.round(spec.carcass.plinthHeight || 100));
    if (cabinet.plinthHeight !== standardPlinth) {
    issues.push({
      severity: "warning",
      path: `${at}.plinthHeight`,
      message:
        cabinet.plinthHeight <= 0
          ? `${named} had no structural wardrobe plinth.`
          : `${named} used a plinth height that would break the continuous wardrobe base.`,
      correction: `${named} set to a ${standardPlinth} mm continuous recessed plinth.`,
    });
    cabinet.plinthHeight = standardPlinth;
    }
  }
  const maximumHeight =
    furnitureType === "wardrobe"
      ? maximumWardrobeHeight(
          spec.carcass.board,
          spec.carcass.frontBoard ?? spec.carcass.board,
          cabinet.plinthHeight,
        )
      : LIMITS.maxHeight;

  if (cabinet.size.height > maximumHeight) {
    issues.push({
      severity: "warning",
      path: `${at}.size.height`,
      message: `${named} is ${Math.round(cabinet.size.height)} mm tall, above the ${maximumHeight} mm available from its stocked carcass/front boards.`,
      correction: `${named} capped to ${maximumHeight} mm so its gables and fronts fit stock sheets.`,
    });
    cabinet.size.height = maximumHeight;
  }

  const minimumWidth = spec.kitchenSetup?.details ? 200 : LIMITS.minWidth;
  if (cabinet.size.width < minimumWidth) {
    issues.push({
      severity: "error",
      path: `${at}.size.width`,
      message: `${named} is ${Math.round(cabinet.size.width)} mm wide, narrower than a single bay.`,
      correction: `${named} set to ${minimumWidth} mm.`,
    });
    cabinet.size.width = minimumWidth;
  }

  if (furnitureType === "wardrobe") {
    // A gable's cut width must fit across the stocked sheet. The run and its
    // corner module use this same envelope limit, so L/U wardrobes cannot
    // develop a gap or overlap where the two construction paths meet.
    const maximumDepth = maximumWardrobeDepthForLayout(spec);
    if (cabinet.size.depth > maximumDepth) {
      issues.push({
        severity: "warning",
        path: `${at}.size.depth`,
        message: `${named} is ${Math.round(cabinet.size.depth)} mm deep, beyond the ${maximumDepth} mm stock-board shell depth.`,
        correction: `${named} capped to ${maximumDepth} mm so its gables fit a sheet.`,
      });
      cabinet.size.depth = maximumDepth;
    }

    // First reduce malformed over-segmentation, then later split only the
    // remaining practical bays. Reversing that order can create 24 zero-width
    // modules before the repair gets a chance to distribute usable width.
    repairMinimumWardrobeBays(cabinet, t, at, named, issues);
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
  if (declared > 0 && Math.abs(declared - target) > 0) {
    const widths = distributeDimension(
      cabinet.bays.map((bay) => bay.width),
      Math.round(target),
    );
    for (const [bayIndex, bay] of cabinet.bays.entries()) {
      bay.width = widths[bayIndex] ?? 0;
    }
    // A one-millimetre integer allocation is silent normalisation, not a
    // meaningful user correction. Larger source errors still remain visible
    // in the design history.
    if (Math.abs(declared - target) > 1) {
      issues.push({
        severity: "warning",
        path: `${at}.bays[].width`,
        message: `Bay widths in ${named} summed to ${Math.round(declared)} mm inside a ${Math.round(target)} mm carcass.`,
        correction: `${named}: bay widths scaled proportionally to fit.`,
      });
    }
  }

  if (furnitureType === "wardrobe") {
    // This must run after the width normalisation above: the splitter places
    // divider-supported modules from the actual clear width, not stale prompt
    // proportions. Its added dividers are physical panels in buildParts.
    splitWideWardrobeBays(cabinet, t, at, named, issues);
  }

  for (const [bayIndex, bay] of cabinet.bays.entries()) {
    const bayAt = `${at}.bays[${bayIndex}]`;

    const stackSections =
      bay.fitting.kind === "stack" ? bay.fitting.sections : [];
    const hasShelves =
      bay.fitting.kind === "shelves" ||
      stackSections.some((section) => section.kind === "shelves");
    const hasDrawers =
      bay.fitting.kind === "drawers" ||
      stackSections.some((section) => section.kind === "drawers");
    const hasHanging =
      bay.fitting.kind === "hanging" ||
      (furnitureType === "wardrobe" &&
        stackSections.some((section) => section.kind === "hanging"));

    if (furnitureType === "wardrobe" && hasDrawers) {
      // Reserve one real 90 mm front for every drawer section before shares
      // are applied. This is the same floor geometry.ts uses, so a tiny share
      // cannot render a false 14 mm drawer even on a direct repaired spec.
      const drawerSections =
        bay.fitting.kind === "drawers"
          ? 1
          : stackSections.filter((section) => section.kind === "drawers").length;
      const dividerCount = Math.max(0, stackSections.length - 1);
      const minimumEnvelopeHeight =
        cabinet.plinthHeight +
        2 * t +
        dividerCount * t +
        drawerSections * LIMITS.minDrawerFront;
      if (cabinet.size.height < minimumEnvelopeHeight) {
        const repairedHeight = Math.min(maximumHeight, minimumEnvelopeHeight);
        issues.push({
          severity: "warning",
          path: `${at}.size.height`,
          message: `${named} is too short to contain its requested drawer sections.`,
          correction: `${named} raised to ${repairedHeight} mm so every drawer has a usable front.`,
        });
        cabinet.size.height = repairedHeight;
      }
    }

    if (hasShelves && bay.width > LIMITS.shelfSpan) {
      issues.push({
        severity: "warning",
        path: `${bayAt}.width`,
        message: `A ${Math.round(bay.width)} mm shelf in ${t} mm board will sag; ${LIMITS.shelfSpan} mm is the practical span.`,
        correction: `${named}: add a divider or specify a thicker board for the ${Math.round(bay.width)} mm shelf.`,
      });
    }

    if (hasDrawers && bay.width > LIMITS.drawerWidth) {
      issues.push({
        severity: "warning",
        path: `${bayAt}.width`,
        message: `Drawers wider than ${LIMITS.drawerWidth} mm need centre support.`,
      });
    }

    if (furnitureType === "wardrobe" && bay.fitting.kind === "drawers") {
      const opening = cabinet.size.height - cabinet.plinthHeight - 2 * t;
      repairWardrobeDrawerBank(
        bay.fitting,
        opening,
        `${bayAt}.fitting`,
        named,
        issues,
      );
    }

    if (furnitureType === "wardrobe" && bay.fitting.kind === "stack") {
      // Stack drawer sections use the same height allocation as geometry.ts.
      // Applying the practical-front rule here prevents a tall lower section
      // from becoming two door-sized false drawers simply because it is mixed
      // with hanging or top storage above it.
      const opening = cabinet.size.height - cabinet.plinthHeight - 2 * t;
      const usable = Math.floor(
        opening - (bay.fitting.sections.length - 1) * t,
      );
      const heights = distributeDimensionWithMinimum(
        bay.fitting.sections.map((section) => section.share),
        usable,
        bay.fitting.sections.map((section) =>
          section.kind === "drawers" ? LIMITS.minDrawerFront : 0,
        ),
      );

      for (const [sectionIndex, section] of bay.fitting.sections.entries()) {
        if (section.kind !== "drawers") continue;
        const sectionHeight = heights[sectionIndex] ?? 0;
        const range = practicalDrawerCount(sectionHeight);
        const requested = section.drawers ?? 2;
        const required = Math.min(12, range.minimum);
        const maximum = Math.min(12, range.maximum);
        const next = Math.max(required, Math.min(requested, maximum));
        if (requested !== next) {
          section.drawers = next;
          issues.push({
            severity: "warning",
            path: `${bayAt}.fitting.sections[${sectionIndex}].drawers`,
            message: `${named} had impractical drawer fronts in a mixed section.`,
            correction: `${named}: set the mixed drawer section to ${next} practical fronts.`,
          });
        }
      }
    }

    const runner = spec.hardware.find(
      (item) => item.kind === "drawer_runner",
    )?.drawerRunner;
    const minimumDrawerDepth = hasDrawers
      ? minimumDrawerInteriorDepth(runner) + spec.carcass.backBoard.thickness
      : 0;
    const requiredDepth = Math.max(
      hasHanging ? LIMITS.hangingDepth : 0,
      minimumDrawerDepth,
    );
    if (requiredDepth > 0 && cabinet.size.depth < requiredDepth) {
      const needs = [
        hasHanging ? `a hanging rail needs ${LIMITS.hangingDepth} mm` : "",
        hasDrawers
          ? `the selected runner needs ${minimumDrawerDepth} mm`
          : "",
      ]
        .filter(Boolean)
        .join("; ");
      issues.push({
        severity: "warning",
        path: `${at}.size.depth`,
        message: `${named} is ${Math.round(cabinet.size.depth)} mm deep; ${needs}.`,
        correction: `${named} deepened to ${requiredDepth} mm.`,
      });
      cabinet.size.depth = requiredDepth;
    }

    if (bay.door === "sliding" && bay.doorLeaves !== 2) {
      bay.doorLeaves = 2;
      issues.push({
        severity: "warning",
        path: `${bayAt}.doorLeaves`,
        message: `${named} has a sliding bay without its two physical leaves.`,
        correction: `${named}: sliding bay set to two leaves.`,
      });
    }

    if (bay.door === "bifold" && bay.doorLeaves !== 2) {
      bay.doorLeaves = 2;
      issues.push({
        severity: "warning",
        path: `${bayAt}.doorLeaves`,
        message: `${named} has a bi-fold bay without its two connected leaves.`,
        correction: `${named}: bi-fold bay set to two physical leaves.`,
      });
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
 * Makes every run that shares a diagonal wardrobe corner use one shell depth.
 *
 * A diagonal corner belongs to all of its joined runs, rather than only the
 * pair that happened to be validated first. In a U this means the back run
 * cannot be made 600 mm deep for the left corner and then 700 mm deep for the
 * right one. The widest requested value is retained (up to stock capacity),
 * which avoids silently making a customer-requested usable depth smaller.
 */
function normaliseDiagonalWardrobeCornerDepths(
  spec: DesignSpec,
  issues: SpecIssue[],
): void {
  if (
    spec.furnitureType !== "wardrobe" ||
    spec.cornerKind !== "diagonal" ||
    (spec.layout !== "l_shaped" && spec.layout !== "u_shaped")
  ) {
    return;
  }

  const joinedRuns =
    spec.layout === "l_shaped" ? spec.runs.slice(0, 2) : spec.runs.slice(0, 3);
  if (joinedRuns.length < 2) return;

  // Call the shared fit predicate instead of duplicating its definition here.
  // The result also keeps this repair honest if layout adds another physical
  // corner type with a different compatibility rule later.
  const requestedDepths = joinedRuns.map((run) => run.depth);
  const firstFit = cornerFits(
    "diagonal",
    requestedDepths[0] ?? 0,
    requestedDepths[1] ?? 0,
  );
  const joinedIds = new Set(joinedRuns.map((run) => run.id));
  const target = Math.round(
    Math.min(
      maximumWardrobeDepthForLayout(spec),
      Math.max(
        ...requestedDepths,
        ...spec.cabinets
          .filter((cabinet) => cabinet.runId && joinedIds.has(cabinet.runId))
          .map((cabinet) => cabinet.size.depth),
      ),
    ),
  );

  // The target can only be non-positive for an invalid handwritten spec. Its
  // schema blocks that at the boundary; this guard keeps direct service calls
  // from replacing valid depth with an invalid zero.
  if (!Number.isFinite(target) || target <= 0) return;

  const changedRuns = joinedRuns.filter((run) => Math.abs(run.depth - target) > 1);
  const joinedCabinets = spec.cabinets.filter(
    (cabinet) => cabinet.runId && joinedIds.has(cabinet.runId),
  );
  const changedCabinets = joinedCabinets.filter(
    (cabinet) => Math.abs(cabinet.size.depth - target) > 1,
  );

  if (!changedRuns.length && !changedCabinets.length) return;

  for (const run of changedRuns) run.depth = target;
  for (const cabinet of changedCabinets) cabinet.size.depth = target;

  const reason = firstFit.ok
    ? "All joined diagonal corner pieces must share the same structural depth."
    : firstFit.reason;
  issues.push({
    severity: "warning",
    path: "runs",
    message: reason,
    correction: `Diagonal wardrobe corner runs and their cabinets set to a common ${target} mm depth.`,
  });
}

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
  spec: DesignSpec,
  issues: SpecIssue[],
): void {
  const maximumHeight =
    spec.furnitureType === "wardrobe"
      ? maximumWardrobeHeight(
          spec.carcass.board,
          spec.carcass.frontBoard ?? spec.carcass.board,
          spec.carcass.plinthHeight,
        )
      : LIMITS.maxHeight;
  if (run.height > maximumHeight) {
    issues.push({
      severity: "warning",
      path: `runs.${run.label}.height`,
      message: `${run.label} is ${Math.round(run.height)} mm tall, above the ${maximumHeight} mm this construction can cut from its stocked panels.`,
      correction: `${run.label} capped at ${maximumHeight} mm.`,
    });
    run.height = maximumHeight;
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

  const maximumDepth =
    spec.furnitureType === "wardrobe"
      ? maximumWardrobeDepthForLayout(spec)
      : 1200;
  // The run's footprint must use the same maximum depth as its cabinets and
  // corner block. Otherwise an L/U layout creates a real gap at the corner.
  if (run.depth > maximumDepth) {
    issues.push({
      severity: "warning",
      path: `runs.${run.label}.depth`,
      message: `${run.label} is ${Math.round(run.depth)} mm deep, beyond a single board width.`,
      correction: `${run.label} capped at ${maximumDepth} mm.`,
    });
    run.depth = maximumDepth;
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
    return upgradeWardrobeConstruction({ ...value, version: 3 });
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

  return upgradeWardrobeConstruction({
    ...value,
    version: 3,
    cabinets,
    furnitureType: value.furnitureType ?? furnitureTypeFor(value.kind),
    layout: value.layout ?? "straight",
    cornerKind: value.cornerKind ?? "l_corner",
    runs: [{ id: runId, label: "Wall A", length: width, depth, height }],
  });
}

/**
 * Moves the old shared wardrobe defaults onto the measured construction rules.
 *
 * HDF4 and a body-coloured base were generated by Medosha, not an intentional
 * custom construction choice. Upgrading them here means saved as well as newly
 * generated wardrobes receive the 6 mm back and actual black plinth. Any
 * other explicitly selected back board remains untouched.
 */
function upgradeWardrobeConstruction(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (value.furnitureType !== "wardrobe" && value.kind !== "wardrobe") {
    return value;
  }

  const carcass =
    typeof value.carcass === "object" && value.carcass !== null
      ? (value.carcass as Record<string, unknown>)
      : {};
  const backId = boardIdOf(carcass.backBoard);
  const body = carcass.board;
  const hdf6 = findBoard("hdf-6-white");
  const blackPlinth = findBoard("mdf-18-black");

  return {
    ...value,
    carcass: {
      ...carcass,
      // Only migrate the previous generated HDF4 default (or an omitted back);
      // a different custom back product remains the design owner's choice.
      backBoard:
        (backId === undefined || backId === "hdf-4-white") && hdf6
          ? hdf6
          : carcass.backBoard,
      frontBoard: carcass.frontBoard ?? body,
      interiorBoard: carcass.interiorBoard ?? body,
      plinthBoard: carcass.plinthBoard ?? blackPlinth ?? body,
    },
  };
}

function boardIdOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const board = value as Record<string, unknown>;
    return typeof board.id === "string" ? board.id : undefined;
  }
  return undefined;
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
