import { LIMITS, type Bay, type CabinetKind } from "../types/spec";

/**
 * The cabinets a kitchen is actually made of.
 *
 * A kitchen fitter does not think in boxes and fittings, they think in
 * modules: a sink unit, a pan drawer, an oven housing, a fridge space. Each one
 * has a width the trade sells it in and an inside that follows from what it is
 * for — a sink unit is open below because the bowl and the trap are in the way,
 * and a shelf there is a shelf that gets cut out on site.
 *
 * So this is a parts counter rather than a shape editor. Somebody adding
 * storage picks "pan drawers" and gets an 800 mm carcass with three deep
 * drawers in it, which is what they meant.
 *
 * The widths are the standard carcass sizes stocked here. A module can be
 * resized afterwards like anything else — these are starting points, not rules.
 */

export type ModuleGroup = "Base" | "Tall" | "Wall" | "Open";

export type KitchenModule = {
  id: string;
  label: string;
  group: ModuleGroup;
  kind: CabinetKind;
  width: number;
  height?: number;
  depth?: number;
  /** What goes inside, given the interior width the carcass ends up with. */
  bays: (interior: number) => Bay[];
  /** One line explaining anything a person would not guess. */
  note?: string;
};

let counter = 0;
function bayId(): string {
  counter += 1;
  return `bay-${Date.now().toString(36)}-${counter}`;
}

function bay(
  width: number,
  fitting: Bay["fitting"],
  door: Bay["door"] = "hinged",
): Bay {
  return {
    id: bayId(),
    width,
    fitting,
    door,
    doorLeaves:
      door === "hinged" && fitting.kind !== "drawers" && width > LIMITS.hingedLeafWidth
        ? 2
        : 1,
  };
}

export const KITCHEN_MODULES: KitchenModule[] = [
  // --- Base -----------------------------------------------------------------
  {
    id: "base-cupboard",
    label: "Base cupboard",
    group: "Base",
    kind: "base",
    width: 600,
    bays: (interior) => [bay(interior, { kind: "shelves", count: 1, adjustable: true })],
  },
  {
    id: "base-drawers",
    label: "Drawer unit",
    group: "Base",
    kind: "base",
    width: 600,
    bays: (interior) => [bay(interior, { kind: "drawers", count: 4 })],
  },
  {
    id: "base-pan-drawers",
    label: "Pan drawers",
    group: "Base",
    kind: "base",
    width: 800,
    bays: (interior) => [bay(interior, { kind: "drawers", count: 3 })],
    note: "Three deep drawers, for pans rather than cutlery.",
  },
  {
    id: "base-sink",
    label: "Sink unit",
    group: "Base",
    kind: "base",
    width: 800,
    bays: (interior) => [bay(interior, { kind: "open" })],
    note: "Open inside — the bowl and the trap take the space a shelf would.",
  },
  {
    id: "base-hob",
    label: "Hob unit",
    group: "Base",
    kind: "base",
    width: 600,
    bays: (interior) => [bay(interior, { kind: "drawers", count: 3 })],
    note: "The cooktop is cut into the worktop above it.",
  },
  {
    id: "base-corner",
    label: "Corner unit",
    group: "Base",
    kind: "base",
    width: 900,
    depth: 900,
    bays: (interior) => [bay(interior, { kind: "shelves", count: 1, adjustable: true })],
    note: "Deep, to reach into the corner. A carousel is fitted on site.",
  },
  {
    id: "base-dishwasher",
    label: "Dishwasher space",
    group: "Base",
    kind: "base",
    width: 600,
    bays: (interior) => [
      bay(
        interior,
        { kind: "appliance", appliance: "dishwasher", openingHeight: 820 },
        "none",
      ),
    ],
    note: "An opening, not a carcass. The machine is supplied by others.",
  },
  {
    id: "base-wine",
    label: "Wine rack",
    group: "Base",
    kind: "base",
    width: 300,
    bays: (interior) => [bay(interior, { kind: "shelves", count: 4, adjustable: false }, "none")],
  },

  // --- Tall -----------------------------------------------------------------
  {
    id: "tall-larder",
    label: "Larder",
    group: "Tall",
    kind: "tall",
    width: 600,
    height: 2100,
    bays: (interior) => [bay(interior, { kind: "shelves", count: 5, adjustable: true })],
  },
  {
    id: "tall-pantry",
    label: "Pantry",
    group: "Tall",
    kind: "tall",
    width: 900,
    height: 2100,
    bays: (interior) => {
      // A 900 carcass is too wide for one shelf, so it is two bays — which is
      // also how a pantry is built, with the door pair meeting on the divider.
      const each = Math.round((interior - 18) / 2);
      return [
        bay(each, { kind: "shelves", count: 5, adjustable: true }),
        bay(each, { kind: "shelves", count: 5, adjustable: true }),
      ];
    },
  },
  {
    id: "tall-oven",
    label: "Oven housing",
    group: "Tall",
    kind: "tall",
    width: 600,
    height: 2100,
    bays: (interior) => [
      bay(interior, { kind: "appliance", appliance: "oven", openingHeight: 600 }, "none"),
    ],
  },
  {
    id: "tall-oven-microwave",
    label: "Oven and microwave",
    group: "Tall",
    kind: "tall",
    width: 600,
    height: 2100,
    bays: (interior) => [
      bay(interior, { kind: "appliance", appliance: "oven", openingHeight: 600 }, "none"),
    ],
    note: "One 600 opening for the oven and a 450 above it for the microwave.",
  },
  {
    id: "tall-fridge",
    label: "Fridge space",
    group: "Tall",
    kind: "tall",
    width: 600,
    height: 2100,
    bays: (interior) => [
      bay(
        interior,
        { kind: "appliance", appliance: "refrigerator", openingHeight: 1800 },
        "none",
      ),
    ],
    note: "An opening for a freestanding fridge. Leave 20 mm each side for air.",
  },

  // --- Wall -----------------------------------------------------------------
  {
    id: "wall-cupboard",
    label: "Wall cupboard",
    group: "Wall",
    kind: "wall",
    width: 600,
    height: 720,
    depth: 350,
    bays: (interior) => [bay(interior, { kind: "shelves", count: 2, adjustable: true })],
  },
  {
    id: "wall-wide",
    label: "Wide wall cupboard",
    group: "Wall",
    kind: "wall",
    width: 800,
    height: 720,
    depth: 350,
    bays: (interior) => [bay(interior, { kind: "shelves", count: 2, adjustable: true })],
  },
  {
    id: "wall-extractor",
    label: "Extractor housing",
    group: "Wall",
    kind: "wall",
    width: 600,
    height: 400,
    depth: 350,
    bays: (interior) => [
      bay(
        interior,
        { kind: "appliance", appliance: "extractor", openingHeight: 320 },
        "none",
      ),
    ],
    note: "Shallow, over the hob, with the ducting behind.",
  },

  // --- Open -----------------------------------------------------------------
  {
    id: "open-wall-shelf",
    label: "Open wall shelf",
    group: "Open",
    kind: "wall",
    width: 800,
    height: 320,
    depth: 300,
    bays: (interior) => [bay(interior, { kind: "shelves", count: 1, adjustable: false }, "none")],
  },
  {
    id: "open-shelving",
    label: "Open shelving",
    group: "Open",
    kind: "open",
    width: 800,
    height: 900,
    depth: 320,
    bays: (interior) => [bay(interior, { kind: "shelves", count: 2, adjustable: true }, "none")],
  },
];

export const MODULE_GROUPS: ModuleGroup[] = ["Base", "Tall", "Wall", "Open"];

export function findModule(id: string): KitchenModule | undefined {
  return KITCHEN_MODULES.find((module) => module.id === id);
}
