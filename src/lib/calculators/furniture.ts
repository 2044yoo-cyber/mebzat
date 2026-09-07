import { round } from "./units";

/**
 * Fitted furniture, taken apart into pieces of board.
 *
 * Six calculators — wardrobe, kitchen, TV unit, vanity, bookshelf, general
 * storage — are one carcass with different defaults. They share `carcassParts`
 * rather than each deriving its own panel sizes, because the sizes are where
 * the mistakes live and one set of them is enough to get right.
 *
 * ## The geometry
 *
 * Everything is millimetres. The convention is the one a cabinetmaker uses:
 * the **sides run full height** and the top and bottom sit *between* them, so
 * the top is `W − 2t` long, not `W`. Build it the other way and the carcass is
 * two board-thicknesses too wide, which is 36 mm on a run that had to fit an
 * alcove.
 *
 * The same rule applies inside: a bay is what is left after the two sides and
 * every divider have taken their thickness out of the width.
 */

/** A standard board: 2440 × 1220 mm. */
export const SHEET_LENGTH = 2440;
export const SHEET_WIDTH = 1220;
export const SHEET_AREA_M2 = (SHEET_LENGTH * SHEET_WIDTH) / 1_000_000;

/** Gap between a door and its neighbour, and around the opening. */
const DOOR_GAP = 3;
/** Shelves sit back from the front edge and clear of the back panel. */
const SHELF_CLEARANCE = 1;

export type CarcassPart = {
  label: string;
  /** Millimetres. Length is along the grain where grain matters. */
  length: number;
  width: number;
  thickness: number;
  quantity: number;
  /** Which edges get banded, in words. */
  banding: string;
  /** Square metres for the whole row. */
  area: number;
};

export type HardwareLine = { label: string; quantity: number; unit: string };

export type CarcassInput = {
  width: number;
  height: number;
  depth: number;
  thickness: number;
  backThickness: number;
  sections: number;
  shelvesPerSection: number;
  doors: number;
  drawers: number;
  /** Plinth height. Zero for a wall-hung or free-standing shelf unit. */
  toeKick: number;
  /** Wardrobes get one; nothing else does. */
  hangingRail?: boolean;
  /** A worktop across the top, for kitchens and vanities. */
  worktopThickness?: number;
};

export type CarcassResult = {
  parts: CarcassPart[];
  hardware: HardwareLine[];
  bayWidth: number;
  carcassHeight: number;
  /** Board area of every part, m². */
  boardArea: number;
  /** Sheets to buy, allowing for offcuts. */
  sheets: number;
  /** Metres of edge banding. */
  bandingMetres: number;
  formula: string[];
  warnings: string[];
};

/**
 * The complete parts list for one run of carcass.
 *
 * Rounded up to whole sheets at the end, with a nesting allowance, because a
 * cut list that says "4.3 sheets" has not answered the question the joiner
 * asked.
 */
export function carcassParts(input: CarcassInput): CarcassResult {
  const {
    width: W,
    height: H,
    depth: D,
    thickness: t,
    backThickness: bt,
    sections,
    shelvesPerSection,
    doors,
    drawers,
    toeKick,
  } = input;

  const warnings: string[] = [];
  const parts: CarcassPart[] = [];

  const carcassHeight = Math.max(0, H - toeKick - (input.worktopThickness ?? 0));
  const dividers = Math.max(0, sections - 1);
  const bayWidth = (W - 2 * t - dividers * t) / Math.max(1, sections);

  if (bayWidth <= 0) {
    warnings.push(
      `${sections} sections do not fit in ${W} mm once the sides and dividers are taken out. Reduce the sections or widen the unit.`,
    );
  }
  if (bayWidth > 900) {
    warnings.push(
      `Each bay is ${Math.round(bayWidth)} mm wide. Shelves longer than about 900 mm sag under load — add a divider or a mid support.`,
    );
  }

  const add = (
    label: string,
    length: number,
    partWidth: number,
    thickness: number,
    quantity: number,
    banding: string,
  ) => {
    if (quantity <= 0 || length <= 0 || partWidth <= 0) return;
    parts.push({
      label,
      length: round(length, 1),
      width: round(partWidth, 1),
      thickness,
      quantity,
      banding,
      area: round((length * partWidth * quantity) / 1_000_000, 4),
    });
  };

  // Carcass.
  add("Side panel (gable)", carcassHeight, D, t, 2, "Front edge");
  add("Top", W - 2 * t, D, t, 1, "Front edge");
  add("Bottom", W - 2 * t, D, t, 1, "Front edge");
  add("Divider", carcassHeight - 2 * t, D, t, dividers, "Front edge");

  // Shelves sit clear of the back panel and back a shade from the front.
  const shelfDepth = D - bt - 10;
  add(
    "Shelf",
    bayWidth - SHELF_CLEARANCE,
    shelfDepth,
    t,
    sections * shelvesPerSection,
    "Front edge",
  );

  // Back panel, one piece across the whole unit.
  add("Back panel", W, carcassHeight, bt, 1, "—");

  // Doors share the opening between them.
  if (doors > 0) {
    const doorWidth = (W - (doors + 1) * DOOR_GAP) / doors;
    const doorHeight = carcassHeight - 2 * DOOR_GAP;
    add("Door", doorHeight, doorWidth, t, doors, "All four edges");
  }

  // Drawers: a front, two sides, a back and a base each.
  if (drawers > 0) {
    const drawerFrontWidth = (W - (drawers + 1) * DOOR_GAP) / drawers;
    const drawerHeight = 150;
    const drawerBoxDepth = D - 50;
    const drawerBoxWidth = bayWidth - 26; // 13 mm runner each side.
    add("Drawer front", drawerHeight, drawerFrontWidth, t, drawers, "All four edges");
    add("Drawer side", drawerBoxDepth, drawerHeight, t, drawers * 2, "Top edge");
    add("Drawer back", drawerBoxWidth, drawerHeight, t, drawers, "Top edge");
    add("Drawer base", drawerBoxWidth, drawerBoxDepth, bt, drawers, "—");
  }

  if (toeKick > 0) add("Toe kick / plinth", W, toeKick, t, 1, "Top edge");
  if (input.worktopThickness && input.worktopThickness > 0) {
    add("Worktop", W, D, input.worktopThickness, 1, "Front edge");
  }

  // Hardware. Hinge count goes up with door height because a tall door on two
  // hinges twists.
  const hardware: HardwareLine[] = [];
  const doorHeight = carcassHeight - 2 * DOOR_GAP;
  if (doors > 0) {
    const hingesEach = doorHeight > 1600 ? 4 : doorHeight > 900 ? 3 : 2;
    hardware.push({ label: `Concealed hinges (${hingesEach} per door)`, quantity: doors * hingesEach, unit: "pcs" });
  }
  if (doors + drawers > 0) {
    hardware.push({ label: "Handles / knobs", quantity: doors + drawers, unit: "pcs" });
  }
  if (drawers > 0) {
    hardware.push({ label: "Drawer runner pairs", quantity: drawers, unit: "pairs" });
  }
  const shelves = sections * shelvesPerSection;
  if (shelves > 0) {
    hardware.push({ label: "Shelf pins (4 per shelf)", quantity: shelves * 4, unit: "pcs" });
  }
  if (input.hangingRail) {
    hardware.push({ label: "Hanging rail", quantity: round(W / 1000, 2), unit: "m" });
    hardware.push({ label: "Rail end sockets", quantity: sections * 2, unit: "pcs" });
  }

  // Edge banding: the banded edges, added up.
  const bandingMm = parts.reduce((sum, part) => {
    if (part.banding === "—") return sum;
    const perPiece =
      part.banding === "All four edges"
        ? 2 * (part.length + part.width)
        : part.length;
    return sum + perPiece * part.quantity;
  }, 0);

  const boardArea = parts.reduce((sum, part) => sum + part.area, 0);
  // 15% for offcuts — a nesting layout never uses a whole sheet.
  const sheets = Math.ceil((boardArea * 1.15) / SHEET_AREA_M2);

  return {
    parts,
    hardware,
    bayWidth: round(bayWidth, 1),
    carcassHeight: round(carcassHeight, 1),
    boardArea: round(boardArea, 3),
    sheets,
    bandingMetres: round(bandingMm / 1000, 2),
    formula: [
      `Carcass height = ${H} − ${toeKick} mm plinth${input.worktopThickness ? ` − ${input.worktopThickness} mm worktop` : ""} = ${round(carcassHeight, 1)} mm`,
      `Bay width = (${W} − 2 × ${t} − ${dividers} × ${t}) ÷ ${sections} = ${round(bayWidth, 1)} mm`,
      `Top and bottom sit between the sides: ${W} − 2 × ${t} = ${W - 2 * t} mm long`,
      `Board area = ${round(boardArea, 3).toFixed(3)} m²`,
      `Sheets = ⌈${round(boardArea, 3).toFixed(3)} × 1.15 ÷ ${round(SHEET_AREA_M2, 3)} m²⌉ = ${sheets} sheets of ${SHEET_LENGTH} × ${SHEET_WIDTH}`,
      `Edge banding = ${round(bandingMm / 1000, 2).toFixed(2)} m`,
    ],
    warnings,
  };
}

/**
 * Kitchen runs are counted in modules, not as one long box.
 *
 * A 4.2 m kitchen is seven 600 mm cabinets, and it matters: they are built and
 * carried separately, and the run has to divide into whole modules.
 */
export function kitchenModules(runLength: number, moduleWidth: number): {
  modules: number;
  actualWidth: number;
  fillerWidth: number;
  formula: string[];
} {
  if (moduleWidth <= 0) {
    return { modules: 0, actualWidth: 0, fillerWidth: 0, formula: ["Module width must be more than zero."] };
  }
  const modules = Math.floor(runLength / moduleWidth);
  const used = modules * moduleWidth;
  return {
    modules,
    actualWidth: moduleWidth,
    fillerWidth: round(runLength - used, 1),
    formula: [
      `⌊${runLength} mm ÷ ${moduleWidth} mm⌋ = ${modules} modules`,
      `${modules} × ${moduleWidth} = ${used} mm, leaving a ${round(runLength - used, 1)} mm filler`,
    ],
  };
}
