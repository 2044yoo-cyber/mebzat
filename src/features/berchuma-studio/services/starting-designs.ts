import {
  BOARDS,
  EDGE_BANDS,
  defaultHardware,
  findBoard,
  findEdgeBand,
} from "../types/catalogue";
import {
  LIMITS,
  boundingBox,
  validateSpec,
  type Bay,
  type Cabinet,
  type DesignKind,
  type DesignSpec,
} from "../types/spec";

/**
 * A finished design, the moment somebody picks a category.
 *
 * The old studio opened empty and waited to be told what to build, which is
 * the wrong way round for the person it is for. Somebody who wants a kitchen
 * does not want to specify a kitchen; they want to look at one and say "not
 * that cupboard, a drawer" — and every one of those edits is easy once
 * something exists to edit.
 *
 * So these are complete: a kitchen arrives with base units, a sink, a drawer
 * bank, an oven housing, a fridge space, wall units, a worktop, a splashback
 * and a plinth. Nothing here is a placeholder, nothing is empty, and every
 * dimension is one a joiner in Addis would recognise.
 *
 * They are ordinary functions, not AI calls. A starting design must appear
 * instantly, must be identical every time, and must work with no API key
 * configured at all — none of which a model can promise.
 */

// Trade standards, in millimetres. These are the numbers a kitchen is built to
// almost everywhere, and getting them wrong is what makes a generated design
// look generated.
const BASE_HEIGHT = 870;
const BASE_DEPTH = 600;
const PLINTH = 100;
/** Underside of the wall units. 1450 leaves the usual 500 mm over the top. */
const WALL_BOTTOM = 1450;
const WALL_HEIGHT = 720;
const WALL_DEPTH = 350;
const TALL_HEIGHT = 2100;

let counter = 0;
/** Stable within one design, unique across a session of adding cabinets. */
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function bay(
  width: number,
  fitting: Bay["fitting"],
  door: Bay["door"] = "hinged",
  doorLeaves: 1 | 2 = 1,
): Bay {
  return { id: nextId("bay"), width, fitting, door, doorLeaves };
}

/** Clear opening inside a cabinet of this width with one bay, in 18 mm board. */
function singleBayWidth(cabinetWidth: number, thickness = 18): number {
  return cabinetWidth - 2 * thickness;
}

/**
 * Enough bays that no shelf in this cabinet sags.
 *
 * An 18 mm shelf bows visibly past about 900 mm, and the fix is a divider. The
 * first pass at these designs put a single bay in a 2000 mm office cupboard and
 * the studio opened with six correction notices on screen — which is the
 * validator working and the defaults not. A starting design should not need
 * repairing before anybody has touched it.
 *
 * 780 rather than 900 so the widest bay still has room to spare after
 * `validateSpec` rescales it to the exact interior.
 */
function shelvedBays(
  cabinetWidth: number,
  shelves: number,
  door: Bay["door"] = "hinged",
  thickness = 18,
): Bay[] {
  const interior = cabinetWidth - 2 * thickness;
  const count = Math.max(1, Math.ceil(interior / 780));
  const width = Math.round((interior - (count - 1) * thickness) / count);

  // A leaf wider than the practical limit gets a pair, decided here rather
  // than left to the validator. It would make the same change — but it would
  // announce it as a correction, and a design that opens by telling somebody
  // it has already fixed three things it wrote itself reads as unreliable.
  const leaves: 1 | 2 = width > LIMITS.hingedLeafWidth ? 2 : 1;

  return Array.from({ length: count }, () =>
    bay(width, { kind: "shelves", count: shelves, adjustable: true }, door, leaves),
  );
}

function unit(
  label: string,
  kind: Cabinet["kind"],
  x: number,
  y: number,
  size: { width: number; height: number; depth: number },
  bays: Bay[],
  plinthHeight = 0,
): Cabinet {
  return {
    id: nextId(kind),
    label,
    kind,
    position: { x, y, z: 0 },
    size,
    bays,
    plinthHeight,
  };
}

// ---------------------------------------------------------------------------

export type StartingDesignOptions = {
  /** Overall run length for a kitchen, or width for anything else. */
  width?: number;
  colour?: { name: string; hex: string };
};

/**
 * The complete design for a category.
 *
 * Runs through `validateSpec` before it is returned, so a starting design is
 * held to exactly the same carpentry rules as one the model wrote. If a
 * standard here ever produces a sagging shelf, the studio says so on the first
 * screen rather than at the saw.
 */
export function startingDesign(
  kind: DesignKind,
  options: StartingDesignOptions = {},
): DesignSpec {
  counter = 0;

  const spec = build(kind, options);
  return validateSpec(spec).spec;
}

function build(kind: DesignKind, options: StartingDesignOptions): DesignSpec {
  switch (kind) {
    case "kitchen":
      return kitchen(options);
    case "wardrobe":
      return wardrobe(options);
    case "tv_unit":
      return tvUnit(options);
    case "vanity":
      return vanity(options);
    case "bookshelf":
    case "shelving":
      return bookshelf(options, kind);
    case "office_storage":
      return officeStorage(options);
    default:
      return custom(options);
  }
}

// ---------------------------------------------------------------------------
// Shared shell
// ---------------------------------------------------------------------------

function shell(
  kind: DesignKind,
  title: string,
  cabinets: Cabinet[],
  options: StartingDesignOptions,
  extras: Partial<DesignSpec> = {},
): DesignSpec {
  const board = findBoard("mdf-18-white") ?? BOARDS[0]!;
  const backBoard = findBoard("hdf-4-white") ?? board;
  const edgeBand = findEdgeBand("pvc-1-white") ?? EDGE_BANDS[0]!;
  const colour = options.colour ?? { name: "White", hex: "#f2f0ec" };

  const envelope = boundingBox(cabinets);

  // Every starting design is one straight run, and its cabinets are bound to
  // that run at the offset their x already implies. Binding them here rather
  // than leaving the stored positions is what makes a starting design
  // parametric the moment it opens: widen the wall and the modules follow.
  const bound = cabinets.map((cabinet) =>
    cabinet.kind === "island"
      ? cabinet
      : { ...cabinet, runId: "run-1", offset: Math.max(0, cabinet.position.x) },
  );

  return {
    version: 3,
    kind,
    furnitureType: furnitureTypeFor(kind),
    layout: "straight",
    cornerKind: "l_corner",
    runs: [
      {
        id: "run-1",
        label: "Wall A",
        length: envelope.width,
        depth: envelope.depth,
        height: envelope.height,
      },
    ],
    units: "mm",
    title,
    cabinets: bound,
    envelope,
    carcass: {
      board,
      backBoard,
      edgeBand,
      plinthHeight: PLINTH,
      doorGap: 2,
      shelfSetback: 10,
    },
    hardware: defaultHardware(),
    finish: { colour: colour.name, hex: colour.hex, sheen: "satin" },
    lighting: { ledStrip: false, colourTemperature: 3000 },
    meta: {
      style: "modern",
      prompt: "",
      assumptions: [],
      corrections: [],
    },
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// Kitchen
// ---------------------------------------------------------------------------

/**
 * A working kitchen, not a row of boxes.
 *
 * Laid out the way a kitchen actually is: the tall housings at one end so the
 * run is uninterrupted, the sink in the middle of the base run where the
 * window usually is, drawers beside the cooktop because that is where pans
 * live, and wall units over the base units but never over the fridge.
 *
 * The default is 3600 mm, which is the commonest single-wall kitchen in an
 * Addis apartment. Anything from 2400 to 6000 lays out sensibly; below that
 * the tall units are dropped, because a 2 m kitchen with a larder in it has no
 * kitchen left.
 */
function kitchen(options: StartingDesignOptions): DesignSpec {
  const runLength = clamp(options.width ?? 3600, 1800, 8000);
  const cabinets: Cabinet[] = [];

  // Tall units first, at the left end. A fridge housing and a larder if there
  // is room for both, a fridge alone if not, neither in a very short kitchen.
  let x = 0;
  const roomForTall = runLength >= 2800;
  const roomForLarder = runLength >= 4200;

  if (roomForTall) {
    cabinets.push(
      unit(
        "Fridge space",
        "tall",
        x,
        0,
        { width: 600, height: TALL_HEIGHT, depth: BASE_DEPTH },
        [
          bay(
            singleBayWidth(600),
            { kind: "appliance", appliance: "refrigerator", openingHeight: 1800 },
            "none",
          ),
        ],
        PLINTH,
      ),
    );
    x += 600;
  }

  if (roomForLarder) {
    cabinets.push(
      unit(
        "Larder",
        "tall",
        x,
        0,
        { width: 600, height: TALL_HEIGHT, depth: BASE_DEPTH },
        shelvedBays(600, 5),
        PLINTH,
      ),
    );
    x += 600;
  }

  // What is left is the base run, and the wall units sit over it.
  const baseStart = x;
  const baseLength = Math.max(600, runLength - baseStart);

  for (const entry of baseModules(baseLength)) {
    cabinets.push(
      unit(
        entry.label,
        "base",
        x,
        0,
        { width: entry.width, height: BASE_HEIGHT, depth: BASE_DEPTH },
        entry.bays,
        PLINTH,
      ),
    );
    x += entry.width;
  }

  // Wall units over the base run only. Never over the fridge — a wall cupboard
  // 350 mm deep above a 600 mm fridge is a cupboard nobody can open.
  let wallX = baseStart;
  const wallEnd = baseStart + baseLength;
  while (wallEnd - wallX >= 400) {
    const width = Math.min(800, wallEnd - wallX);
    cabinets.push(
      unit(
        "Wall unit",
        "wall",
        wallX,
        WALL_BOTTOM,
        { width, height: WALL_HEIGHT, depth: WALL_DEPTH },
        shelvedBays(width, 2),
      ),
    );
    wallX += width;
  }

  const worktopBoard =
    findBoard("worktop-38-granite-look") ?? findBoard("mdf-18-white") ?? BOARDS[0]!;

  return shell("kitchen", `Kitchen run, ${runLength} mm`, cabinets, options, {
    worktop: {
      board: worktopBoard,
      overhang: 20,
      // A 100 mm upstand rather than a full tiled splashback, which is a
      // finish somebody else supplies and Berchuma cannot cut.
      backsplashHeight: 100,
    },
    lighting: { ledStrip: true, colourTemperature: 3000 },
    meta: {
      style: "modern",
      prompt: "",
      assumptions: [
        `Run length assumed at ${runLength} mm.`,
        "Worktop at 908 mm — 870 mm carcass on a 100 mm plinth, under a 38 mm top.",
        "Wall units hung at 1450 mm, leaving 500 mm of working height.",
      ],
      corrections: [],
    },
  });
}

/**
 * How the base run is divided.
 *
 * Sink in the middle, drawers next to where the hob goes, cupboards filling
 * the rest — the arrangement a joiner would propose without being asked. The
 * widths are the standard carcass sizes sold here, so every module is a
 * cabinet somebody could order rather than an arbitrary division of a length.
 */
function baseModules(
  length: number,
): { label: string; width: number; bays: Bay[] }[] {
  const modules: { label: string; width: number; bays: Bay[] }[] = [];
  let left = length;

  const take = (label: string, width: number, bays: (w: number) => Bay[]) => {
    if (left < width) return false;
    modules.push({ label, width, bays: bays(width) });
    left -= width;
    return true;
  };

  take("Drawer bank", 600, (w) => [
    bay(singleBayWidth(w), { kind: "drawers", count: 4 }),
  ]);

  take("Sink unit", 800, (w) => [
    // Open below a sink: the bowl and the trap occupy it, so a shelf there is
    // a shelf that gets cut out on site.
    bay(singleBayWidth(w), { kind: "open" }, "hinged", 2),
  ]);

  take("Hob unit", 600, (w) => [
    bay(singleBayWidth(w), { kind: "drawers", count: 3 }),
  ]);

  // Fill what is left with 600 cupboards, and give any remainder to the last
  // one rather than leaving a 130 mm sliver nobody can use.
  while (left >= 400) {
    const width = left < 900 ? left : 600;
    take("Base unit", width, (w) => shelvedBays(w, 1));
  }

  if (modules.length === 0) {
    modules.push({
      label: "Base unit",
      width: Math.max(400, length),
      bays: [
        bay(singleBayWidth(Math.max(400, length)), {
          kind: "shelves",
          count: 1,
          adjustable: true,
        }),
      ],
    });
  }

  return modules;
}

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------

function wardrobe(options: StartingDesignOptions): DesignSpec {
  const width = clamp(options.width ?? 2400, 900, 6000);
  const t = 18;
  const bayWidth = Math.round((width - 2 * t - 2 * t) / 3);

  const cabinets = [
    unit(
      "Wardrobe",
      "tall",
      0,
      0,
      { width, height: 2400, depth: 600 },
      [
        bay(bayWidth, { kind: "hanging", rails: 1, shelfAbove: true }, "hinged", 2),
        bay(bayWidth, { kind: "drawers", count: 4 }),
        bay(bayWidth, { kind: "shelves", count: 5, adjustable: true }, "hinged", 2),
      ],
      PLINTH,
    ),
  ];

  return shell("wardrobe", `Fitted wardrobe, ${width} mm`, cabinets, options, {
    meta: {
      style: "modern",
      prompt: "",
      assumptions: [
        "Height assumed at 2400 mm for a 2700 mm ceiling.",
        "Depth of 600 mm, which a hanger needs.",
      ],
      corrections: [],
    },
  });
}

function tvUnit(options: StartingDesignOptions): DesignSpec {
  const width = clamp(options.width ?? 1800, 600, 4000);
  const t = 18;
  const bayWidth = Math.round((width - 2 * t - 2 * t) / 3);

  const cabinets = [
    unit(
      "TV unit",
      "base",
      0,
      0,
      { width, height: 450, depth: 400 },
      [
        bay(bayWidth, { kind: "drawers", count: 2 }, "none"),
        bay(bayWidth, { kind: "open" }, "none"),
        bay(bayWidth, { kind: "drawers", count: 2 }, "none"),
      ],
      60,
    ),
    // A shelf above, which is what people put a TV unit under.
    unit(
      "Wall shelf",
      "wall",
      Math.round(width * 0.15),
      1250,
      { width: Math.round(width * 0.7), height: 320, depth: 300 },
      shelvedBays(Math.round(width * 0.7), 1, "none"),
    ),
  ];

  return shell("tv_unit", `TV unit, ${width} mm`, cabinets, options, {
    meta: {
      style: "minimal",
      prompt: "",
      assumptions: [
        "Height of 450 mm, which puts a screen at seated eye level.",
        "Depth of 400 mm for a media box behind the doors.",
      ],
      corrections: [],
    },
  });
}

function vanity(options: StartingDesignOptions): DesignSpec {
  const width = clamp(options.width ?? 1200, 450, 3000);
  const t = 18;
  const half = Math.round((width - 2 * t - t) / 2);

  const cabinets = [
    // Wall hung, because a bathroom floor gets washed.
    unit(
      "Vanity",
      "vanity",
      0,
      350,
      { width, height: 500, depth: 500 },
      [
        bay(half, { kind: "drawers", count: 2 }, "none"),
        bay(half, { kind: "drawers", count: 2 }, "none"),
      ],
    ),
    unit(
      "Mirror cabinet",
      "wall",
      0,
      1300,
      { width, height: 700, depth: 150 },
      shelvedBays(width, 2),
    ),
  ];

  const worktopBoard = findBoard("worktop-20-quartz") ?? BOARDS[0]!;

  return shell("vanity", `Double vanity, ${width} mm`, cabinets, options, {
    worktop: { board: worktopBoard, overhang: 10, backsplashHeight: 0 },
    meta: {
      style: "modern",
      prompt: "",
      assumptions: [
        "Hung at 350 mm off the floor so the floor can be cleaned under it.",
        "Basins are supplied by others and cut into the top.",
      ],
      corrections: [],
    },
  });
}

function bookshelf(
  options: StartingDesignOptions,
  kind: DesignKind,
): DesignSpec {
  const width = clamp(options.width ?? 1800, 400, 6000);
  const bays = shelvedBays(width, 5, "none");

  const cabinets = [
    unit(
      "Shelving",
      "open",
      0,
      0,
      { width, height: 2100, depth: 320 },
      bays,
      60,
    ),
  ];

  return shell(kind, `Open shelving, ${width} mm`, cabinets, options, {
    meta: {
      style: "modern",
      prompt: "",
      assumptions: [
        "Depth of 320 mm, which takes a book but not a folder.",
        `Divided into ${bays.length} bays so no shelf spans far enough to sag.`,
      ],
      corrections: [],
    },
  });
}

function officeStorage(options: StartingDesignOptions): DesignSpec {
  const width = clamp(options.width ?? 2000, 600, 5000);

  // Two cabinets stacked, which is what office storage actually is: lockable
  // cupboards below, open filing above. Under the old single-box spec this had
  // to be faked as one carcass with different fittings.
  const cabinets = [
    unit(
      "Cupboards",
      "base",
      0,
      0,
      { width, height: 900, depth: 450 },
      shelvedBays(width, 1),
      PLINTH,
    ),
    unit(
      "Open filing",
      "open",
      0,
      900,
      { width, height: 900, depth: 450 },
      shelvedBays(width, 2, "none"),
    ),
  ];

  return shell("office_storage", `Office storage, ${width} mm`, cabinets, options, {
    meta: {
      style: "modern",
      prompt: "",
      assumptions: [
        "Lockable cupboards below, open filing above.",
        "Depth of 450 mm, which takes a lever-arch file on its side.",
      ],
      corrections: [],
    },
  });
}

function custom(options: StartingDesignOptions): DesignSpec {
  const width = clamp(options.width ?? 1200, 300, 6000);

  const cabinets = [
    unit(
      "Cabinet",
      "base",
      0,
      0,
      { width, height: 900, depth: 500 },
      shelvedBays(width, 2),
      PLINTH,
    ),
  ];

  return shell("custom", `Cabinet, ${width} mm`, cabinets, options, {
    meta: {
      style: "modern",
      prompt: "",
      assumptions: ["A single cabinet to start from. Change anything."],
      corrections: [],
    },
  });
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)));
}

/**
 * Which furniture family a preset belongs to.
 *
 * `kind` is the preset somebody clicked; `furnitureType` is what the editor
 * branches on. A vanity and a bookshelf are both cabinetry as far as the
 * component palette is concerned, and only the kitchen and the wardrobe have
 * families of their own.
 */
function furnitureTypeFor(
  kind: DesignKind,
): "wardrobe" | "kitchen" | "cabinet" | "custom" {
  if (kind === "kitchen") return "kitchen";
  if (kind === "wardrobe") return "wardrobe";
  if (kind === "custom") return "custom";
  return "cabinet";
}
