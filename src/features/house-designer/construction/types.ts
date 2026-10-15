import type { BoqSectionCode } from "@/lib/takeoff/boq";

import type { Shape, V3 } from "./geometry";

/**
 * The construction model: what the learner sees, inspects and, later, prices.
 *
 * It is derived from a `HouseProject` and never written back to one. The
 * project stays the editable drawing; this is a reading of it, plus the
 * construction layers a drawing does not draw (reinforcement, formwork,
 * services, finishes), each labelled for what it is.
 */

// ---------------------------------------------------------------------------
// Where a component sits in the education and in the bill
// ---------------------------------------------------------------------------

export const STAGE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;
export type StageId = (typeof STAGE_IDS)[number];

export const CATEGORY_IDS = [
  "site", "earthworks", "substructure", "frame", "stairs", "masonry", "roof",
  "electrical", "plumbing", "finishes", "openings", "joinery", "furniture", "external",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  site: "Site & setting out",
  earthworks: "Earthworks",
  substructure: "Foundations & ground floor",
  frame: "Concrete frame & slabs",
  stairs: "Stairs",
  masonry: "Masonry & blockwork",
  roof: "Roof",
  electrical: "Electrical",
  plumbing: "Plumbing & drainage",
  finishes: "Plaster, ceilings & floors",
  openings: "Doors & windows",
  joinery: "Kitchen & built-in joinery",
  furniture: "Furniture & fittings",
  external: "External works",
};

/**
 * What a component is made of in the way a learner peels the building apart:
 * isolate reinforcement, hide the paint, show only the waterproofing.
 */
export const LAYER_IDS = [
  "marker", "soil", "fill", "blinding", "concrete", "reinforcement", "formwork", "props",
  "waterproofing", "insulation", "screed", "masonry", "plaster", "paint", "tile", "ceiling",
  "roofing", "electrical", "plumbing", "frame", "glass", "joinery", "furniture", "external", "temporary",
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export const LAYER_LABELS: Record<LayerId, string> = {
  marker: "Setting-out & markers", soil: "Soil & excavation", fill: "Fill & sub-base", blinding: "Blinding concrete",
  concrete: "Concrete", reinforcement: "Reinforcement (schematic)", formwork: "Formwork", props: "Props & temporary supports",
  waterproofing: "Waterproofing & DPM", insulation: "Insulation", screed: "Screed", masonry: "Blocks & mortar",
  plaster: "Plaster", paint: "Paint & decoration", tile: "Tiles & finishes", ceiling: "Ceilings",
  roofing: "Roof covering", electrical: "Electrical services", plumbing: "Plumbing services", frame: "Frames & hardware",
  glass: "Glass", joinery: "Joinery panels", furniture: "Furniture", external: "External works", temporary: "Temporary works",
};

// ---------------------------------------------------------------------------
// Provenance: how much a number can be trusted
// ---------------------------------------------------------------------------

/**
 * - measured: taken from the project's own geometry (a wall length, a column size).
 * - calculated: derived from stated dimensions by a documented formula.
 * - assumed: a stated example assumption (a bar diameter, a cover, a block size).
 * - missing: not enough information to give a number.
 * - review: calculated, but a person or a professional must confirm it.
 */
export const PROVENANCE = ["measured", "calculated", "assumed", "missing", "review"] as const;
export type Provenance = (typeof PROVENANCE)[number];

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  measured: "Measured — from project geometry",
  calculated: "Calculated — documented formula",
  assumed: "Assumed — example assumption",
  missing: "Missing data",
  review: "Needs review",
};

export type DimensionKey = "length" | "width" | "height" | "thickness" | "area" | "volume";
export type Dimension = { value: number | null; unit: "mm" | "m²" | "m³"; status: Provenance; note?: string };

export type GeometrySource = "project" | "schematic";

// ---------------------------------------------------------------------------
// Quantities (the BOQ data foundation)
// ---------------------------------------------------------------------------

export const QUANTITY_UNITS = ["m", "m²", "m³", "kg", "piece", "set", "lump sum"] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

/** Prices are fields, not data: nothing in this model invents a price. */
export type CostFields = {
  unitMaterial: number | null;
  unitLabour: number | null;
  unitEquipment: number | null;
  currency: string | null;
  priceSource: string | null;
  priceDate: string | null;
};

export const NO_COST: CostFields = { unitMaterial: null, unitLabour: null, unitEquipment: null, currency: null, priceSource: null, priceDate: null };

/** Waste or ordering allowance, kept apart from the net quantity. */
export type Allowance = { rule: string; percent: number | null };

export type QuantityItem = {
  id: string;
  componentId: string;
  /** Components that share a work item are summed into one BOQ line. */
  workItem: string;
  description: string;
  section: BoqSectionCode;
  unit: QuantityUnit;
  /** Net quantity. Never includes waste, tax or contingency. */
  value: number | null;
  /** The sum as written, with its numbers. */
  formula: string;
  inputs: Record<string, number | string>;
  status: Provenance;
  sourceGeometry: string;
  allowance: Allowance | null;
  cost: CostFields;
  storeyId: string | null;
  room: string | null;
  materialSpec: string;
  assumptions: string[];
  exclusions: string[];
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export type ComponentRecord = {
  /** Stable across rebuilds of the same project and options. */
  id: string;
  name: string;
  /** Key into the knowledge catalogue. */
  kind: string;
  category: CategoryId;
  subcategory: string;
  stage: StageId;
  /** Visible from `stage` until this stage (inclusive); forever when absent. Formwork, props, spoil. */
  removedAfter?: StageId;
  storeyId: string | null;
  storeyName: string | null;
  /** −1 for everything below the ground floor, 0 for the ground floor, and so on up. */
  storeyIndex: number;
  room: string | null;
  grid: string | null;
  layer: LayerId;
  materialId: string;
  shapes: Shape[];
  /** What the repeated shapes are, when there are many (blocks, treads, bars). */
  repeated?: { noun: string; perInstanceMassKg?: number };
  /** A name for each shape, parallel to `shapes`, when each is a named part (a cabinet panel, a chair). */
  instanceNames?: string[];
  dims: Partial<Record<DimensionKey, Dimension>>;
  geometrySource: GeometrySource;
  /** The project object this was read from, when it was. */
  sourceRef: string | null;
  parentId: string | null;
  connectedIds: string[];
  /** Order of installation within its stage. */
  sequence: number;
  /** Which way, and how far in layers, it moves in an exploded view. */
  explode: { layerIndex: number; dir: V3 };
  /** One of several alternatives (a roof type, a floor finish); only the chosen one is shown. */
  variant?: { group: string; value: string };
  /** Concrete placement zone, 1-based, for the placement sequence. */
  pour?: number;
  /** A label for the 3D view, with where to anchor it. */
  label?: { text: string; anchor: V3 };
  /** Buried in the building once it is finished (conduit, pipes, hangers); the finished-building view leaves it out. */
  concealed?: boolean;
  /** Loose equipment rather than the building works. */
  loose?: boolean;
  note?: string;
  quantities: QuantityItem[];
};

export type ComponentKnowledge = {
  title: string;
  /** What it is and what it does. */
  summary: string;
  materials: string;
  /** How it is made or put in place. */
  installation: string[];
  /** What it is joined to, in words. */
  connections: string;
  maintenance: string[];
  qualityChecks: string[];
  commonDefects: string[];
  safety: string[];
  quantityMethod: string;
};

// ---------------------------------------------------------------------------
// Options, rules and the model
// ---------------------------------------------------------------------------

export type RoofType = "flat" | "pitched";
export type FloorFinish = "ceramic" | "porcelain" | "stone";
export type BlockType = "hollow" | "solid" | "brick";
export type MepView = "concealed" | "visible" | "finished";

export type ModelOptions = {
  roofType: RoofType;
  floorFinish: FloorFinish;
  blockType: BlockType;
  mepView: MepView;
};

export const DEFAULT_OPTIONS: ModelOptions = { roofType: "flat", floorFinish: "porcelain", blockType: "hollow", mepView: "finished" };

/** The estimating rules: how a quantity is read off the geometry. Stated, editable, never hidden. */
export type EstimatingRules = {
  /** Openings deducted from wall area: all, none, or only those larger than the threshold. */
  openingDeduction: "all" | "none" | "over-threshold";
  openingThresholdM2: number;
  /** Mortar joint, mm, added to the block face in the block count. */
  jointMm: number;
  /** Reinforcement is never taken from the schematic bars. */
  steelFromSchematic: false;
  /** Allowances, percent, kept apart from net quantities. */
  allowances: { concrete: number; blocks: number; tiles: number; paint: number; plaster: number; pipes: number; conduit: number; boards: number };
};

export const DEFAULT_RULES: EstimatingRules = {
  openingDeduction: "over-threshold",
  openingThresholdM2: 0.5,
  jointMm: 10,
  steelFromSchematic: false,
  allowances: { concrete: 5, blocks: 5, tiles: 10, paint: 5, plaster: 5, pipes: 10, conduit: 10, boards: 10 },
};

export type StoreyInfo = { id: string; name: string; index: number; elevation: number; floorToFloor: number; slabThickness: number };

export type ConstructionModel = {
  projectId: string;
  title: string;
  /** Plain statement of what this is and is not. */
  disclaimer: string;
  options: ModelOptions;
  rules: EstimatingRules;
  storeys: StoreyInfo[];
  components: ComponentRecord[];
  /** Overall model bounds, mm. */
  bounds: { min: V3; max: V3 };
  /** Things the model could not do, in words: no stairs, no roof, no rooms. */
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export type StageDef = {
  id: StageId;
  key: string;
  title: string;
  short: string;
  summary: string;
  learn: string[];
  sequence: string[];
  qualityChecks: string[];
  safety: string[];
  /** What a quantity surveyor takes off at this stage, and what is still unknown. */
  quantityNote: string;
  /** Which frame view applies, when the stage has one. */
  frameViews?: boolean;
};

// ---------------------------------------------------------------------------
// What the learner has switched on
// ---------------------------------------------------------------------------

export type FrameView = "complete" | "reinforcement" | "formwork" | "placement" | "completed";
export type CutawayMode = "off" | "level" | "section-x" | "section-y";
export type AppMode = "learn" | "inspect" | "quantities" | "estimate";

export type ViewState = {
  mode: AppMode;
  /** The stage being taught; components of later stages are not built yet. */
  stage: StageId;
  /** Only this stage's components, rather than everything built so far. */
  onlyThisStage: boolean;
  /** Show later stages as faint ghosts. */
  ghostFuture: boolean;
  frameView: FrameView;
  /** How many placement zones have been poured, for the placement sequence. */
  pourStep: number;
  storeysOff: string[];
  categoriesOff: CategoryId[];
  layersOff: LayerId[];
  hiddenIds: string[];
  isolateId: string | null;
  /** The selected component and, for a repeated one, the instance. */
  selectedId: string | null;
  selectedInstance: number | null;
  explode: { amount: number; floors: boolean; categories: boolean; layers: boolean };
  cutaway: { mode: CutawayMode; position: number };
  /** The rest of the building as a transparent context around what is isolated. */
  transparentContext: boolean;
  options: ModelOptions;
};

export const DEFAULT_VIEW: ViewState = {
  mode: "learn",
  stage: 1,
  onlyThisStage: false,
  ghostFuture: false,
  frameView: "completed",
  pourStep: 99,
  storeysOff: [],
  categoriesOff: [],
  layersOff: [],
  hiddenIds: [],
  isolateId: null,
  selectedId: null,
  selectedInstance: null,
  explode: { amount: 0, floors: true, categories: true, layers: true },
  cutaway: { mode: "off", position: 0.5 },
  transparentContext: true,
  options: DEFAULT_OPTIONS,
};
