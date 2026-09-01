import type { Board, EdgeBand, Hardware } from "./spec";

/**
 * What is actually sold in Addis.
 *
 * Berchuma AI picks from this list rather than inventing materials, for the
 * same reason it does not invent geometry: a design specifying "20 mm walnut
 * ply" is not a design if nobody within 400 km stocks it. Every entry here is
 * a product a joinery shop can buy this week.
 *
 * `fallbackRate` is what the cost engine uses when no `price_listings` row
 * matches the `priceKey`. Those numbers are indicative and dated — the cost
 * breakdown labels any line that used one, so an estimate never quietly
 * presents a stale constant as a live price.
 */

export const BOARDS: Board[] = [
  {
    id: "mdf-18-white",
    label: "18 mm MDF, white melamine",
    thickness: 18,
    sheet: { length: 2440, width: 1220 },
    grain: "none",
    priceKey: "MDF 18mm melamine",
    fallbackRate: 2450,
  },
  {
    id: "mdf-18-walnut",
    label: "18 mm MDF, walnut foil",
    thickness: 18,
    sheet: { length: 2440, width: 1220 },
    // A wood-grain foil runs along the sheet. Rotating a part to save
    // material makes the join obvious, so the nesting is not allowed to.
    grain: "length",
    priceKey: "MDF 18mm walnut",
    fallbackRate: 3100,
  },
  {
    id: "mdf-18-oak",
    label: "18 mm MDF, oak foil",
    thickness: 18,
    sheet: { length: 2440, width: 1220 },
    grain: "length",
    priceKey: "MDF 18mm oak",
    fallbackRate: 3050,
  },
  {
    id: "chipboard-18-white",
    label: "18 mm chipboard, white melamine",
    thickness: 18,
    sheet: { length: 2440, width: 1220 },
    grain: "none",
    priceKey: "Chipboard 18mm melamine",
    fallbackRate: 1850,
  },
  {
    id: "ply-18-birch",
    label: "18 mm birch plywood",
    thickness: 18,
    sheet: { length: 2440, width: 1220 },
    grain: "length",
    priceKey: "Plywood 18mm",
    fallbackRate: 3400,
  },
  // Worktops. Thicker, sold in narrower sheets, and priced separately —
  // a kitchen top is the single most expensive board on the job and quoting it
  // at carcass rates understates a kitchen by tens of thousands of birr.
  {
    id: "worktop-38-oak",
    label: "38 mm post-formed worktop, oak",
    thickness: 38,
    sheet: { length: 3000, width: 650 },
    grain: "length",
    priceKey: "Worktop 38mm oak",
    fallbackRate: 6800,
  },
  {
    id: "worktop-38-granite-look",
    label: "38 mm post-formed worktop, granite pattern",
    thickness: 38,
    sheet: { length: 3000, width: 650 },
    grain: "length",
    priceKey: "Worktop 38mm stone",
    fallbackRate: 7200,
  },
  {
    id: "worktop-20-quartz",
    label: "20 mm quartz worktop",
    thickness: 20,
    sheet: { length: 3000, width: 640 },
    grain: "none",
    priceKey: "Quartz worktop 20mm",
    fallbackRate: 24000,
  },
  {
    id: "hdf-4-white",
    label: "4 mm HDF back panel, white",
    thickness: 4,
    sheet: { length: 2440, width: 1220 },
    grain: "none",
    priceKey: "HDF 4mm",
    fallbackRate: 720,
  },
];

export const EDGE_BANDS: EdgeBand[] = [
  {
    id: "pvc-1-white",
    label: "1 mm PVC edge band, white",
    thickness: 1,
    priceKey: "Edge band PVC 1mm",
    fallbackRate: 18,
  },
  {
    id: "pvc-2-walnut",
    label: "2 mm PVC edge band, walnut",
    thickness: 2,
    priceKey: "Edge band PVC 2mm",
    fallbackRate: 26,
  },
  {
    id: "pvc-2-oak",
    label: "2 mm PVC edge band, oak",
    thickness: 2,
    priceKey: "Edge band PVC 2mm",
    fallbackRate: 26,
  },
];

export const HARDWARE: Hardware[] = [
  {
    id: "hinge-soft-close",
    label: "Soft-close concealed hinge, 110°",
    kind: "hinge",
    unit: "each",
    priceKey: "Concealed hinge soft close",
    fallbackRate: 145,
  },
  {
    id: "hinge-standard",
    label: "Concealed hinge, 110°",
    kind: "hinge",
    unit: "each",
    priceKey: "Concealed hinge",
    fallbackRate: 85,
  },
  {
    id: "handle-bar",
    label: "Brushed steel bar handle, 160 mm",
    kind: "handle",
    unit: "each",
    priceKey: "Cabinet handle bar",
    fallbackRate: 190,
  },
  {
    id: "handle-profile",
    label: "Aluminium profile handle (per door)",
    kind: "handle",
    unit: "each",
    priceKey: "Profile handle aluminium",
    fallbackRate: 320,
  },
  {
    id: "runner-soft-close",
    label: "Soft-close full-extension runner",
    kind: "drawer_runner",
    unit: "pair",
    priceKey: "Drawer runner soft close",
    fallbackRate: 620,
  },
  {
    id: "runner-basic",
    label: "Ball-bearing drawer runner",
    kind: "drawer_runner",
    unit: "pair",
    priceKey: "Drawer runner",
    fallbackRate: 280,
  },
  {
    id: "shelf-pin",
    label: "Shelf support pin",
    kind: "shelf_pin",
    unit: "each",
    priceKey: "Shelf pin",
    fallbackRate: 6,
  },
  {
    id: "hanging-rail",
    label: "Oval hanging rail with end supports",
    kind: "hanging_rail",
    unit: "metre",
    priceKey: "Wardrobe hanging rail",
    fallbackRate: 210,
  },
  {
    id: "sliding-gear",
    label: "Top-hung sliding door gear (per door)",
    kind: "sliding_gear",
    unit: "set",
    priceKey: "Sliding door gear",
    fallbackRate: 2400,
  },
  {
    id: "leg-adjustable",
    label: "Adjustable cabinet leg",
    kind: "leg",
    unit: "each",
    priceKey: "Cabinet leg adjustable",
    fallbackRate: 45,
  },
  {
    id: "led-strip",
    label: "LED strip, warm white, with driver",
    kind: "lift_mechanism",
    unit: "metre",
    priceKey: "LED strip warm white",
    fallbackRate: 260,
  },
];

export function findBoard(id: string): Board | undefined {
  return BOARDS.find((board) => board.id === id);
}

export function findEdgeBand(id: string): EdgeBand | undefined {
  return EDGE_BANDS.find((band) => band.id === id);
}

export function findHardware(id: string): Hardware | undefined {
  return HARDWARE.find((item) => item.id === id);
}

/** The set a wardrobe gets when the conversation has not specified otherwise. */
export function defaultHardware(): Hardware[] {
  return [
    findHardware("hinge-soft-close")!,
    findHardware("handle-bar")!,
    findHardware("runner-soft-close")!,
    findHardware("shelf-pin")!,
    findHardware("hanging-rail")!,
    findHardware("leg-adjustable")!,
  ];
}
