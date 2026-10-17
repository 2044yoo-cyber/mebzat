import { QUANTITY_UNITS, type QuantityUnit } from "./types";

/**
 * The price book: a unit rate, in Ethiopian birr, for each line of work in the bill, in two parts, the material and the labour.
 *
 * ## What is in it, and what is not
 *
 * The rates that come with the book are examples. They are the author's assumptions of the kind of figure a mid-range house in Addis Ababa might be priced at, set
 * down so that an estimate can be seen working: they are not quotations, not a survey of the market and not from Medosha's Price Exchange, and every one of them
 * is marked `assumed` wherever it shows. A rate somebody types is marked `entered`; one they say a supplier has quoted is `quoted`. A rate with no figure is
 * missing, and the estimate says so rather than count it as nothing.
 *
 * ## One price for one piece of work
 *
 * Some work is measured twice in the bill: the blockwork is a wall area and also a number of blocks and a volume of mortar, a floor of tiles is an area and a
 * number of tiles. Pricing both would charge for the same wall twice, so the area carries the price and the other lines are `includedIn` it: they stay in the bill
 * (a buyer needs the number of blocks) and they have no price of their own.
 *
 * Material is priced on the quantity plus its allowance for waste, because waste is bought; labour is priced on the net quantity, because that is what is built.
 */

export const CURRENCY = "ETB";

/** How a rate came to be: an example that came with the book, a figure typed in, or one a supplier has quoted. */
export type RateStatus = "assumed" | "entered" | "quoted";
export const RATE_STATUSES: readonly RateStatus[] = ["assumed", "entered", "quoted"];

export const RATE_STATUS_LABELS: Record<RateStatus, string> = {
  assumed: "Example rate: an assumption, not a quotation",
  entered: "Entered by you",
  quoted: "Quoted by a supplier or contractor",
};

export type Rate = {
  /** Birr for one unit of the work item; null when there is no price. */
  value: number | null;
  status: RateStatus;
  /** Where the figure comes from, in words. */
  source: string;
  /** The day it was set, ISO; null for the examples, which have no date. */
  date: string | null;
};

export type PriceEntry = {
  workItem: string;
  /** The unit of the bill line this prices: an entry in another unit does not price it. */
  unit: QuantityUnit;
  material: Rate;
  labour: Rate;
  /** The work item whose rate covers this one, so that this one has no price of its own. */
  includedIn: string | null;
  note: string;
};

export type PriceBook = {
  version: 1;
  currency: typeof CURRENCY;
  name: string;
  entries: Record<string, PriceEntry>;
};

export const EXAMPLE_SOURCE = "Example rate (an assumption)";

const example = (value: number | null): Rate => ({ value, status: "assumed", source: EXAMPLE_SOURCE, date: null });

/** Material and labour, birr per unit, for each kind of work: [work item, unit, material, labour]. */
const RATES: [string, QuantityUnit, number, number][] = [
  // A. Preliminaries
  ["prelim.site-area", "m²", 0, 18],
  ["prelim.fence", "m", 450, 120],
  ["handover.commissioning", "lump sum", 0, 30000],
  ["handover.snagging", "lump sum", 0, 25000],
  // B. Earthworks
  ["earth.strip", "m³", 0, 220],
  ["earth.pit", "m³", 0, 380],
  ["earth.trench", "m³", 0, 420],
  ["earth.backfill", "m³", 0, 260],
  ["earth.fill", "m³", 1100, 260],
  ["earth.hardcore", "m³", 2200, 420],
  ["earth.sub-base", "m³", 2400, 380],
  ["earth.sand-blinding", "m³", 2800, 300],
  ["earth.drainage-layer", "m³", 3000, 380],
  // C. Concrete: material is cement, sand and aggregate; labour is batching, placing, compacting and curing
  ["concrete.blinding", "m³", 9500, 1400],
  ["concrete.footing", "m³", 14500, 1900],
  ["concrete.combined-footing", "m³", 14500, 1900],
  ["concrete.pedestal", "m³", 14500, 3000],
  ["concrete.ground-beam", "m³", 14500, 2800],
  ["concrete.ground-slab", "m³", 14500, 2200],
  ["concrete.column", "m³", 14500, 3200],
  ["concrete.beam", "m³", 14500, 3000],
  ["concrete.slab", "m³", 14500, 2400],
  ["concrete.balcony", "m³", 14500, 3000],
  ["concrete.stair", "m³", 14500, 3800],
  ["concrete.lintel", "m³", 14500, 3400],
  ["concrete.sill", "m³", 14500, 3400],
  ["concrete.steps", "m³", 14500, 2800],
  ["concrete.apron", "m³", 14500, 2400],
  ["plumbing.beam-sleeve", "piece", 110, 40],
  // D. Reinforcement: deformed bar by the kilogram; labour is cutting, bending and fixing
  ["steel.footing-rebar", "kg", 105, 18],
  ["steel.starter-bars", "kg", 105, 22],
  ["steel.column-bars", "kg", 105, 22],
  ["steel.column-stirrups", "kg", 105, 26],
  ["steel.beam-bars", "kg", 105, 20],
  ["steel.beam-stirrups", "kg", 105, 26],
  ["steel.beam-column-joint", "kg", 105, 26],
  ["steel.slab-bars-bottom", "kg", 105, 16],
  ["steel.slab-bars-top", "kg", 105, 18],
  ["steel.slab-edge-bars", "kg", 105, 22],
  ["steel.floor-mesh", "kg", 105, 14],
  ["steel.lintel", "kg", 105, 24],
  ["steel.stair-rebar", "kg", 105, 26],
  // E. Formwork by the square metre of concrete it touches: timber and ply used a few times over
  ["formwork.footing", "m²", 260, 380],
  ["formwork.pedestal", "m²", 280, 400],
  ["formwork.ground-beam", "m²", 260, 380],
  ["formwork.column", "m²", 280, 400],
  ["formwork.beam", "m²", 280, 400],
  ["formwork.slab", "m²", 260, 360],
  ["formwork.balcony", "m²", 280, 400],
  ["formwork.stair", "m²", 320, 460],
  ["formwork.lintel", "m²", 280, 400],
  // F. Masonry: a wall by its area, blocks and mortar in the rate
  ["masonry.wall-area", "m²", 880, 280],
  ["masonry.gable", "m²", 880, 320],
  ["masonry.parapet", "m²", 880, 320],
  ["masonry.foundation-wall", "m³", 7500, 2200],
  ["masonry.ties", "piece", 25, 15],
  ["masonry.chase", "m", 0, 120],
  ["electrical.sleeve", "piece", 80, 30],
  // G. Insulation and waterproofing
  ["insulation.floor", "m²", 300, 60],
  ["insulation.roof", "m²", 420, 80],
  ["insulation.ceiling", "m²", 220, 50],
  ["waterproofing.dpm", "m²", 120, 40],
  ["waterproofing.dpc", "m", 90, 30],
  ["waterproofing.foundation", "m²", 150, 50],
  ["waterproofing.protection-board", "m²", 180, 40],
  ["waterproofing.termite", "m²", 90, 20],
  ["waterproofing.wet-area", "m²", 450, 150],
  ["waterproofing.balcony", "m²", 520, 180],
  ["waterproofing.roof-vapour", "m²", 160, 50],
  // H. Roof
  ["waterproofing.roof-membrane", "m²", 650, 220],
  ["waterproofing.roof-upstand", "m²", 650, 260],
  ["roof.protection", "m²", 150, 50],
  ["roof.covering", "m²", 750, 200],
  ["roof.underlay", "m²", 120, 30],
  ["roof.batten", "m", 60, 20],
  ["roof.truss", "piece", 9000, 2200],
  ["roof.wall-plate", "m", 180, 50],
  ["roof.ridge", "m", 650, 150],
  ["roof.fascia", "m", 350, 90],
  ["roof.barge", "m", 350, 90],
  ["roof.gutter", "m", 520, 150],
  ["roof.coping", "m", 600, 180],
  ["roof.outlet", "piece", 1100, 300],
  // I. Openings and metalwork
  ["openings.door-frame", "piece", 3500, 700],
  ["openings.door-leaf", "piece", 7500, 900],
  ["openings.door-hardware", "set", 2200, 400],
  ["openings.window-frame", "piece", 6500, 900],
  ["openings.window-sash", "piece", 3200, 500],
  ["openings.window-hardware", "set", 1200, 300],
  ["openings.glass", "m²", 1800, 300],
  ["openings.seal", "m", 60, 20],
  ["openings.sill", "m", 750, 200],
  ["metalwork.balustrade-post", "piece", 900, 250],
  ["metalwork.handrail", "m", 1400, 300],
  // J. Plaster
  ["plaster.bonding", "m²", 40, 20],
  ["plaster.base", "m²", 160, 110],
  ["plaster.mid", "m²", 120, 90],
  ["plaster.final", "m²", 100, 90],
  ["plaster.skim", "m²", 70, 70],
  ["plaster.external-base", "m²", 190, 130],
  ["plaster.external-final", "m²", 140, 110],
  ["plaster.mesh", "m", 45, 20],
  ["plumbing.duct", "m²", 650, 250],
  ["plumbing.shaft-cover", "m²", 900, 250],
  // K. Floors
  ["screed.floor", "m³", 11500, 3500],
  ["screed.ground", "m³", 11500, 3500],
  ["screed.balcony", "m³", 11500, 4200],
  ["screed.roof", "m²", 420, 150],
  ["flooring.tile-area", "m²", 1100, 280],
  ["flooring.adhesive", "m²", 120, 0],
  ["flooring.grout", "m²", 40, 0],
  ["flooring.balcony", "m²", 1000, 300],
  ["flooring.balcony-adhesive", "m²", 120, 0],
  ["flooring.laminate", "m²", 950, 200],
  ["flooring.skirting", "m", 220, 60],
  ["flooring.stair", "m²", 1300, 450],
  ["flooring.threshold", "piece", 450, 120],
  // L. Wall tiles
  ["walltile.area", "m²", 950, 320],
  ["walltile.adhesive", "m²", 120, 0],
  // M. Paint
  ["paint.primer", "m²", 35, 20],
  ["paint.walls", "m²", 95, 55],
  ["paint.wet-walls", "m²", 120, 60],
  ["paint.ceilings", "m²", 90, 60],
  ["paint.external", "m²", 130, 70],
  ["paint.metal", "m²", 110, 80],
  ["paint.timber-external", "m²", 120, 80],
  ["paint.wood", "m²", 150, 90],
  // N. Ceilings: a suspended ceiling by its area, boards, channels, hangers and jointing in the rate
  ["ceiling.area", "m²", 700, 260],
  // O. Plumbing
  ["plumbing.pipe.cold-20", "m", 120, 60],
  ["plumbing.pipe.cold-25", "m", 150, 70],
  ["plumbing.pipe.hot-20", "m", 160, 70],
  ["plumbing.pipe.waste-50", "m", 170, 70],
  ["plumbing.pipe.soil-110", "m", 380, 120],
  ["plumbing.pipe.vent-50", "m", 150, 60],
  ["plumbing.pipe.vent-110", "m", 380, 110],
  ["plumbing.pipe.rain-90", "m", 300, 100],
  ["plumbing.pipe.storm-100", "m", 340, 120],
  ["plumbing.pipe.drain-110", "m", 380, 150],
  ["plumbing.clip", "piece", 25, 10],
  ["plumbing.trap", "piece", 380, 120],
  ["plumbing.valve", "piece", 650, 150],
  ["plumbing.floor-drain", "piece", 750, 180],
  ["plumbing.cleanout", "piece", 650, 200],
  ["plumbing.chamber", "piece", 9500, 4500],
  ["plumbing.boot", "piece", 450, 150],
  ["plumbing.access-hatch", "piece", 1200, 300],
  ["plumbing.meter", "set", 6500, 1200],
  ["plumbing.pump", "piece", 28000, 3500],
  ["plumbing.tank", "piece", 18000, 3000],
  ["plumbing.soakaway", "piece", 22000, 12000],
  // P. Sanitary fittings
  ["sanitary.wc", "piece", 7500, 1500],
  ["sanitary.basin", "piece", 4500, 900],
  ["sanitary.shower", "piece", 9000, 1800],
  ["sanitary.heater", "piece", 14000, 1500],
  // Q. Electrical
  ["electrical.board", "piece", 8500, 2500],
  ["electrical.meter", "piece", 3200, 1000],
  ["electrical.box", "piece", 90, 60],
  ["electrical.cable", "m", 55, 15],
  ["electrical.conduit", "m", 70, 35],
  ["electrical.earth", "set", 3500, 1200],
  ["electrical.earth-conductor", "m", 120, 30],
  ["electrical.light", "piece", 1200, 300],
  ["electrical.wall-light", "piece", 1500, 350],
  ["electrical.switch", "piece", 350, 160],
  ["electrical.socket", "piece", 450, 180],
  ["electrical.data", "piece", 650, 250],
  ["electrical.fan", "piece", 1800, 400],
  ["electrical.smoke-detector", "piece", 1100, 250],
  ["electrical.heat-detector", "piece", 950, 250],
  ["external.service-route", "m", 400, 250],
  // T, U. Joinery: boards by the square metre, edging by the metre, fittings by the piece
  ["joinery.panel.mdf-18-white", "m²", 1450, 450],
  ["joinery.panel.mdf-18-black", "m²", 1550, 450],
  ["joinery.panel.hdf-4-white", "m²", 480, 150],
  ["joinery.panel.hdf-6-white", "m²", 560, 150],
  ["joinery.panel.worktop-38-granite-look", "m²", 3800, 900],
  ["joinery.edge-band.pvc-1-white", "m", 18, 6],
  ["joinery.edge-band.pvc-2-black", "m", 20, 6],
  ["joinery.hardware.handle-bar", "piece", 380, 60],
  ["joinery.hardware.hinge-soft-close", "piece", 180, 30],
  ["joinery.hardware.led-strip", "m", 650, 120],
  ["joinery.hardware.leg-adjustable", "piece", 60, 10],
  ["joinery.hardware.runner-soft-close", "piece", 750, 120],
  ["joinery.hardware.shelf-pin", "piece", 4, 0],
  ["joinery.hardware.connector-confirmat", "piece", 6, 0],
  ["joinery.hardware.hanging-rail", "m", 380, 80],
  ["kitchen.sink", "piece", 12000, 2000],
  ["kitchen.cooktop", "piece", 14000, 1200],
  // V. Furniture fixed to the building
  ["furniture.mirror", "piece", 3500, 400],
  ["furniture.towel-rail", "piece", 1800, 300],
  // W. External works
  ["external.paving", "m²", 1600, 450],
  ["external.drain", "m", 1800, 700],
  ["external.gate", "piece", 45000, 10000],
  ["external.landscaping", "m²", 350, 120],
  ["external.railing", "m", 4500, 1400],
  ["external.railing-glass", "m²", 5500, 1200],
  ["external.step-finish", "m²", 1200, 350],
  ["external.boundary-wall", "m", 2300, 700],
];

/** Lines that are the count or the part of work priced elsewhere: [work item, unit, the work item whose rate covers it, why]. */
const INCLUDED: [string, QuantityUnit, string, string][] = [
  ["masonry.blocks", "piece", "masonry.wall-area", "The blocks are in the rate for the wall by its area."],
  ["masonry.mortar", "m³", "masonry.wall-area", "The mortar is in the rate for the wall by its area."],
  ["external.boundary-blocks", "piece", "external.boundary-wall", "The blocks are in the rate for the boundary wall by its length."],
  ["openings.door-opening", "piece", "masonry.wall-area", "The opening is formed in the wall; the wall area is already net of it."],
  ["openings.window-opening", "piece", "masonry.wall-area", "The opening is formed in the wall; the wall area is already net of it."],
  ["openings.door-leaf-area", "m²", "openings.door-leaf", "The area of the leaf is for ordering and painting; the leaf is priced by the piece."],
  ["flooring.tile-count", "piece", "flooring.tile-area", "The tiles are in the rate for the floor by its area."],
  ["walltile.count", "piece", "walltile.area", "The tiles are in the rate for the wall tiling by its area."],
  ["waterproofing.dpm-turnup", "m", "waterproofing.dpm", "The turn-up is in the rate for the membrane."],
  ["steel.spacers", "piece", "steel.footing-rebar", "Cover spacers are in the rate for the steel they support."],
  ["steel.chairs", "piece", "steel.slab-bars-top", "Chairs are in the rate for the steel they support."],
  ["ceiling.board", "piece", "ceiling.area", "The boards are in the rate for the ceiling by its area."],
  ["ceiling.channel", "m", "ceiling.area", "The channels are in the rate for the ceiling by its area."],
  ["ceiling.hanger", "piece", "ceiling.area", "The hangers are in the rate for the ceiling by its area."],
  ["ceiling.joint", "m", "ceiling.area", "The jointing is in the rate for the ceiling by its area."],
  ["ceiling.perimeter", "m", "ceiling.area", "The perimeter angle is in the rate for the ceiling by its area."],
  ["ceiling.cutout", "piece", "ceiling.area", "The cut-outs are in the rate for the ceiling by its area."],
  ["ceiling.access", "piece", "ceiling.area", "The access panels are in the rate for the ceiling by its area."],
];

const NONE: Rate = { value: null, status: "assumed", source: "Not applicable: priced with another line", date: null };

/** A new price book with the example rates. */
export function defaultPriceBook(): PriceBook {
  const entries: Record<string, PriceEntry> = {};
  for (const [workItem, unit, material, labour] of RATES) entries[workItem] = { workItem, unit, material: example(material), labour: example(labour), includedIn: null, note: "" };
  for (const [workItem, unit, includedIn, note] of INCLUDED) entries[workItem] = { workItem, unit, material: { ...NONE }, labour: { ...NONE }, includedIn, note };
  return { version: 1, currency: CURRENCY, name: "Example rates (ETB)", entries };
}

export type RateKind = "material" | "labour";

/** The day, ISO, from a clock. */
export const today = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/** A rate set to a figure, or cleared: a new book. A figure typed in is `entered` unless it is given as quoted. */
export function setRate(book: PriceBook, workItem: string, kind: RateKind, value: number | null, how: { status?: RateStatus; source?: string; date?: string | null } = {}): PriceBook {
  const entry = book.entries[workItem];
  if (!entry || entry.includedIn) return book;
  const clean = value === null || !Number.isFinite(value) || value < 0 ? null : Math.round(value * 100) / 100;
  const status = how.status ?? "entered";
  const rate: Rate = { value: clean, status, source: how.source ?? (status === "quoted" ? "Quotation" : "Entered by you"), date: how.date === undefined ? today() : how.date };
  return { ...book, entries: { ...book.entries, [workItem]: { ...entry, [kind]: rate } } };
}

/** A rate put back to the example that came with the book. */
export function resetRate(book: PriceBook, workItem: string): PriceBook {
  const original = defaultPriceBook().entries[workItem];
  if (!original) return book;
  return { ...book, entries: { ...book.entries, [workItem]: original } };
}

/** The source and date of a rate changed, its figure kept. */
export function noteRate(book: PriceBook, workItem: string, kind: RateKind, how: { status?: RateStatus; source?: string; date?: string | null }): PriceBook {
  const entry = book.entries[workItem];
  if (!entry || entry.includedIn) return book;
  const rate = entry[kind];
  return { ...book, entries: { ...book.entries, [workItem]: { ...entry, [kind]: { ...rate, status: how.status ?? rate.status, source: how.source ?? rate.source, date: how.date === undefined ? rate.date : how.date } } } };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function readRate(raw: unknown, fallback: Rate): Rate {
  if (!isRecord(raw)) return fallback;
  const value = raw.value === null ? null : typeof raw.value === "number" && Number.isFinite(raw.value) && raw.value >= 0 ? Math.round(raw.value * 100) / 100 : fallback.value;
  const status = RATE_STATUSES.includes(raw.status as RateStatus) ? (raw.status as RateStatus) : fallback.status;
  return { value, status, source: typeof raw.source === "string" ? raw.source.slice(0, 120) : fallback.source, date: typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : raw.date === null ? null : fallback.date };
}

/**
 * A price book read back from something saved. Whatever is wrong with it is repaired from the example book rather than refused: an entry that is missing is the
 * example, a figure that is not a number is the example, and an entry for work the book has not heard of is kept if it is well formed.
 */
export function readPriceBook(raw: unknown): PriceBook {
  const base = defaultPriceBook();
  if (!isRecord(raw) || !isRecord(raw.entries)) return base;
  const entries: Record<string, PriceEntry> = { ...base.entries };
  for (const [workItem, value] of Object.entries(raw.entries)) {
    if (!isRecord(value) || typeof workItem !== "string") continue;
    const known = base.entries[workItem];
    const unit = (QUANTITY_UNITS as readonly string[]).includes(value.unit as string) ? (value.unit as QuantityUnit) : known?.unit;
    if (!unit) continue;
    // What the book says about work it already knows is its own: the unit and what is included in what do not change.
    const includedIn = known ? known.includedIn : typeof value.includedIn === "string" ? value.includedIn : null;
    entries[workItem] = {
      workItem, unit: known ? known.unit : unit, includedIn,
      material: includedIn ? { ...NONE } : readRate(value.material, known?.material ?? example(null)),
      labour: includedIn ? { ...NONE } : readRate(value.labour, known?.labour ?? example(null)),
      note: typeof value.note === "string" ? value.note.slice(0, 200) : known?.note ?? "",
    };
  }
  return { version: 1, currency: CURRENCY, name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : base.name, entries };
}

/** The entries of the book whose rates are not the examples that came with it. */
export function changedEntries(book: PriceBook): PriceEntry[] {
  const base = defaultPriceBook().entries;
  return Object.values(book.entries).filter((e) => JSON.stringify(e) !== JSON.stringify(base[e.workItem]));
}
