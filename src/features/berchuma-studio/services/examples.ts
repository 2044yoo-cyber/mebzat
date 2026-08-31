import { BOARDS, EDGE_BANDS, defaultHardware, findBoard, findEdgeBand } from "../types/catalogue";
import { boundingBox, type Bay, type Cabinet, type DesignSpec } from "../types/spec";

/**
 * Reference designs.
 *
 * These are not fixtures for a test file — they are the shapes Berchuma AI is
 * expected to produce, written by hand first so that the geometry, the cost
 * and the cut list can be checked against a design somebody who builds
 * wardrobes would recognise. When the model's output stops looking like these,
 * the prompt is wrong, not the arithmetic.
 */

const carcassBoard = findBoard("mdf-18-walnut") ?? BOARDS[0]!;
const backBoard = findBoard("hdf-4-white") ?? BOARDS[BOARDS.length - 1]!;
const band = findEdgeBand("pvc-2-walnut") ?? EDGE_BANDS[0]!;

/** A cabinet, without repeating the position-and-size boilerplate each time. */
function cabinet(
  id: string,
  label: string,
  kind: Cabinet["kind"],
  position: { x: number; y: number; z?: number },
  size: { width: number; height: number; depth: number },
  bays: Bay[],
  plinthHeight = 0,
): Cabinet {
  return {
    id,
    label,
    kind,
    position: { x: position.x, y: position.y, z: position.z ?? 0 },
    size,
    bays,
    plinthHeight,
  };
}

/**
 * The bread-and-butter job: a 2400 mm three-bay wardrobe, hanging in the two
 * outer bays, drawers and shelves in the middle.
 */
export function wardrobeExample(): DesignSpec {
  const cabinets = [
    cabinet(
      "wardrobe",
      "Wardrobe",
      "tall",
      { x: 0, y: 0 },
      { width: 2400, height: 2400, depth: 600 },
      // 2400 less two gables and two dividers is 2328, so 776 a bay.
      [
        {
          id: "bay-1",
          width: 776,
          fitting: { kind: "hanging", rails: 1, shelfAbove: true },
          door: "hinged",
          doorLeaves: 2,
        },
        {
          id: "bay-2",
          width: 776,
          fitting: { kind: "drawers", count: 4 },
          door: "hinged",
          doorLeaves: 1,
        },
        {
          id: "bay-3",
          width: 776,
          fitting: { kind: "shelves", count: 5, adjustable: true },
          door: "hinged",
          doorLeaves: 2,
        },
      ],
      100,
    ),
  ];

  const run = straightRunFor(cabinets);

  return {
    version: 3,
    kind: "wardrobe",
    furnitureType: "wardrobe",
    layout: run.layout,
    cornerKind: run.cornerKind,
    runs: run.runs,
    units: "mm",
    title: "Three-bay walnut wardrobe",
    cabinets: run.bound,
    envelope: run.envelope,
    carcass: {
      board: carcassBoard,
      backBoard,
      edgeBand: band,
      plinthHeight: 100,
      doorGap: 2,
      shelfSetback: 10,
    },
    hardware: defaultHardware(),
    finish: { colour: "Walnut", hex: "#6b4a32", sheen: "satin" },
    lighting: { ledStrip: true, colourTemperature: 3000 },
    meta: {
      style: "modern",
      prompt: "Design a luxury walnut wardrobe for a 2.4 m wall",
      assumptions: [
        "Ceiling height assumed at 2.7 m, wardrobe built to 2.4 m.",
        "Depth of 600 mm assumed for standard hanging.",
      ],
      corrections: [],
    },
  };
}

/** A small unit, for checking that nothing assumes three bays. */
export function tvUnitExample(): DesignSpec {
  const white = findBoard("mdf-18-white") ?? BOARDS[0]!;
  const whiteBand = findEdgeBand("pvc-1-white") ?? EDGE_BANDS[0]!;

  const cabinets = [
    cabinet(
      "tv",
      "TV unit",
      "base",
      { x: 0, y: 0 },
      { width: 1800, height: 450, depth: 400 },
      // 1800 less two 18 mm gables and two 18 mm dividers leaves 1728, which is
      // 576 a bay. It read 588 here, and nothing noticed until the parts were
      // given real positions and the unit came out 36 mm wider than its own
      // envelope. `validateSpec` rescales bays exactly like this, so the bug was
      // invisible on every path that goes through it — which is every path
      // except a fixture handed straight to `buildParts`.
      [
        { id: "left", width: 576, fitting: { kind: "drawers", count: 2 }, door: "none", doorLeaves: 1 },
        { id: "middle", width: 576, fitting: { kind: "open" }, door: "none", doorLeaves: 1 },
        { id: "right", width: 576, fitting: { kind: "drawers", count: 2 }, door: "none", doorLeaves: 1 },
      ],
      60,
    ),
  ];

  const run = straightRunFor(cabinets);

  return {
    version: 3,
    kind: "tv_unit",
    furnitureType: "cabinet",
    layout: run.layout,
    cornerKind: run.cornerKind,
    runs: run.runs,
    units: "mm",
    title: "Low TV unit, 1800 mm",
    cabinets: run.bound,
    envelope: run.envelope,
    carcass: {
      board: white,
      backBoard,
      edgeBand: whiteBand,
      plinthHeight: 60,
      doorGap: 2,
      shelfSetback: 10,
    },
    hardware: defaultHardware(),
    finish: { colour: "White", hex: "#f2f2f0", sheen: "matt" },
    meta: {
      style: "minimal",
      prompt: "Create a low white TV unit 1.8 m wide",
      assumptions: [],
      corrections: [],
    },
  };
}

/**
 * A kitchen, which is the design the old single-envelope spec could not hold.
 *
 * Three base units in a row with an oven housing at the end, and two wall units
 * hung above them at 1450 — six cabinets at three different heights. Under the
 * previous schema this was not a design that could be written down at all, so
 * it is here as the thing that proves the change did what it was for.
 */
export function kitchenExample(): DesignSpec {
  const white = findBoard("mdf-18-white") ?? BOARDS[0]!;
  const whiteBand = findEdgeBand("pvc-1-white") ?? EDGE_BANDS[0]!;

  const BASE_HEIGHT = 870;
  const WALL_BOTTOM = 1450;

  const cabinets = [
    cabinet(
      "base-1",
      "Drawer bank",
      "base",
      { x: 0, y: 0 },
      { width: 600, height: BASE_HEIGHT, depth: 600 },
      [{ id: "b1", width: 564, fitting: { kind: "drawers", count: 4 }, door: "hinged", doorLeaves: 1 }],
      100,
    ),
    cabinet(
      "base-2",
      "Sink unit",
      "base",
      { x: 600, y: 0 },
      { width: 800, height: BASE_HEIGHT, depth: 600 },
      [{ id: "b2", width: 764, fitting: { kind: "open" }, door: "hinged", doorLeaves: 2 }],
      100,
    ),
    cabinet(
      "base-3",
      "Base unit",
      "base",
      { x: 1400, y: 0 },
      { width: 600, height: BASE_HEIGHT, depth: 600 },
      [{ id: "b3", width: 564, fitting: { kind: "shelves", count: 1, adjustable: true }, door: "hinged", doorLeaves: 1 }],
      100,
    ),
    cabinet(
      "tall-1",
      "Oven housing",
      "tall",
      { x: 2000, y: 0 },
      { width: 600, height: 2100, depth: 600 },
      [
        {
          id: "oven",
          width: 564,
          fitting: { kind: "appliance", appliance: "oven", openingHeight: 600 },
          door: "none",
          doorLeaves: 1,
        },
      ],
      100,
    ),
    cabinet(
      "wall-1",
      "Wall unit",
      "wall",
      { x: 0, y: WALL_BOTTOM },
      { width: 700, height: 720, depth: 350 },
      [{ id: "w1", width: 664, fitting: { kind: "shelves", count: 2, adjustable: true }, door: "hinged", doorLeaves: 2 }],
    ),
    cabinet(
      "wall-2",
      "Wall unit",
      "wall",
      { x: 700, y: WALL_BOTTOM },
      { width: 700, height: 720, depth: 350 },
      [{ id: "w2", width: 664, fitting: { kind: "shelves", count: 2, adjustable: true }, door: "hinged", doorLeaves: 2 }],
    ),
  ];

  const run = straightRunFor(cabinets);

  return {
    version: 3,
    kind: "kitchen",
    furnitureType: "kitchen",
    layout: run.layout,
    cornerKind: run.cornerKind,
    runs: run.runs,
    units: "mm",
    title: "Kitchen run, 2600 mm",
    cabinets: run.bound,
    envelope: run.envelope,
    carcass: {
      board: white,
      backBoard,
      edgeBand: whiteBand,
      plinthHeight: 100,
      doorGap: 2,
      shelfSetback: 10,
    },
    hardware: defaultHardware(),
    finish: { colour: "White", hex: "#f2f0ec", sheen: "satin" },
    meta: {
      style: "modern",
      prompt: "A 2.6 m kitchen run with a sink, drawers and an oven housing",
      assumptions: ["Worktop height assumed at 900 mm including the 30 mm top."],
      corrections: [],
    },
  };
}

/**
 * Deliberately wrong, to prove the validator repairs rather than rejects: a
 * single hinged leaf on a 1200 mm bay, a shelf spanning it, and bay widths
 * that do not add up to the carcass.
 */
export function badSpecExample(): DesignSpec {
  const base = wardrobeExample();
  const cabinets = [
    cabinet(
      "wrong",
      "Unbuildable",
      "tall",
      { x: 0, y: 0 },
      { width: 2400, height: 3000, depth: 400 },
      [
        {
          id: "wide",
          width: 1200,
          fitting: { kind: "shelves", count: 3, adjustable: true },
          door: "hinged",
          doorLeaves: 1,
        },
        {
          id: "hang",
          width: 900,
          fitting: { kind: "hanging", rails: 1, shelfAbove: true },
          door: "hinged",
          doorLeaves: 1,
        },
      ],
      100,
    ),
  ];

  const broken = straightRunFor(cabinets);

  return {
    ...base,
    title: "Deliberately unbuildable",
    cabinets: broken.bound,
    envelope: broken.envelope,
    runs: broken.runs,
  };
}

/**
 * The run layer for a hand-written example.
 *
 * Every example here is a single straight run, so the run is simply the
 * bounding box of what was authored and each cabinet is bound to it at the
 * offset its x already implies. Written once rather than three times: an
 * example whose cabinets are not bound looks correct and quietly stops being
 * parametric, which is the hardest kind of wrong to notice.
 */
function straightRunFor(cabinets: Cabinet[]) {
  const envelope = boundingBox(cabinets);
  return {
    furnitureType: undefined,
    layout: "straight" as const,
    cornerKind: "l_corner" as const,
    envelope,
    runs: [
      {
        id: "run-1",
        label: "Wall A",
        length: envelope.width,
        depth: envelope.depth,
        height: envelope.height,
      },
    ],
    bound: cabinets.map((cabinet) =>
      cabinet.kind === "island"
        ? cabinet
        : { ...cabinet, runId: "run-1", offset: Math.max(0, cabinet.position.x) },
    ),
  };
}
