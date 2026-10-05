import { addNiche, addSideDisplay, addTopCabinet, resizeCabinet } from "./operations";
import { moduleInterior, modulesOf, type CabinetModule } from "./transport-modules";
import { startingDesign, wardrobeShapeDesign } from "./starting-designs";
import { edgeBandForBoard } from "./wardrobe-materials";
import { BOARDS, findBoard } from "../types/catalogue";
import { LIMITS, validateSpec, type Bay, type Cabinet, type DesignKind, type DesignSpec } from "../types/spec";
import type { KitchenSetup } from "../types/kitchen";

/**
 * Cabinet templates: starting designs that adapt to the space they are given.
 *
 * A template is not a fixed drawing. "3-door wardrobe" is a recipe — a
 * hanging bay, a mixed bay, doors of a practical width — and the recipe is
 * laid out in whatever width, height and depth somebody measured. Where the
 * space cannot hold the recipe as named (three doors across 2400 mm would
 * each be 800 mm wide, too wide to hang) the template keeps its character
 * and changes its count, and says so in the design's assumptions.
 *
 * Every template is built from the studio's own generators and operations,
 * then validated, so what comes out is an ordinary design: the same parts,
 * cut list and price as anything else, and everything in it editable.
 */

export type CabinetType = "wardrobe" | "kitchen" | "vanity" | "tv_unit" | "shoe" | "storage" | "office" | "custom";
export type Space = { width: number; height: number; depth: number };
export type WardrobeLayout = "straight" | "l_shaped" | "u_shaped";
export type TemplateOptions = { layout?: WardrobeLayout; walls?: number[] };

export type CabinetTemplate = {
  id: string;
  type: CabinetType;
  label: string;
  blurb: string;
  /** For wardrobes: which layouts it can be laid out in. */
  layouts?: WardrobeLayout[];
  /** Builds the design for a space. Absent for a kitchen, which is laid out by its own setup. */
  build?: (space: Space, options: TemplateOptions) => DesignSpec;
  /** A kitchen template is a preset for the kitchen setup. */
  kitchen?: Partial<KitchenSetup>;
};

export const CABINET_TYPES: { type: CabinetType; label: string; hint: string; kind: DesignKind; space: Space }[] = [
  { type: "wardrobe", label: "Wardrobe", hint: "Hanging, shelves, drawers", kind: "wardrobe", space: { width: 2400, height: 2400, depth: 600 } },
  { type: "kitchen", label: "Kitchen", hint: "Base, wall and tall units", kind: "kitchen", space: { width: 3600, height: 2700, depth: 600 } },
  { type: "vanity", label: "Vanity / Bathroom", hint: "Basin cabinet, mirror cabinet", kind: "vanity", space: { width: 1200, height: 2000, depth: 500 } },
  { type: "tv_unit", label: "TV Unit", hint: "Low unit, wall shelf", kind: "tv_unit", space: { width: 1800, height: 1800, depth: 400 } },
  { type: "shoe", label: "Shoe Cabinet", hint: "Shelves behind doors", kind: "custom", space: { width: 900, height: 2000, depth: 350 } },
  { type: "storage", label: "Storage Cabinet", hint: "Cupboards and open shelving", kind: "shelving", space: { width: 1200, height: 2100, depth: 450 } },
  { type: "office", label: "Office Cabinet", hint: "Cupboards, filing, open shelves", kind: "office_storage", space: { width: 2000, height: 1800, depth: 450 } },
  { type: "custom", label: "Custom Cabinet", hint: "A cabinet of your own, or sketch it", kind: "custom", space: { width: 1200, height: 900, depth: 500 } },
];

let counter = 0;
const id = (prefix: string) => `${prefix}-tpl-${(counter += 1)}`;
const T = 18;

function bay(width: number, fitting: Bay["fitting"], door: Bay["door"], leaves: number): Bay {
  return { id: id("bay"), width, fitting, door, doorLeaves: Math.min(2, Math.max(1, leaves)) as 1 | 2 };
}

function note(spec: DesignSpec, line: string): DesignSpec {
  return { ...spec, meta: { ...spec.meta, assumptions: [...spec.meta.assumptions, line] } };
}

/** The main floor-standing cabinet of a design: the widest one that is not hung or stacked. */
function main(spec: DesignSpec): Cabinet {
  return [...spec.cabinets].filter((cabinet) => !cabinet.stackedOn && cabinet.kind !== "wall").sort((a, b) => b.size.width - a.size.width)[0] ?? spec.cabinets[0]!;
}

/** Floor cabinets to the space's depth, and the main one to its height when the template fills it. */
function fit(spec: DesignSpec, space: Space, fillHeight: boolean): DesignSpec {
  let next = spec;
  for (const cabinet of spec.cabinets) {
    if (cabinet.kind === "wall" || cabinet.stackedOn) continue;
    next = resizeCabinet(next, cabinet.id, { depth: Math.min(space.depth, 900) });
  }
  if (fillHeight) next = resizeCabinet(next, main(next).id, { height: space.height });
  return next;
}

// ---------------------------------------------------------------------------
// Wardrobes
// ---------------------------------------------------------------------------

const hanging: Bay["fitting"] = { kind: "hanging", rails: 1, shelfAbove: true };
const shelves: Bay["fitting"] = { kind: "shelves", count: 5, adjustable: true };
const mixed = (internal = false): Bay["fitting"] => ({
  kind: "stack",
  sections: [
    { id: id("section"), kind: "open", share: 3 },
    { id: id("section"), kind: "hanging", share: 9, rails: 1 },
    { id: id("section"), kind: "drawers", share: 3, drawers: 2, ...(internal ? { internal: true } : {}) },
  ],
});

/**
 * A wardrobe's bays, module by module. A wardrobe wide enough to travel in
 * parts is laid out inside its transport modules, so a door count is shared
 * between them in proportion to their width — never fewer doors in a module
 * than one per 600 mm, the widest a hinged leaf hangs well. Inside a module a
 * door gets a bay of its own while it is wider than 450 mm (two would make a
 * bay wider than the 900 mm a wardrobe bay is kept to), otherwise doors go in
 * pairs. Sliding doors are always pairs, a pair to a bay of up to 900 mm.
 * Hanging first, a mixed bay of hanging over drawers in the middle, shelves
 * at the end.
 */
function wardrobeBaysFor(cabinet: Cabinet, wanted: number, style: Bay["door"], internalDrawers = false): { bays: Bay[]; doors: number } {
  const sliding = style === "sliding";
  const modules = modulesOf(cabinet);
  const opening = (carcassModule: CabinetModule) => carcassModule.width - 2 * T;
  const least = modules.map((carcassModule) =>
    sliding ? 2 * Math.ceil(opening(carcassModule) / (LIMITS.wardrobeBayWidth + T)) : Math.max(1, Math.ceil(opening(carcassModule) / LIMITS.hingedLeafWidth)),
  );
  // Share the wanted doors by width; each module has at least its least.
  const total = modules.reduce((sum, carcassModule) => sum + carcassModule.width, 0);
  const shared = modules.map((carcassModule, index) => Math.max(least[index]!, Math.round((wanted * carcassModule.width) / total)));
  const perModule = sliding ? shared.map((count) => count + (count % 2)) : shared;
  const bays: Bay[] = [];
  const leavesOf: number[][] = modules.map((carcassModule, index) => {
    const doors = perModule[index]!;
    const pairs = sliding || opening(carcassModule) / doors <= 450;
    if (!pairs) return Array.from({ length: doors }, () => 1);
    const count = Math.ceil(doors / 2);
    return Array.from({ length: count }, (_, at) => (at === count - 1 && doors % 2 === 1 ? 1 : 2));
  });
  const count = leavesOf.reduce((sum, leaves) => sum + leaves.length, 0);
  const middle = count >= 3 ? Math.floor(count / 2) : count === 2 ? 1 : 0;
  modules.forEach((carcassModule, index) => {
    const leaves = leavesOf[index]!;
    const interior = moduleInterior(carcassModule, leaves.length, T);
    const doors = leaves.reduce((sum, value) => sum + value, 0);
    let handed = 0;
    leaves.forEach((leafCount, at) => {
      const width = at === leaves.length - 1 ? interior - handed : Math.round((interior * leafCount) / doors);
      handed += width;
      const position = bays.length;
      const fitting = count === 1 || position === middle ? mixed(internalDrawers) : position === count - 1 ? structuredClone(shelves) : structuredClone(hanging);
      bays.push(bay(width, fitting, style, leafCount));
    });
  });
  return { bays, doors: perModule.reduce((sum, value) => sum + value, 0) };
}

/** A straight wardrobe of a template's composition, laid out in the space. */
function straightWardrobe(space: Space, doors: number, style: Bay["door"], options: { internalDrawers?: boolean; height?: number } = {}): DesignSpec {
  const base = startingDesign("wardrobe", { width: space.width });
  const height = Math.min(options.height ?? space.height, 2700);
  const sized = { ...main(base), size: { ...main(base).size, height, depth: Math.min(space.depth, 900) } };
  const laid = wardrobeBaysFor(sized, doors, style, options.internalDrawers);
  const cabinet = { ...sized, bays: laid.bays };
  let spec = validateSpec({ ...base, cabinets: base.cabinets.map((entry) => (entry.id === cabinet.id ? cabinet : entry)) }).spec;
  if (laid.doors !== doors) {
    const modules = modulesOf(main(spec)).length;
    spec = note(spec, `Laid out with ${laid.doors} doors to suit ${space.width} mm: doors are kept to a width that ${style === "sliding" ? "runs" : "hangs"} well${modules > 1 ? `, across ${modules} transport modules` : ""}.`);
  }
  return spec;
}

function shapedWardrobe(space: Space, options: TemplateOptions): DesignSpec {
  const shape = options.layout ?? "straight";
  const walls = options.walls ?? (shape === "l_shaped" ? [space.width, 1800] : shape === "u_shaped" ? [1800, space.width, 1800] : [space.width]);
  const spec = wardrobeShapeDesign({ shape, walls, depth: Math.min(space.depth, 900), height: Math.min(space.height, 2700) });
  return validateSpec(spec).spec;
}

export const CABINET_TEMPLATES: CabinetTemplate[] = [
  { id: "wardrobe-2-door", type: "wardrobe", label: "2-door wardrobe", blurb: "Hanging over drawers behind a pair of doors.", layouts: ["straight"], build: (space) => straightWardrobe(space, 2, "hinged") },
  { id: "wardrobe-3-door", type: "wardrobe", label: "3-door wardrobe", blurb: "A pair for hanging, a single door over shelves and drawers.", layouts: ["straight"], build: (space) => straightWardrobe(space, 3, "hinged") },
  { id: "wardrobe-4-door", type: "wardrobe", label: "4-door wardrobe", blurb: "Hanging, drawers and shelves behind four doors.", layouts: ["straight"], build: (space) => straightWardrobe(space, 4, "hinged") },
  { id: "wardrobe-sliding", type: "wardrobe", label: "Sliding wardrobe", blurb: "Sliding doors in pairs — no swing space needed.", layouts: ["straight"], build: (space) => straightWardrobe(space, 2, "sliding") },
  { id: "wardrobe-internal-drawers", type: "wardrobe", label: "Wardrobe with internal drawers", blurb: "Drawers behind the doors; the outside stays clean.", layouts: ["straight"], build: (space) => straightWardrobe(space, 4, "hinged", { internalDrawers: true }) },
  {
    id: "wardrobe-top-cabinet", type: "wardrobe", label: "Wardrobe with top cabinet", blurb: "A full wardrobe and a separate cabinet above it to the ceiling.", layouts: ["straight"],
    build: (space) => {
      const baseHeight = Math.min(2100, Math.max(1500, space.height - 300));
      const spec = straightWardrobe(space, 4, "hinged", { height: baseHeight });
      const top = Math.max(300, Math.min(900, space.height - baseHeight));
      return addTopCabinet(spec, main(spec).id, top);
    },
  },
  {
    id: "wardrobe-side-display", type: "wardrobe", label: "Wardrobe with side display shelves", blurb: "Open shelves at one end, in an accent board.", layouts: ["straight"],
    build: (space) => {
      const shelf = space.width >= 2000 ? 450 : 350;
      const spec = straightWardrobe({ ...space, width: space.width - shelf }, 4, "hinged");
      return addSideDisplay(spec, main(spec).id, { side: "left", width: shelf, depth: Math.min(space.depth, 900), shelves: 5, boardId: "mdf-18-oak" });
    },
  },
  {
    id: "wardrobe-center-niche", type: "wardrobe", label: "Wardrobe with center display niche", blurb: "Two closed sections, an open niche between them.", layouts: ["straight"],
    build: (space) => {
      const spec = straightWardrobe(space, 4, "hinged");
      return addNiche(spec, main(spec).id, { width: space.width >= 3000 ? 500 : 400, boardId: "mdf-18-oak", lighting: "shelf" });
    },
  },
  { id: "wardrobe-l", type: "wardrobe", label: "L wardrobe", blurb: "Along two walls, the corner shelved.", layouts: ["l_shaped"], build: (space, options) => shapedWardrobe(space, { ...options, layout: "l_shaped" }) },
  { id: "wardrobe-u", type: "wardrobe", label: "U wardrobe", blurb: "Three walls of a dressing room.", layouts: ["u_shaped"], build: (space, options) => shapedWardrobe(space, { ...options, layout: "u_shaped" }) },

  // Kitchens are laid out by the kitchen setup — room, walls and where the
  // fridge, sink and stove go — so their templates are presets for it.
  { id: "kitchen-straight", type: "kitchen", label: "Straight kitchen", blurb: "One wall: base run, wall units over it.", kitchen: { shape: "straight" } },
  { id: "kitchen-l", type: "kitchen", label: "L kitchen", blurb: "Two walls and a corner unit.", kitchen: { shape: "l_shaped" } },
  { id: "kitchen-u", type: "kitchen", label: "U kitchen", blurb: "Three walls, two corners.", kitchen: { shape: "u_shaped" } },
  { id: "kitchen-g", type: "kitchen", label: "G kitchen", blurb: "A U with a peninsula.", kitchen: { shape: "g_shaped" } },
  { id: "kitchen-island", type: "kitchen", label: "Kitchen with island", blurb: "A wall run and a free-standing island.", kitchen: { shape: "island" } },
  { id: "kitchen-small", type: "kitchen", label: "Small apartment kitchen", blurb: "A compact straight run, no wall units.", kitchen: { shape: "straight", roomWidth: 2400, wallCabinets: false } },

  {
    id: "vanity-single", type: "vanity", label: "Single basin vanity", blurb: "One basin over a cupboard, wall hung.",
    build: (space) => {
      const spec = startingDesign("vanity", { width: Math.min(space.width, 1000) });
      const vanityCabinet = spec.cabinets.find((cabinet) => cabinet.kind === "vanity")!;
      const single = { ...vanityCabinet, bays: [bay(vanityCabinet.size.width - 2 * T, { kind: "open" }, "hinged", vanityCabinet.size.width > 650 ? 2 : 1)] };
      return fit(validateSpec({ ...spec, cabinets: spec.cabinets.filter((cabinet) => cabinet.kind !== "wall").map((cabinet) => (cabinet.id === single.id ? single : cabinet)) }).spec, space, false);
    },
  },
  { id: "vanity-double", type: "vanity", label: "Double basin vanity", blurb: "Two basins, a drawer bank under each.", build: (space) => { const spec = startingDesign("vanity", { width: space.width }); return fit(validateSpec({ ...spec, cabinets: spec.cabinets.filter((cabinet) => cabinet.kind !== "wall") }).spec, space, false); } },
  {
    id: "vanity-floating", type: "vanity", label: "Floating vanity", blurb: "Hung clear of the floor so the floor can be cleaned under it.",
    build: (space) => { const spec = startingDesign("vanity", { width: space.width }); return fit(validateSpec({ ...spec, cabinets: spec.cabinets.filter((cabinet) => cabinet.kind !== "wall").map((cabinet) => ({ ...cabinet, position: { ...cabinet.position, y: 450 } })) }).spec, space, false); },
  },
  { id: "vanity-mirror", type: "vanity", label: "Vanity + mirror cabinet", blurb: "Basin cabinet with a mirror cabinet above.", build: (space) => fit(startingDesign("vanity", { width: space.width }), space, false) },

  { id: "tv-wall-shelf", type: "tv_unit", label: "TV unit with wall shelf", blurb: "Low drawers and an open middle, a shelf above.", build: (space) => fit(startingDesign("tv_unit", { width: space.width }), space, false) },
  { id: "tv-low", type: "tv_unit", label: "Low TV unit", blurb: "A long low unit on its own.", build: (space) => { const spec = startingDesign("tv_unit", { width: space.width }); return fit(validateSpec({ ...spec, cabinets: spec.cabinets.filter((cabinet) => cabinet.kind !== "wall") }).spec, space, false); } },
  {
    id: "tv-floating", type: "tv_unit", label: "Floating TV unit", blurb: "Wall hung, no plinth.",
    build: (space) => { const spec = startingDesign("tv_unit", { width: space.width }); return fit(validateSpec({ ...spec, cabinets: spec.cabinets.filter((cabinet) => cabinet.kind !== "wall").map((cabinet) => ({ ...cabinet, plinthHeight: 0, position: { ...cabinet.position, y: 300 } })) }).spec, space, false); },
  },

  { id: "shoe-cabinet", type: "shoe", label: "Shoe cabinet", blurb: "Shoe shelves behind hinged doors.", build: (space) => shoeCabinet(space, Math.min(space.height, 1100)) },
  { id: "shoe-tall", type: "shoe", label: "Tall shoe cabinet", blurb: "Floor to head height, many shelves.", build: (space) => shoeCabinet(space, Math.min(space.height, 2100)) },

  { id: "storage-cupboard", type: "storage", label: "Storage cupboard", blurb: "Tall shelves behind doors.", build: (space) => storageCupboard(space) },
  { id: "storage-open", type: "storage", label: "Open shelving", blurb: "Open shelves, bays that do not sag.", build: (space) => fit(startingDesign("shelving", { width: space.width }), space, true) },
  { id: "storage-bookshelf", type: "storage", label: "Bookshelf", blurb: "Book-depth open shelving.", build: (space) => fit(startingDesign("bookshelf", { width: space.width }), space, true) },

  { id: "office-storage", type: "office", label: "Office storage", blurb: "Cupboards below, open filing above.", build: (space) => fit(startingDesign("office_storage", { width: space.width }), space, false) },
  {
    id: "office-filing", type: "office", label: "Filing drawers", blurb: "A run of deep drawers at desk height.",
    build: (space) => {
      const spec = startingDesign("office_storage", { width: space.width });
      const cupboards = spec.cabinets.find((cabinet) => cabinet.kind === "base")!;
      const drawers = { ...cupboards, bays: cupboards.bays.map((entry) => ({ ...entry, fitting: { kind: "drawers" as const, count: 3 } })) };
      return fit(validateSpec({ ...spec, cabinets: [drawers] }).spec, space, false);
    },
  },

  { id: "custom-cabinet", type: "custom", label: "Custom cabinet", blurb: "A cupboard to make your own.", build: (space) => fit(startingDesign("custom", { width: space.width }), space, true) },
  { id: "custom-sketch", type: "custom", label: "Sketch 3D", blurb: "Draw your own forms freely.", build: (space) => ({ ...startingDesign("custom", { width: space.width }), sketchMode: true }) },
];

function shoeCabinet(space: Space, height: number): DesignSpec {
  const spec = startingDesign("custom", { width: space.width });
  const cabinet = main(spec);
  const sections = Math.max(1, Math.ceil((cabinet.size.width - 2 * T) / 600));
  const bayWidth = Math.round((cabinet.size.width - 2 * T - (sections - 1) * T) / sections);
  // A shelf every 180 mm or so: a pair of shoes and a hand above them.
  const count = Math.max(2, Math.floor((height - 100 - 2 * T) / 180) - 1);
  const shoes = { ...cabinet, label: "Shoe cabinet", size: { ...cabinet.size, height, depth: Math.min(space.depth, 450) }, bays: Array.from({ length: sections }, () => bay(bayWidth, { kind: "shelves", count, adjustable: true }, "hinged", bayWidth > LIMITS.hingedLeafWidth ? 2 : 1)) };
  return note(validateSpec({ ...spec, title: `Shoe cabinet, ${cabinet.size.width} mm`, cabinets: [shoes] }).spec, `Shelves about every 180 mm — ${count} per section.`);
}

function storageCupboard(space: Space): DesignSpec {
  const spec = startingDesign("custom", { width: space.width });
  const cabinet = main(spec);
  const sections = Math.max(1, Math.ceil((cabinet.size.width - 2 * T) / 800));
  const bayWidth = Math.round((cabinet.size.width - 2 * T - (sections - 1) * T) / sections);
  const height = Math.min(space.height, 2400);
  const cupboard = { ...cabinet, label: "Storage cupboard", kind: "tall" as const, size: { ...cabinet.size, height, depth: Math.min(space.depth, 600) }, bays: Array.from({ length: sections }, () => bay(bayWidth, { kind: "shelves", count: Math.max(2, Math.floor(height / 380)), adjustable: true }, "hinged", bayWidth > LIMITS.hingedLeafWidth ? 2 : 1)) };
  return validateSpec({ ...spec, title: `Storage cupboard, ${cabinet.size.width} mm`, cabinets: [cupboard] }).spec;
}

export function templatesFor(type: CabinetType): CabinetTemplate[] {
  return CABINET_TEMPLATES.filter((template) => template.type === type);
}

export function findTemplate(templateId: string): CabinetTemplate | undefined {
  return CABINET_TEMPLATES.find((template) => template.id === templateId);
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Boards a cabinet can be made in: the stocked 18 mm sheets. */
export const CABINET_MATERIALS = BOARDS.filter((board) => board.thickness === 18 && !board.id.startsWith("worktop"));

/**
 * A design in another board: carcass, fronts and interior, the edge band
 * that matches it, and the finish the render and the gallery read. The plinth
 * keeps its own board.
 */
export function withMaterial(spec: DesignSpec, boardId: string): DesignSpec {
  const board = findBoard(boardId);
  if (!board) return spec;
  return validateSpec({
    ...spec,
    carcass: { ...spec.carcass, board, frontBoard: board, interiorBoard: board, edgeBand: edgeBandForBoard(board, spec.carcass.edgeBand) },
    finish: board.appearance ? { ...spec.finish, colour: board.appearance.colour, hex: board.appearance.hex, sheen: board.appearance.sheen } : spec.finish,
  }).spec;
}

/** The design for a template in a space, with its layout and material. */
export function buildTemplate(templateId: string, space: Space, options: TemplateOptions & { boardId?: string; priority?: NonNullable<DesignSpec["wardrobePlan"]>["priority"]; ends?: { leftEnd: "wall" | "open"; rightEnd: "wall" | "open" } } = {}): DesignSpec | null {
  const template = findTemplate(templateId);
  if (!template?.build) return null;
  let spec = template.build(space, options);
  if (options.boardId) spec = withMaterial(spec, options.boardId);
  if (template.type === "wardrobe" && options.priority) {
    spec = { ...spec, wardrobePlan: { priority: options.priority, ...(options.ends ?? { leftEnd: "wall", rightEnd: "wall" }) } };
  }
  return spec;
}
