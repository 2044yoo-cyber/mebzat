/**
 * Berchuma Studio — core arithmetic check.
 *
 *   npm run check:berchuma
 *
 * The geometry, costing and cut-list services are pure functions, and they are
 * the layer everything else trusts: the 3D viewer draws what they return, the
 * cost panel totals what they return, and a joinery shop cuts what they
 * return. A quiet mistake here is a wardrobe that does not fit a wall.
 *
 * So they are checked against numbers worked out by hand rather than against a
 * snapshot of their own output — a snapshot only proves the code has not
 * changed, not that it was ever right.
 *
 * Plain Node with type stripping; no test framework, in keeping with the rest
 * of scripts/.
 */

import {
  buildCutList,
  sheetCountsOf,
} from "../src/features/berchuma-studio/services/cutlist.ts";
import {
  buildExport,
  filenameStem,
} from "../src/features/berchuma-studio/services/exports.ts";
import { calculateCost } from "../src/features/berchuma-studio/services/costing.ts";
import {
  badSpecExample,
  kitchenExample,
  tvUnitExample,
  wardrobeExample,
} from "../src/features/berchuma-studio/services/examples.ts";
import { hydrateSpec } from "../src/features/berchuma-studio/services/hydrate.ts";
import { readFileSync } from "node:fs";

import {
  MODULE_CONFIGS,
  applyConfig,
  matchConfig,
  moduleConfig,
} from "../src/features/berchuma-studio/services/module-configs.ts";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs.ts";
import { KITCHEN_MODULES } from "../src/features/berchuma-studio/services/kitchen-modules.ts";
import {
  addBay,
  addCabinet,
  addModule,
  adjustBayCount,
  duplicateCabinet,
  removeCabinet,
  moveCabinet,
  resizeCabinet,
  setBayDoor,
  setBayFitting,
  setCabinetKind,
  addDrawer,
  duplicateDrawer,
  evenDrawers,
  frontHeightsOf,
  hasCustomFronts,
  moveDrawer,
  openingHeightOf,
  removeDrawer,
  setDrawerHeight,
} from "../src/features/berchuma-studio/services/operations.ts";
import { buildParts, hingesPerLeaf } from "../src/features/berchuma-studio/services/geometry.ts";
import {
  allBays,
  boundingBox,
  parseSpec,
  validateSpec,
} from "../src/features/berchuma-studio/types/spec.ts";
import type { Bay, DesignSpec } from "../src/features/berchuma-studio/types/spec.ts";

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const RESET = "[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function near(actual: number, expected: number, tolerance = 0.5): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/** The zip end-of-central-directory signature, scanned from the back. */
function findEocd(bytes: Uint8Array): number {
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Geometry — checked against the carpentry, by hand
// ---------------------------------------------------------------------------

{
  const spec = wardrobeExample();
  const { parts, hardware, totals } = buildParts(spec);

  const t = spec.carcass.board.thickness; // 18
  const plinth = spec.carcass.plinthHeight; // 100
  const carcassHeight = spec.envelope.height - plinth; // 2300

  // Part ids are namespaced by cabinet now — "wardrobe/gable-left" — because a
  // kitchen has eight cabinets and every one of them has a left gable. The
  // check still asks for the part by its own name.
  const find = (id: string) =>
    parts.find((part) => part.id === id || part.id.endsWith(`/${id}`));

  // Gables run the full carcass height and the full depth.
  const left = find("gable-left");
  check("gable height", left?.length === carcassHeight, `got ${left?.length}`);
  check("gable depth", left?.width === spec.envelope.depth, `got ${left?.width}`);
  check("gable front edge banded", left?.edges.front === true);
  check("gable back edge not banded", left?.edges.back === false);

  // Top and bottom sit between the gables: 2400 - 2×18 = 2364.
  const bottom = find("carcass-bottom");
  check("bottom spans between gables", bottom?.length === 2364, `got ${bottom?.length}`);

  // Two internal dividers for three bays.
  const dividers = parts.filter((part) => part.role === "divider");
  check("two dividers for three bays", dividers.length === 2, `got ${dividers.length}`);
  check(
    "divider height is interior height",
    dividers[0]?.length === carcassHeight - 2 * t,
    `got ${dividers[0]?.length}`,
  );

  // Bay 3 has five shelves, set back from the front and clear of the back.
  const shelves = parts.filter((part) => part.role === "shelf" && part.bayId === "bay-3");
  check("five shelves in bay 3", shelves[0]?.quantity === 5, `got ${shelves[0]?.quantity}`);
  check(
    "shelf width is depth less back and setback",
    shelves[0]?.width === spec.envelope.depth - spec.carcass.backBoard.thickness - spec.carcass.shelfSetback,
    `got ${shelves[0]?.width}`,
  );

  // Bay 2 has four drawers: sides, ends and a base each.
  const drawerBases = parts.filter((part) => part.role === "drawer_base");
  check("four drawer bases", drawerBases.length === 4, `got ${drawerBases.length}`);
  const drawerSides = parts.filter((part) => part.role === "drawer_side");
  check("drawer sides come in twos", drawerSides.every((part) => part.quantity === 2));

  // Doors: bay 1 and 3 are pairs, bay 2 is drawers so it gets fronts.
  const doors = parts.filter((part) => part.role === "door");
  const leaves = doors.reduce((total, part) => total + part.quantity, 0);
  check("four door leaves (two pairs)", leaves === 4, `got ${leaves}`);
  const fronts = parts.filter((part) => part.role === "drawer_front");
  check("four drawer fronts", fronts.length === 4, `got ${fronts.length}`);
  check(
    "a drawer bay has no door",
    doors.every((door) => door.bayId !== "bay-2"),
  );

  // A 2300 mm leaf needs five hinges by the trade rule.
  check("hinges per leaf, 2300 mm", hingesPerLeaf(2300) === 5);
  check("hinges per leaf, 1200 mm", hingesPerLeaf(1200) === 2);
  check("hinges per leaf, 1600 mm", hingesPerLeaf(1600) === 3);

  const hinges = hardware.find((line) => line.hardware.kind === "hinge");
  const doorHeight = spec.envelope.height - plinth - 2 * spec.carcass.doorGap;
  check(
    "hinge count follows the doors",
    hinges?.quantity === leaves * hingesPerLeaf(doorHeight),
    `got ${hinges?.quantity} for ${leaves} leaves at ${doorHeight} mm`,
  );

  // A handle on every front: 4 doors + 4 drawers.
  const handles = hardware.find((line) => line.hardware.kind === "handle");
  check("one handle per front", handles?.quantity === 8, `got ${handles?.quantity}`);

  // One pair of runners per drawer.
  const runners = hardware.find((line) => line.hardware.kind === "drawer_runner");
  check("four pairs of runners", runners?.quantity === 4, `got ${runners?.quantity}`);

  // Four pins per adjustable shelf. Bay 1 has a rail shelf, bay 3 has five.
  const pins = hardware.find((line) => line.hardware.kind === "shelf_pin");
  check("shelf pins are four per shelf", (pins?.quantity ?? 0) % 4 === 0, `got ${pins?.quantity}`);

  // Board area must be positive and split across the two boards used.
  check("carcass board area recorded", (totals.areaByBoard["mdf-18-walnut"] ?? 0) > 0);
  check("back board area recorded", (totals.areaByBoard["hdf-4-white"] ?? 0) > 0);
  check("edge band metres recorded", (totals.bandByEdge["pvc-2-walnut"] ?? 0) > 0);

  // Sanity: a 2.4 × 2.4 × 0.6 wardrobe is roughly 25–40 m² of board. Outside
  // that range something is wrong by a factor, which is the failure that
  // matters.
  const boardArea = totals.areaByBoard["mdf-18-walnut"] ?? 0;
  check(
    "board area is physically plausible",
    boardArea > 20 && boardArea < 45,
    `got ${boardArea} m²`,
  );

  // The check this harness was missing, and it let a real defect through: a
  // 2400 × 2300 back panel cannot be cut from a 2440 × 1220 sheet. Every part
  // must fit the board it is specified in, in some orientation — and if the
  // board is grain-locked, in its own orientation only.
  const oversize = parts.filter((part) => {
    const { length: sheetL, width: sheetW } = part.board.sheet;
    const fitsAsCut = part.length <= sheetL && part.width <= sheetW;
    const fitsRotated = part.length <= sheetW && part.width <= sheetL;
    return part.board.grain === "none"
      ? !(fitsAsCut || fitsRotated)
      : !fitsAsCut;
  });
  check(
    "every part fits the sheet it is cut from",
    oversize.length === 0,
    oversize.map((part) => `${part.label} ${part.length}×${part.width}`).join(", "),
  );

  // Backs are one per bay for exactly that reason.
  const backs = parts.filter((part) => part.role === "back");
  check(
    "one back panel per bay",
    backs.length === allBays(spec).length,
    `got ${backs.length}`,
  );

  // Labour must be a believable share of a melamine job. Below about 5% means
  // the minutes-per-part model has collapsed; above 40% means it has run away.
  const cost = calculateCost(spec, { parts, hardware, totals });
  const labourShare = (cost.subtotals.labour / cost.productionCost) * 100;
  check(
    "labour is a plausible share of production cost",
    labourShare > 5 && labourShare < 40,
    `got ${labourShare.toFixed(1)}%`,
  );
  check(
    "a three-bay wardrobe is more than two person-days of shop work",
    cost.subtotals.labour / 1200 > 2,
    `got ${(cost.subtotals.labour / 1200).toFixed(1)} person-days`,
  );
}

// ---------------------------------------------------------------------------
// Validation — repairs, does not reject
// ---------------------------------------------------------------------------

{
  const { spec, issues } = validateSpec(badSpecExample());

  check(
    "an over-tall carcass is capped",
    spec.cabinets[0]?.size.height === 2700,
    `got ${spec.cabinets[0]?.size.height}`,
  );
  check(
    "and the overall box follows it down",
    spec.envelope.height === 2700,
    `got ${spec.envelope.height}`,
  );
  check(
    "hanging depth raised",
    spec.cabinets[0]?.size.depth === 550,
    `got ${spec.cabinets[0]?.size.depth}`,
  );
  check(
    "wide hinged bay became a pair",
    allBays(spec)[0]?.doorLeaves === 2,
    `got ${allBays(spec)[0]?.doorLeaves}`,
  );

  // 1200 + 900 = 2100 declared against an interior of 2400 - 36 - 18 = 2346.
  const declared = allBays(spec).reduce((total, bay) => total + bay.width, 0);
  check(
    "bay widths rescaled to fit the carcass",
    near(declared, 2346, 2),
    `summed to ${declared}`,
  );

  check("long shelf span was flagged", issues.some((issue) => issue.path.includes("width") && issue.message.includes("sag")));
  check("every issue carries a path", issues.every((issue) => issue.path.length > 0));
  check("corrections recorded on the spec", spec.meta.corrections.length > 0);

  // The repaired spec must still be a valid spec.
  const reparsed = parseSpec(spec);
  check("repaired spec still parses", reparsed.ok === true);
}

{
  // Garbage in must fail cleanly rather than throw.
  const result = parseSpec({ version: 1, kind: "spaceship" });
  check("nonsense is rejected with a message", result.ok === false && result.error.length > 0);
}

// ---------------------------------------------------------------------------
// Costing
// ---------------------------------------------------------------------------

{
  const spec = wardrobeExample();
  const parts = buildParts(spec);
  const cost = calculateCost(spec, parts);

  check("price is positive", cost.price > 0, `got ${cost.price}`);
  check("price exceeds production cost", cost.price > cost.productionCost);

  // Margin arithmetic, exactly.
  check(
    "margin is 25% of production cost",
    near(cost.margin.amount, cost.productionCost * 0.25, 1),
    `got ${cost.margin.amount} on ${cost.productionCost}`,
  );
  check(
    "price is production plus margin",
    near(cost.price, cost.productionCost + cost.margin.amount, 1),
  );

  // Subtotals must reconstruct the direct cost — a panel whose parts do not
  // add up to its total is worse than no panel.
  const subtotalSum = Object.values(cost.subtotals).reduce((a, b) => a + b, 0);
  check(
    "subtotals reconstruct the direct cost",
    near(subtotalSum, cost.directCost, 1),
    `${subtotalSum} vs ${cost.directCost}`,
  );

  // And every line must land in its subtotal.
  for (const group of Object.keys(cost.subtotals) as (keyof typeof cost.subtotals)[]) {
    const lineSum = cost.lines
      .filter((line) => line.group === group)
      .reduce((total, line) => total + line.amount, 0);
    check(
      `lines sum to the ${group} subtotal`,
      near(lineSum, cost.subtotals[group], 1),
      `${lineSum} vs ${cost.subtotals[group]}`,
    );
  }

  // Waste must not be charged twice: it is already inside the sheet count.
  check("waste is not double-charged", cost.waste.amount === 0);

  // With no market rates supplied, nothing is priced from a listing and the
  // breakdown must say so rather than implying a live quote.
  check("confidence is zero without listings", cost.confidence === 0, `got ${cost.confidence}`);
  check(
    "the absence of listings is stated",
    cost.assumptions.some((note) => note.includes("fallback")),
  );
  check("every line names its source", cost.lines.every((line) => line.source === "listing" || line.source === "fallback"));

  // Feed it a live rate and confidence must move.
  const withRate = calculateCost(spec, parts, {
    rates: [
      {
        key: "MDF 18mm walnut",
        unit: "sheet",
        amount: 2900,
        currency: "ETB",
        listingId: "00000000-0000-4000-8000-000000000001",
      },
    ],
  });
  check("confidence rises with a live rate", withRate.confidence > 0, `got ${withRate.confidence}`);
  check(
    "a live rate is attributed to its listing",
    withRate.lines.some((line) => line.listingId !== undefined),
  );
  check(
    "a cheaper live rate lowers the price",
    withRate.price < cost.price,
    `${withRate.price} vs ${cost.price}`,
  );

  // Production time must be crew-adjusted.
  const solo = calculateCost(spec, parts, { shop: { crewSize: 1 } });
  check(
    "a crew of two halves the calendar time",
    near(solo.productionDays, cost.productionDays * 2, 0.2),
    `${solo.productionDays} vs ${cost.productionDays}`,
  );
  check("labour cost is unchanged by crew size", near(solo.subtotals.labour, cost.subtotals.labour, 1));

  // Sheets: never zero, never fractional.
  check("sheet counts are whole and at least one", cost.sheets.every((sheet) => Number.isInteger(sheet.count) && sheet.count >= 1));
  check("utilisation is a fraction", cost.sheets.every((sheet) => sheet.utilisation > 0 && sheet.utilisation <= 1));
}

// ---------------------------------------------------------------------------
// Monotonicity — the property that makes the live panel believable
// ---------------------------------------------------------------------------

{
  // Widening a unit must not make it cheaper. This is the invariant a user
  // will notice broken within thirty seconds of dragging a slider.
  const base = wardrobeExample();
  const wider = wardrobeExample();
  wider.cabinets[0]!.size.width = 3000;
  wider.cabinets[0]!.bays = wider.cabinets[0]!.bays.map((bay) => ({
    ...bay,
    width: 971,
  }));
  wider.envelope = boundingBox(wider.cabinets);

  const basePrice = calculateCost(base, buildParts(base)).price;
  const widerPrice = calculateCost(wider, buildParts(wider)).price;
  check("a wider unit costs more", widerPrice > basePrice, `${widerPrice} vs ${basePrice}`);

  // Removing all the drawers must not cost more.
  const noDrawers = wardrobeExample();
  noDrawers.cabinets[0]!.bays = noDrawers.cabinets[0]!.bays.map((bay) =>
    bay.fitting.kind === "drawers"
      ? { ...bay, fitting: { kind: "shelves" as const, count: 4, adjustable: true } }
      : bay,
  );
  const noDrawerPrice = calculateCost(noDrawers, buildParts(noDrawers)).price;
  check(
    "swapping drawers for shelves is cheaper",
    noDrawerPrice < basePrice,
    `${noDrawerPrice} vs ${basePrice}`,
  );
}

// ---------------------------------------------------------------------------
// Cut list
// ---------------------------------------------------------------------------

{
  const spec = wardrobeExample();
  const parts = buildParts(spec);
  const list = buildCutList(spec, parts);

  check("cut list has rows", list.rows.length > 0);
  check("rows are numbered from one", list.rows[0]?.index === 1);
  // Largest first *within a board*, not across the whole design. The flat list
  // now follows the printed order — one board at a time, biggest panel first —
  // because that is the order somebody actually cuts in: one trip to the rack,
  // then the big panels off the sheet before the offcuts are committed.
  check(
    "rows are ordered largest first within each board",
    list.byBoard.every((board) =>
      board.rows.every((row, index) => {
        const next = board.rows[index + 1];
        return !next || row.length * row.width >= next.length * next.width;
      }),
    ),
  );

  // Every piece in the parts list must appear exactly once in the cut list.
  check(
    "no piece is lost or duplicated",
    list.totals.pieces === parts.totals.partCount,
    `${list.totals.pieces} vs ${parts.totals.partCount}`,
  );

  // Two boards means two blocks.
  check("grouped by board", list.byBoard.length === 2, `got ${list.byBoard.length}`);
  check(
    "board blocks account for every piece",
    list.byBoard.reduce((total, block) => total + block.pieces, 0) === list.totals.pieces,
  );

  // Walnut is grain-locked; the list must say so.
  check("grain lock is marked", list.rows.some((row) => row.grainLocked));
  check("grain note is present", list.notes.some((note) => note.includes("rotated")));

  // Banding must read as instructions.
  const door = list.rows.find((row) => row.label.startsWith("Door"));
  check("a door is banded all round", door?.banding === "All four edges", `got ${door?.banding}`);
  // Matched on the word rather than on the start of the label. Once every bay
  // in the fixture became the same width, the shelves and the rail shelf were
  // the same part and the cut list correctly merged them into one row — under
  // the label "Rail shelf", which a startsWith("Shelf") never found. The check
  // was passing on an accident of the fixture's dimensions.
  const shelf = list.rows.find((row) => /shelf/i.test(row.label));
  check("a shelf is banded on the front only", shelf?.banding === "Front", `got ${shelf?.banding} on "${shelf?.label}"`);

  // Rows must never merge across materials.
  const white = tvUnitExample();
  const whiteList = buildCutList(white, buildParts(white));
  const mixed = whiteList.rows.some(
    (row) => row.boardId !== white.carcass.board.id && row.boardId !== white.carcass.backBoard.id,
  );
  check("no row references an unknown board", !mixed);

  check("dimensions are whole millimetres", list.rows.every((row) => Number.isInteger(row.length) && Number.isInteger(row.width)));
  check("quantities are positive integers", list.rows.every((row) => Number.isInteger(row.quantity) && row.quantity > 0));
}

// ---------------------------------------------------------------------------
// Placement — the model on screen has to be the thing being priced
// ---------------------------------------------------------------------------
//
// Every part now carries one position per unit of quantity. Before that it
// carried a single point that nothing read, and the values were placeholders:
// five shelves shared one height, a pair of doors shared one x, and every
// drawer in a bank sat on the floor. None of it was wrong until something
// drew it.

{
  for (const spec of [wardrobeExample(), tvUnitExample()]) {
    const { parts } = buildParts(spec);
    const label = spec.kind;

    // Checked at the source, because this is where the TV unit went wrong and
    // the symptom appeared four functions away as a back panel hanging off the
    // end of the carcass. A fixture with bays that do not add up is not a
    // design; every real path repairs it in `validateSpec`, so only a fixture
    // can carry the mistake this far.
    const thickness = spec.carcass.board.thickness;
    for (const cabinet of spec.cabinets) {
      const interior =
        cabinet.size.width -
        2 * thickness -
        (cabinet.bays.length - 1) * thickness;
      const declared = cabinet.bays.reduce((sum, bay) => sum + bay.width, 0);
      check(
        `${label}: the bays of ${cabinet.label} fill it exactly`,
        near(declared, interior, 1),
        `bays sum to ${declared} inside ${interior}`,
      );
    }

    check(
      `${label}: every part has one placement per unit`,
      parts.every((part) => part.placements.length === part.quantity),
      parts
        .filter((part) => part.placements.length !== part.quantity)
        .map((part) => `${part.id} ${part.placements.length}/${part.quantity}`)
        .join(", "),
    );

    // Two instances of the same part occupying the same point is the exact
    // failure the old single position produced, and it is invisible on screen:
    // the shelves are all there, stacked, looking like one shelf.
    const collided = parts.filter((part) => {
      const seen = new Set(
        part.placements.map((at) => `${at.x}|${at.y}|${at.z}`),
      );
      return seen.size !== part.placements.length;
    });
    check(
      `${label}: no two instances of a part share a point`,
      collided.length === 0,
      collided.map((part) => part.id).join(", "),
    );

    // Everything inside the envelope, except fronts, which stand proud of it
    // by their own thickness and are allowed to.
    const outside = parts.filter((part) => {
      const size = part.size;
      return part.placements.some((at) => {
        const front = part.role === "door" || part.role === "drawer_front";
        const minZ = front ? -part.board.thickness - 0.5 : -0.5;
        return (
          at.x < -0.5 ||
          at.y < -0.5 ||
          at.z < minZ ||
          at.x + size.x > spec.envelope.width + 0.5 ||
          at.y + size.y > spec.envelope.height + 0.5 ||
          at.z + size.z > spec.envelope.depth + 0.5
        );
      });
    });
    check(
      `${label}: every part is inside the envelope`,
      outside.length === 0,
      outside.map((part) => part.id).join(", "),
    );

    // The bounding box is stated by hand at each part, so the thing to check
    // is that the hand did not slip: the three sides must be the cut length,
    // the cut width and the board thickness, in some order. A transposed pair
    // draws a shelf standing on its edge and is otherwise invisible.
    //
    // Legs and rails are exempt, and the exemption is real rather than
    // convenient: both are bought sections — a leg 50 × 50, a rail 25 mm round
    // tube — not pieces cut from a sheet, so the third dimension is their own
    // section and not the board's thickness. Requiring otherwise would mean
    // modelling a Zekolo leg as an 18 mm sliver and a hanging rail as a flat
    // strip, which is neither what is bought nor what is drawn. Both have their
    // own invariants below, so the exemption costs no coverage.
    const mismatched = parts.filter((part) => {
      if (part.role === "leg" || part.role === "rail") return false;
      const box = [part.size.x, part.size.y, part.size.z].sort((a, b) => a - b);
      const cut = [part.length, part.width, part.board.thickness].sort(
        (a, b) => a - b,
      );
      return box.some((value, index) => !near(value, cut[index] ?? -1, 1));
    });
    const legParts = parts.filter((part) => part.role === "leg");
    check(
      `${label}: a leg is square in section`,
      legParts.every((part) => near(part.size.x, part.size.z, 0.5)),
      legParts.map((part) => `${part.size.x}×${part.size.z}`).join(", "),
    );
    check(
      `${label}: a leg's height is its cut length`,
      legParts.every((part) => near(part.size.y, part.length, 0.5)),
    );

    // The rail's own invariants, standing in for the one it is exempt from.
    const railParts = parts.filter((part) => part.role === "rail");
    check(
      `${label}: a rail is round in section`,
      railParts.every((part) => near(part.size.y, part.size.z, 0.5)),
      railParts.map((part) => `${part.size.y}×${part.size.z}`).join(", "),
    );
    check(
      `${label}: a rail's length runs across the bay`,
      railParts.every(
        (part) => near(part.size.x, part.length, 0.5) && part.size.x > part.size.y,
      ),
      "a rail longer in section than in span is one drawn on its end",
    );

    check(
      `${label}: every bounding box matches its cut dimensions`,
      mismatched.length === 0,
      mismatched
        .map(
          (part) =>
            `${part.id} box ${part.size.x}×${part.size.y}×${part.size.z} vs cut ${part.length}×${part.width}×${part.board.thickness}`,
        )
        .join("; "),
    );
  }
}

{
  // Shelves rise up the bay rather than sitting on top of one another, and a
  // pair of doors runs across the bay rather than through it.
  const spec = wardrobeExample();
  const { parts } = buildParts(spec);

  const shelves = parts.find((part) => part.role === "shelf" && part.quantity > 1);
  if (!shelves) {
    check("a multi-shelf bay exists to check", false);
  } else {
    passed += 1;
    const ys = shelves.placements.map((at) => at.y);
    const rising = ys.every((y, index) => index === 0 || y > (ys[index - 1] ?? 0));
    check("shelves climb the bay", rising, ys.join(", "));

    // Evenly, to within a millimetre of rounding.
    const gaps = ys.slice(1).map((y, index) => y - (ys[index] ?? 0));
    check(
      "and are evenly spaced",
      gaps.every((gap) => near(gap, gaps[0] ?? 0, 1)),
      gaps.join(", "),
    );
  }

  const pair = parts.find((part) => part.role === "door" && part.quantity === 2);
  if (!pair) {
    check("a pair of doors exists to check", false);
  } else {
    passed += 1;
    const [left, right] = pair.placements;
    check(
      "a pair of doors sits side by side, not on top of each other",
      Boolean(left && right) && right!.x > left!.x + pair.width - 1,
      `${left?.x} then ${right?.x}, leaf ${pair.width}`,
    );
    check(
      "and both leaves stand proud of the carcass",
      pair.placements.every((at) => at.z < 0),
    );
  }

  const fronts = parts
    .filter((part) => part.role === "drawer_front")
    .sort((a, b) => (b.placements[0]?.y ?? 0) - (a.placements[0]?.y ?? 0));
  if (fronts.length < 2) {
    check("a bank of drawers exists to check", false);
  } else {
    passed += 1;
    // Each front below the one above it, by at least its own height.
    const stacked = fronts.every((front, index) => {
      if (index === 0) return true;
      const above = fronts[index - 1];
      return (
        (front.placements[0]?.y ?? 0) + front.length <=
        (above?.placements[0]?.y ?? 0) + 1
      );
    });
    check(
      "drawer fronts stack without overlapping",
      stacked,
      fronts.map((f) => `${Math.round(f.placements[0]?.y ?? 0)}+${f.length}`).join(" "),
    );

    // And the box behind each front sits on the same floor as the front.
    const boxes = parts.filter((part) => part.role === "drawer_base");
    const aligned = fronts.every((front) =>
      boxes.some((box) =>
        near(box.placements[0]?.y ?? -1, front.placements[0]?.y ?? -2, 1),
      ),
    );
    check("every drawer box shares a floor with its front", aligned);
  }
}

// ---------------------------------------------------------------------------
// Determinism — the same spec must always give the same numbers
// ---------------------------------------------------------------------------

{
  const spec = wardrobeExample();
  const a = calculateCost(spec, buildParts(spec));
  const b = calculateCost(spec, buildParts(spec));
  check("costing is deterministic", JSON.stringify(a) === JSON.stringify(b));

  const listA = buildCutList(spec, buildParts(spec));
  const listB = buildCutList(spec, buildParts(spec));
  check("the cut list is deterministic", JSON.stringify(listA) === JSON.stringify(listB));

  // And building parts must not mutate the spec it was handed.
  const before = JSON.stringify(spec);
  buildParts(spec);
  calculateCost(spec, buildParts(spec));
  check("the spec is not mutated", JSON.stringify(spec) === before);
}

// ---------------------------------------------------------------------------
// Nesting — every panel on a sheet, once, without overlapping another
// ---------------------------------------------------------------------------
//
// The sheet count used to be area ÷ sheet area plus 15%. It could not be
// wrong in a way anybody noticed, because there was nothing to check it
// against. A layout can be wrong in ways that are invisible on a diagram and
// catastrophic at the saw: two parts in the same place, a part off the edge, a
// grain-locked part quietly turned, a part dropped entirely.

for (const spec of [wardrobeExample(), tvUnitExample()]) {
  const label = spec.kind;
  const parts = buildParts(spec);
  const list = buildCutList(spec, parts);

  for (const board of list.byBoard) {
    const nest = board.nesting;
    const where = `${label}/${nest.boardId}`;

    // Nothing may be left on the floor.
    check(
      `${where}: every piece is placed`,
      nest.unplaced.length === 0,
      nest.unplaced.map((piece) => `${piece.label}: ${piece.reason}`).join("; "),
    );

    const placed = nest.sheets.reduce(
      (total, sheet) => total + sheet.placements.length,
      0,
    );
    check(
      `${where}: the count on the sheets matches the count on the list`,
      placed === board.pieces,
      `${placed} placed vs ${board.pieces} listed`,
    );

    // Off the edge. A part at x = 2400 on a 2440 sheet is a part that is 40 mm
    // wide by the time it reaches the saw.
    const outside = nest.sheets.flatMap((sheet) =>
      sheet.placements.filter(
        (item) =>
          item.x < -0.001 ||
          item.y < -0.001 ||
          item.x + item.width > sheet.length + 0.001 ||
          item.y + item.height > sheet.width + 0.001,
      ),
    );
    check(
      `${where}: nothing hangs off the sheet`,
      outside.length === 0,
      outside.map((item) => `${item.label} at ${item.x},${item.y}`).join("; "),
    );

    // Two parts in the same place. The one failure a diagram makes look fine.
    const overlaps: string[] = [];
    for (const sheet of nest.sheets) {
      for (let a = 0; a < sheet.placements.length; a += 1) {
        for (let b = a + 1; b < sheet.placements.length; b += 1) {
          const one = sheet.placements[a];
          const two = sheet.placements[b];
          if (!one || !two) continue;
          const apart =
            one.x + one.width <= two.x + 0.001 ||
            two.x + two.width <= one.x + 0.001 ||
            one.y + one.height <= two.y + 0.001 ||
            two.y + two.height <= one.y + 0.001;
          if (!apart) {
            overlaps.push(`sheet ${sheet.number}: ${one.label} over ${two.label}`);
          }
        }
      }
    }
    check(`${where}: no two pieces overlap`, overlaps.length === 0, overlaps.join("; "));

    // The kerf has to be real material. Two pieces touching edge to edge on a
    // diagram are two pieces that come out 3.2 mm narrow.
    const tooClose: string[] = [];
    for (const sheet of nest.sheets) {
      for (let a = 0; a < sheet.placements.length; a += 1) {
        for (let b = a + 1; b < sheet.placements.length; b += 1) {
          const one = sheet.placements[a];
          const two = sheet.placements[b];
          if (!one || !two) continue;
          // Only pieces that share a strip are separated by a cut along x.
          if (Math.abs(one.y - two.y) > 0.001) continue;
          const gap =
            one.x < two.x
              ? two.x - (one.x + one.width)
              : one.x - (two.x + two.width);
          if (gap < nest.kerf - 0.001) {
            tooClose.push(
              `sheet ${sheet.number}: ${one.label} and ${two.label} are ${gap.toFixed(1)} mm apart`,
            );
          }
        }
      }
    }
    // Two assertions, not one. Comparing the gaps against `nest.kerf` alone
    // is circular: set the kerf to zero and every gap satisfies it, which is
    // exactly what happened the first time this was written. The blade has a
    // real width, so the check names one.
    check(
      `${where}: the kerf is a real blade width`,
      nest.kerf >= 3,
      `${nest.kerf} mm`,
    );
    check(
      `${where}: a saw kerf fits between neighbours`,
      tooClose.length === 0,
      tooClose.join("; "),
    );

    // Grain. A walnut gable turned 90° to save a sheet is a gable that has to
    // be recut, and the customer sees why across the room.
    const board_ = spec.carcass.board.id === nest.boardId
      ? spec.carcass.board
      : spec.carcass.backBoard;
    if (board_.grain !== "none") {
      const turned = nest.sheets.flatMap((sheet) =>
        sheet.placements.filter((item) => item.rotated),
      );
      check(
        `${where}: grain-locked parts are never turned`,
        turned.length === 0,
        turned.map((item) => item.label).join("; "),
      );
    }

    check(
      `${where}: the offcut is a real fraction`,
      nest.offcut >= 0 && nest.offcut < 1,
      String(nest.offcut),
    );
  }
}

{
  // The number that was previously assumed. A three-bay wardrobe in 18 mm
  // walnut is a real job with a known answer: eleven full-height panels alone
  // fill several sheets, and any layout claiming to do it in three is wrong.
  const spec = wardrobeExample();
  const list = buildCutList(spec, buildParts(spec));
  const carcass = list.byBoard.find(
    (board) => board.boardId === spec.carcass.board.id,
  );

  check("the wardrobe carcass nests onto a plausible sheet count",
    (carcass?.sheets ?? 0) >= 6 && (carcass?.sheets ?? 0) <= 14,
    String(carcass?.sheets));

  // Deterministic, or the diagram on screen is not the diagram in the shop.
  const again = buildCutList(spec, buildParts(spec));
  check(
    "nesting the same design twice gives the same layout",
    JSON.stringify(list.byBoard.map((b) => b.nesting)) ===
      JSON.stringify(again.byBoard.map((b) => b.nesting)),
  );
}

{
  // A part that cannot fit any sheet must be reported, not silently dropped.
  // This is the 2400 × 2300 back panel from phase 0 in another guise.
  const spec = wardrobeExample();
  const parts = buildParts(spec);
  const oversized = buildCutList(spec, {
    ...parts,
    parts: [
      ...parts.parts,
      {
        ...parts.parts[0]!,
        id: "impossible",
        label: "Impossible panel",
        length: 3000,
        width: 1400,
        quantity: 1,
      },
    ],
  });

  const unplaced = oversized.byBoard.flatMap((board) => board.nesting.unplaced);
  check(
    "a panel too big for any sheet is reported rather than dropped",
    unplaced.some((piece) => piece.label === "Impossible panel"),
    unplaced.map((piece) => piece.label).join(", "),
  );
  check(
    "and the reason says why",
    unplaced.some((piece) => /does not fit/.test(piece.reason)),
    unplaced.map((piece) => piece.reason).join("; "),
  );
}

// ---------------------------------------------------------------------------
// Exports — the documents a workshop receives
// ---------------------------------------------------------------------------

{
  const spec = wardrobeExample();
  const bundle = buildExport({ spec, preparedFor: "A customer" });

  // An .xlsx is a zip. Two signatures, at the front and at the back: the local
  // file header and the end-of-central-directory record. A file missing either
  // opens as "unreadable content" in Excel and gives no hint why.
  const bytes = bundle.workbook;
  check(
    "the workbook starts with a zip local header",
    bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04,
    [...bytes.slice(0, 4)].join(","),
  );

  const eocd = bytes.lastIndexOf(0x06, bytes.length - 20);
  check(
    "and ends with a central directory record",
    findEocd(bytes) !== -1,
    String(eocd),
  );

  // Byte-identical for the same input. The timestamps in the zip are fixed for
  // exactly this reason: a difference between two exports always means the
  // design changed, never that the clock moved.
  const again = buildExport({ spec, preparedFor: "A customer" }).workbook;
  check(
    "the same design exports byte-identically",
    bytes.length === again.length && bytes.every((byte, i) => byte === again[i]),
  );

  check(
    "the filename stem is safe on Windows and in a URL",
    /^[a-z0-9-]+$/.test(bundle.stem),
    bundle.stem,
  );
  check(
    "a title of punctuation still yields a filename",
    filenameStem("—  ///  —") === "berchuma-design",
    filenameStem("—  ///  —"),
  );

  // The cut list must add up to the parts list. They are built from the same
  // spec, so a disagreement means one of them is grouping wrongly — which is
  // how a shop ends up two panels short.
  const parts = buildParts(spec);
  const partPieces = parts.parts.reduce((total, part) => total + part.quantity, 0);
  check(
    "the cut list totals the same pieces as the parts list",
    bundle.cutList.totals.pieces === partPieces,
    `${bundle.cutList.totals.pieces} vs ${partPieces}`,
  );

  const boardPieces = bundle.cutList.byBoard.reduce(
    (total, board) => total + board.pieces,
    0,
  );
  check(
    "and the per-board blocks account for every one",
    boardPieces === partPieces,
    `${boardPieces} vs ${partPieces}`,
  );

  // The numbers on the sheet must run 1..n in the order they are printed. They
  // used to be assigned by size across the whole design and then printed
  // grouped by board, which gave a cutter a list running 1, 2, 10, 3, 4.
  const printed = bundle.cutList.byBoard.flatMap((board) => board.rows);
  check(
    "cut list numbers run in reading order",
    printed.every((row, position) => row.index === position + 1),
    printed.map((row) => row.index).join(","),
  );
  check(
    "and the flat list is in the same order",
    bundle.cutList.rows.every((row, position) => row.index === position + 1),
    bundle.cutList.rows.map((row) => row.index).join(","),
  );

  // Every row a shop reads has to be cuttable and countable.
  const broken = bundle.cutList.rows.filter(
    (row) =>
      row.quantity < 1 ||
      row.length <= 0 ||
      row.width <= 0 ||
      !Number.isFinite(row.area),
  );
  check(
    "every cut list row is a real piece",
    broken.length === 0,
    broken.map((row) => row.label).join(", "),
  );
}

{
  // One design, one price. The studio panel and the exported workbook compute
  // the cost separately, and before nesting they could not have disagreed —
  // both used the same allowance. Now one of them could nest and the other
  // could not, which would put two prices on one wardrobe.
  const spec = wardrobeExample();
  const parts = buildParts(spec);
  const list = buildCutList(spec, parts);

  const panel = calculateCost(spec, parts, {
    sheetCounts: sheetCountsOf(list),
  });
  const exported = buildExport({ spec }).cost;

  check(
    "the studio price and the exported price are the same number",
    panel.price === exported.price,
    `${panel.price} vs ${exported.price}`,
  );

  // And it is the layout's count that both used, not the old allowance.
  const carcass = list.byBoard.find(
    (board) => board.boardId === spec.carcass.board.id,
  );
  const priced = exported.sheets.find(
    (sheet) => sheet.boardId === spec.carcass.board.id,
  );
  check(
    "the price is charged for the sheets the layout needs",
    priced?.count === carcass?.sheets,
    `${priced?.count} priced vs ${carcass?.sheets} nested`,
  );

  // The line must not claim to be an estimate once it is not one.
  const boardLine = exported.lines.find((line) =>
    line.id.startsWith("board-"),
  );
  check(
    "and no longer calls itself an estimate",
    boardLine === undefined || !/estimated/.test(boardLine.note ?? ""),
    boardLine?.note ?? "",
  );
}

{
  // The XML escape is the difference between a workbook and a repair dialog.
  // A design titled with an ampersand produced exactly that the first time an
  // SVG generator in this project met one.
  //
  // Checked inside the cell that holds the title, not across the whole file.
  // The first version of this searched the entire archive for a stray control
  // character and failed on a CRC byte that happened to be 0x07 — the check
  // was wrong, not the escaping, and a binary zip read as text will always
  // find bytes that look like anything you go looking for.
  const spec = wardrobeExample();
  spec.title = `Sara & Sons <"wardrobe"> ${String.fromCharCode(7)}`;
  const text = new TextDecoder().decode(buildExport({ spec }).workbook);

  const start = text.indexOf("Sara &amp; Sons");
  const cell = start === -1 ? "" : text.slice(start, text.indexOf("</t>", start));

  check("an ampersand in a title is escaped", start !== -1);
  check(
    "angle brackets and quotes in a title are escaped",
    cell.includes("&lt;&quot;wardrobe&quot;&gt;"),
    cell,
  );
  check(
    "a control character is stripped rather than written",
    cell.length > 0 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(cell),
    JSON.stringify(cell),
  );
  check(
    "and the raw, unescaped title never appears",
    !text.includes("Sara & Sons"),
  );
}


// ---------------------------------------------------------------------------
// Cabinets — the change that lets a design hold more than one box
// ---------------------------------------------------------------------------

{
  const kitchen = kitchenExample();
  const { parts } = buildParts(kitchen);

  check(
    "a kitchen holds six cabinets at three heights",
    kitchen.cabinets.length === 6,
    `got ${kitchen.cabinets.length}`,
  );

  // The whole point: parts come from every cabinet, not just the first.
  const cabinetsWithParts = new Set(parts.map((part) => part.cabinetId));
  check(
    "every cabinet contributes parts",
    cabinetsWithParts.size === kitchen.cabinets.length,
    `${cabinetsWithParts.size} of ${kitchen.cabinets.length}`,
  );

  check(
    "every part knows which cabinet it came from",
    parts.every((part) => typeof part.cabinetId === "string"),
  );

  // Ids are namespaced, because eight base units each have a "gable-left" and
  // two parts sharing an id would collide in the viewer and on the cut list.
  const ids = parts.map((part) => part.id);
  check(
    "part ids are unique across the whole design",
    new Set(ids).size === ids.length,
    `${ids.length - new Set(ids).size} duplicates`,
  );

  // A wall unit hangs at 1450. If the translation were dropped, its parts
  // would sit on the floor inside the base units — which is exactly what the
  // first version of this did, and it looked plausible in the elevation.
  const wall = kitchen.cabinets.find((cabinet) => cabinet.id === "wall-1")!;
  const wallParts = parts.filter((part) => part.cabinetId === "wall-1");
  const lowest = Math.min(
    ...wallParts.flatMap((part) => part.placements.map((place) => place.y)),
  );
  check(
    "a wall unit's parts are placed at its own height",
    near(lowest, wall.position.y, 1),
    `lowest part at ${Math.round(lowest)}, cabinet at ${wall.position.y}`,
  );

  // And across, not stacked on top of each other at x = 0.
  const oven = parts.filter((part) => part.cabinetId === "tall-1");
  const ovenLeft = Math.min(
    ...oven.flatMap((part) => part.placements.map((place) => place.x)),
  );
  check(
    "a cabinet further along the run is placed further along",
    near(ovenLeft, 2000, 1),
    `left edge at ${Math.round(ovenLeft)}`,
  );

  // The overall box is derived, so it has to contain everything.
  const { spec: validated } = validateSpec(kitchen);
  check(
    "the envelope spans the whole run",
    validated.envelope.width === 2600,
    `got ${validated.envelope.width}`,
  );
  check(
    "the envelope reaches the top of the tallest cabinet",
    validated.envelope.height === 2170,
    `got ${validated.envelope.height}`,
  );

  // Legs go under cabinets that stand on a plinth. Counting them across the
  // run would buy legs for the wall units, which hang.
  const { hardware } = buildParts(validated);
  const legs = hardware.find((line) => line.hardware.kind === "leg");
  const standing = validated.cabinets.filter(
    (cabinet) => cabinet.plinthHeight > 0,
  ).length;
  check(
    "legs are counted only under cabinets that stand on the floor",
    legs !== undefined && legs.quantity < 40 && standing === 4,
    `${legs?.quantity} legs for ${standing} standing cabinets`,
  );
}

{
  // Moving a cabinet must not change what anything costs. It is the same
  // carcass, a metre to the left.
  const before = kitchenExample();
  const after = kitchenExample();
  after.cabinets[0]!.position.x += 1000;
  after.cabinets[0]!.position.y += 0;

  const beforeCost = calculateCost(before, buildParts(before)).price;
  const afterCost = calculateCost(after, buildParts(after)).price;
  check(
    "moving a cabinet does not change the price",
    beforeCost === afterCost,
    `${beforeCost} vs ${afterCost}`,
  );
}

// ---------------------------------------------------------------------------
// Designs saved before cabinets existed
// ---------------------------------------------------------------------------

{
  // Every design already published on Medosha is version 1: one envelope, one
  // list of bays. They have to keep opening, and they have to produce exactly
  // the parts they produced before, or a customer's cut list has changed under
  // them without anybody touching the design.
  const modern = wardrobeExample();
  const legacy = {
    version: 1,
    kind: modern.kind,
    units: "mm",
    title: modern.title,
    envelope: { width: 2400, height: 2400, depth: 600 },
    bays: modern.cabinets[0]!.bays,
    carcass: {
      board: modern.carcass.board.id,
      backBoard: modern.carcass.backBoard.id,
      edgeBand: modern.carcass.edgeBand.id,
      plinthHeight: 100,
      doorGap: 2,
      shelfSetback: 10,
    },
    hardware: modern.hardware.map((item) => item.id),
    finish: modern.finish,
    // Copied so the comparison is of the schema change and nothing else. A
    // fixture missing the LED strip would fail this on the strip, not on the
    // upgrade, and would have been read as the upgrade being wrong.
    lighting: modern.lighting,
    meta: { style: "modern", prompt: "", assumptions: [], corrections: [] },
  };

  const revived = hydrateSpec(legacy, "a saved wardrobe");
  check("a version 1 design still opens", revived.ok, revived.ok ? "" : revived.error);

  if (revived.ok) {
    check(
      "it becomes exactly one cabinet",
      revived.spec.cabinets.length === 1,
      `got ${revived.spec.cabinets.length}`,
    );
    check(
      "the plinth moved from the carcass onto the cabinet",
      revived.spec.cabinets[0]?.plinthHeight === 100,
      `got ${revived.spec.cabinets[0]?.plinthHeight}`,
    );

    // The real test: the same design, the same parts, the same money.
    const oldParts = buildParts(revived.spec);
    const newParts = buildParts(modern);
    check(
      "it cuts the same number of parts as before",
      oldParts.totals.partCount === newParts.totals.partCount,
      `${oldParts.totals.partCount} vs ${newParts.totals.partCount}`,
    );
    check(
      "it costs what it cost before",
      calculateCost(revived.spec, oldParts).price ===
        calculateCost(modern, newParts).price,
    );
  }
}


// ---------------------------------------------------------------------------
// Starting designs — complete, not empty
// ---------------------------------------------------------------------------

{
  const kinds = [
    "kitchen",
    "wardrobe",
    "tv_unit",
    "vanity",
    "bookshelf",
    "office_storage",
    "custom",
  ] as const;

  for (const kind of kinds) {
    const spec = startingDesign(kind);
    const parts = buildParts(spec);

    check(`${kind}: opens with something in it`, parts.totals.partCount > 5, `${parts.totals.partCount} parts`);

    // A starting design that arrives already repaired reads as unreliable —
    // it is the studio telling somebody it has fixed three things it wrote
    // itself, before they have touched anything.
    check(
      `${kind}: opens with nothing to correct`,
      spec.meta.corrections.length === 0,
      spec.meta.corrections.join("; "),
    );

    check(
      `${kind}: costs something believable`,
      calculateCost(spec, parts).price > 1000,
    );

    // Cabinets must not occupy the same space. This is the invariant a layout
    // bug breaks first, and in 3D two overlapping carcasses look like one
    // slightly wrong carcass rather than like a mistake.
    for (const [i, a] of spec.cabinets.entries()) {
      for (const b of spec.cabinets.slice(i + 1)) {
        const apart =
          a.position.x + a.size.width <= b.position.x + 1 ||
          b.position.x + b.size.width <= a.position.x + 1 ||
          a.position.y + a.size.height <= b.position.y + 1 ||
          b.position.y + b.size.height <= a.position.y + 1 ||
          a.position.z + a.size.depth <= b.position.z + 1 ||
          b.position.z + b.size.depth <= a.position.z + 1;
        check(
          `${kind}: ${a.label} and ${b.label} do not overlap`,
          apart,
          `${a.label} at ${a.position.x},${a.position.y} vs ${b.label} at ${b.position.x},${b.position.y}`,
        );
      }
    }
  }
}

{
  // A kitchen has to lay out at every length somebody might have, not just at
  // the default. 1800 is a galley in a small flat; 6000 is a villa.
  for (const width of [1800, 2400, 3000, 3600, 4200, 5000, 6000]) {
    const spec = startingDesign("kitchen", { width });
    const parts = buildParts(spec);

    check(
      `kitchen ${width}: fills the run it was asked for`,
      spec.envelope.width === width,
      `got ${spec.envelope.width}`,
    );
    check(
      `kitchen ${width}: has a worktop`,
      parts.parts.some((part) => part.role === "worktop"),
    );
    check(
      `kitchen ${width}: nothing needed correcting`,
      spec.meta.corrections.length === 0,
      spec.meta.corrections.join("; "),
    );
  }

  // The worktop covers the base run and stops where a tall unit interrupts it.
  // A top that bridged the fridge housing would be a top nobody could fit.
  const spec = startingDesign("kitchen", { width: 4200 });
  const tops = buildParts(spec).parts.filter((part) => part.role === "worktop");
  const bases = spec.cabinets.filter((cabinet) => cabinet.kind === "base");
  const leftmostBase = Math.min(...bases.map((cabinet) => cabinet.position.x));

  check("the worktop starts at the first base unit", tops.length === 1 && near(tops[0]!.placements[0]!.x, leftmostBase, 1), `top at ${tops[0]?.placements[0]?.x}, base at ${leftmostBase}`);
  check(
    "and does not run over the tall units",
    leftmostBase > 0 && tops[0]!.placements[0]!.x > 0,
    `tall units end at ${leftmostBase}`,
  );

  // It sits on top of the base cabinets, not through them.
  const baseTop = Math.max(
    ...bases.map((cabinet) => cabinet.position.y + cabinet.size.height),
  );
  check(
    "the worktop sits on the cabinets",
    near(tops[0]!.placements[0]!.y, baseTop, 1),
    `top at ${tops[0]!.placements[0]!.y}, cabinets at ${baseTop}`,
  );

  check(
    "there is a splashback behind it",
    buildParts(spec).parts.some((part) => part.role === "backsplash"),
  );

  // A tall unit standing in the *middle* of a run splits the top in two.
  //
  // The starting designs put their tall units at one end, so every base run
  // they produce is contiguous — which means a worktop that happily bridged
  // gaps passed every check above. It did: breaking the split deliberately
  // changed nothing until this case existed. So the case is built by hand.
  const interrupted = startingDesign("kitchen", { width: 4200 });
  const larder = interrupted.cabinets.find(
    (cabinet) => cabinet.label === "Larder",
  )!;
  const runBases = interrupted.cabinets.filter(
    (cabinet) => cabinet.kind === "base",
  );
  const middle = runBases[Math.floor(runBases.length / 2)]!;

  // Swap the larder into the middle of the base run and push the base unit it
  // displaced out to where the larder was.
  const larderX = larder.position.x;
  larder.position.x = middle.position.x;
  larder.size.width = middle.size.width;
  middle.position.x = larderX;

  const split = buildParts(interrupted).parts.filter(
    (part) => part.role === "worktop",
  );
  check(
    "a tall unit in the middle of a run splits the worktop",
    split.length === 2,
    `${split.length} worktop(s)`,
  );
  check(
    "and neither piece runs through it",
    split.every(
      (top) =>
        top.placements[0]!.x + top.length <= larder.position.x + 1 ||
        top.placements[0]!.x >= larder.position.x + larder.size.width - 1,
    ),
    split
      .map((top) => `${top.placements[0]!.x}..${top.placements[0]!.x + top.length}`)
      .join(", "),
  );

  // And no wall unit hangs over the fridge, where nobody could open it.
  const fridge = spec.cabinets.find((cabinet) => cabinet.label === "Fridge space");
  const overFridge = spec.cabinets.filter(
    (cabinet) =>
      cabinet.kind === "wall" &&
      fridge !== undefined &&
      cabinet.position.x < fridge.position.x + fridge.size.width &&
      cabinet.position.x + cabinet.size.width > fridge.position.x,
  );
  check(
    "no wall unit hangs over the fridge",
    overFridge.length === 0,
    `${overFridge.length} wall units over it`,
  );
}


// ---------------------------------------------------------------------------
// Editing — the layout has to stay buildable
// ---------------------------------------------------------------------------

/** No two cabinets in the same row may occupy the same millimetre. */
function noOverlaps(spec: ReturnType<typeof startingDesign>): boolean {
  for (const [i, a] of spec.cabinets.entries()) {
    for (const b of spec.cabinets.slice(i + 1)) {
      if (Math.abs(a.position.y - b.position.y) >= 1) continue;
      const apart =
        a.position.x + a.size.width <= b.position.x + 1 ||
        b.position.x + b.size.width <= a.position.x + 1;
      if (!apart) return false;
    }
  }
  return true;
}

{
  const start = startingDesign("kitchen", { width: 3600 });
  const sink = start.cabinets.find((cabinet) => cabinet.label === "Sink unit")!;

  // --- Widening pushes the neighbours along ------------------------------
  const wider = resizeCabinet(start, sink.id, { width: 1000 });
  check(
    "widening a cabinet widens the design by the same amount",
    wider.envelope.width === start.envelope.width + 200,
    `${start.envelope.width} → ${wider.envelope.width}`,
  );
  check("and nothing ends up inside anything else", noOverlaps(wider));
  check(
    "and the bays are redivided to fit",
    wider.meta.corrections.length === 0,
    wider.meta.corrections.join("; "),
  );

  // The worktop follows, because it is derived rather than stored.
  const topBefore = buildParts(start).parts.find((part) => part.role === "worktop")!;
  const topAfter = buildParts(wider).parts.find((part) => part.role === "worktop")!;
  check(
    "the worktop grows with the run under it",
    topAfter.length === topBefore.length + 200,
    `${topBefore.length} → ${topAfter.length}`,
  );

  // --- Deleting closes the gap -------------------------------------------
  const gone = removeCabinet(start, sink.id);

  // The *row* closes up, not the whole design. Wall units are separate
  // cabinets screwed to a wall, and pulling them along because a cupboard
  // underneath was deleted would move something nobody asked to move. So the
  // base run shortens by 800 and the wall run stays where it was.
  const baseRunOf = (spec: ReturnType<typeof startingDesign>) => {
    const bases = spec.cabinets.filter((cabinet) => cabinet.kind === "base");
    return (
      Math.max(...bases.map((c) => c.position.x + c.size.width)) -
      Math.min(...bases.map((c) => c.position.x))
    );
  };
  check(
    "deleting a cabinet shortens its row by its width",
    baseRunOf(gone) === baseRunOf(start) - sink.size.width,
    `${baseRunOf(start)} → ${baseRunOf(gone)}`,
  );
  check("and leaves no hole in the run", noOverlaps(gone));
  check(
    "and the worktop closes up with it",
    buildParts(gone).parts.filter((part) => part.role === "worktop").length === 1,
  );

  // The last cabinet cannot go: a design with nothing in it is not a design.
  let single = startingDesign("custom");
  single = removeCabinet(single, single.cabinets[0]!.id);
  check("the last cabinet cannot be deleted", single.cabinets.length === 1);

  // --- Duplicating --------------------------------------------------------
  const twice = duplicateCabinet(start, sink.id);
  check(
    "duplicating adds one cabinet",
    twice.cabinets.length === start.cabinets.length + 1,
  );
  check("and does not overlap the original", noOverlaps(twice));

  // Ids must be fresh, or the viewer keys two cabinets the same and one of
  // them silently stops updating.
  const ids = twice.cabinets.map((cabinet) => cabinet.id);
  check("and the copy gets its own id", new Set(ids).size === ids.length);
  const bayIds = twice.cabinets.flatMap((cabinet) => cabinet.bays.map((entry) => entry.id));
  check("and its bays do too", new Set(bayIds).size === bayIds.length);

  // --- Adding -------------------------------------------------------------
  const added = addCabinet(start, { kind: "base", afterId: sink.id });
  check("adding a cabinet makes room for it", noOverlaps(added));
  check(
    "and it lands beside the one it was added to",
    added.cabinets.some(
      (cabinet) =>
        Math.abs(cabinet.position.x - (sink.position.x + sink.size.width)) < 1,
    ),
  );

  // A wall cabinet added next to a wall cabinet hangs at wall height, not on
  // the floor underneath it.
  const wall = start.cabinets.find((cabinet) => cabinet.kind === "wall")!;
  const addedWall = addCabinet(start, { kind: "wall", afterId: wall.id });
  const newWall = addedWall.cabinets.find(
    (cabinet) => !start.cabinets.some((existing) => existing.id === cabinet.id),
  )!;
  check(
    "a wall unit added beside a wall unit hangs at the same height",
    newWall.position.y === wall.position.y,
    `${newWall.position.y} vs ${wall.position.y}`,
  );

  // --- Inside a cabinet ---------------------------------------------------
  const drawered = setBayFitting(start, sink.id, sink.bays[0]!.id, {
    kind: "drawers",
    count: 3,
  });
  const drawerFronts = buildParts(drawered).parts.filter(
    (part) => part.role === "drawer_front" && part.cabinetId === sink.id,
  );
  check(
    "turning a cupboard into drawers cuts drawer fronts",
    drawerFronts.length === 3,
    `${drawerFronts.length} fronts`,
  );

  const more = adjustBayCount(drawered, sink.id, sink.bays[0]!.id, 1);
  check(
    "one more drawer is one more front",
    buildParts(more).parts.filter(
      (part) => part.role === "drawer_front" && part.cabinetId === sink.id,
    ).length === 4,
  );

  const split = addBay(start, sink.id);
  check(
    "adding a section adds a divider",
    buildParts(split).parts.filter(
      (part) => part.role === "divider" && part.cabinetId === sink.id,
    ).length === 1,
  );
  check(
    "and the sections still fill the carcass exactly",
    split.meta.corrections.length === 0,
    split.meta.corrections.join("; "),
  );

  const doorless = setBayDoor(start, sink.id, sink.bays[0]!.id, "none");
  check(
    "removing the door removes the door",
    buildParts(doorless).parts.filter(
      (part) => part.role === "door" && part.cabinetId === sink.id,
    ).length === 0,
  );

  // --- Changing what a cabinet is ----------------------------------------
  const hung = setCabinetKind(start, sink.id, "wall");
  const hungCabinet = hung.cabinets.find((cabinet) => cabinet.id === sink.id)!;
  check(
    "a base unit turned into a wall unit goes up the wall",
    hungCabinet.position.y > 0,
    `y = ${hungCabinet.position.y}`,
  );
  check(
    "and loses its plinth, because it is not standing on anything",
    hungCabinet.plinthHeight === 0,
  );

  // --- Nothing an edit does may make the design unbuildable ---------------
  let chained = start;
  chained = resizeCabinet(chained, sink.id, { width: 1200 });
  chained = addCabinet(chained, { kind: "base", afterId: sink.id });
  chained = duplicateCabinet(chained, sink.id);
  chained = adjustBayCount(chained, sink.id, sink.bays[0]!.id, 2);
  chained = removeCabinet(chained, sink.id);

  check("a run of edits leaves a buildable design", noOverlaps(chained));
  check(
    "and one that still prices",
    calculateCost(chained, buildParts(chained)).price > 0,
  );
  check(
    "and every part still has one placement per unit",
    buildParts(chained).parts.every(
      (part) => part.placements.length === part.quantity,
    ),
  );
}


// ---------------------------------------------------------------------------
// Dragging — the arithmetic behind a handle
// ---------------------------------------------------------------------------

{
  // `closestOnAxis` is what makes a drag track the pointer at any camera
  // angle. Projecting onto the axis's screen direction is the obvious
  // alternative and it is wrong off-axis: pulling the right edge of a cabinet
  // seen at forty degrees moved it at half the speed of the pointer.
  //
  // Checked here rather than in the browser because it is arithmetic, and
  // arithmetic checked through a WebGL canvas is arithmetic checked slowly.

  const origin = { x: 0, y: 0, z: 0 };
  const xAxis = { x: 1, y: 0, z: 0 };

  const t = closestOnAxis(
    { origin: { x: 2, y: 1, z: 1 }, direction: normalise({ x: 0, y: -1, z: -1 }) },
    origin,
    xAxis,
  );
  check(
    "a ray aimed at x = 2 solves to x = 2",
    Math.abs(t - 2) < 1e-6,
    `got ${t}`,
  );

  // Straight down the axis there is no unique answer, and holding still beats
  // lurching to infinity.
  const degenerate = closestOnAxis(
    { origin: { x: -5, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    origin,
    xAxis,
  );
  check("an edge-on axis does not explode", Number.isFinite(degenerate));

  // Moving a cabinet changes where it stands and nothing about what it is.
  const spec = startingDesign("kitchen", { width: 3600 });
  const sink = spec.cabinets.find((cabinet) => cabinet.label === "Sink unit")!;
  const moved = moveCabinet(spec, sink.id, { x: 2400 });
  const after = moved.cabinets.find((cabinet) => cabinet.id === sink.id)!;

  // Dragging a cabinet past its neighbours reorders the run rather than
  // leaving it standing inside one of them. So the sink ends up *after* the
  // cabinets it was dragged past, and the row closes up around it — which is
  // what somebody dragging it there meant, and is not the same as landing on
  // exactly 2400.
  const order = moved.cabinets
    .filter((cabinet) => cabinet.kind === "base")
    .sort((a, b) => a.position.x - b.position.x)
    .map((cabinet) => cabinet.label);
  check(
    "dragging a cabinet along the run reorders it",
    order.indexOf("Sink unit") > 0,
    order.join(" → "),
  );
  check(
    "and the run has no gaps left in it",
    (() => {
      const bases = moved.cabinets
        .filter((cabinet) => cabinet.kind === "base")
        .sort((a, b) => a.position.x - b.position.x);
      return bases.every(
        (cabinet, index) =>
          index === 0 ||
          Math.abs(
            bases[index - 1]!.position.x +
              bases[index - 1]!.size.width -
              cabinet.position.x,
          ) < 1,
      );
    })(),
  );
  check(
    "and changes none of its dimensions",
    after.size.width === sink.size.width &&
      after.size.height === sink.size.height &&
      after.size.depth === sink.size.depth,
  );
  // Its own parts are unchanged — it is the same carcass, somewhere else.
  const sinkPartsBefore = buildParts(spec).parts.filter(
    (part) => part.cabinetId === sink.id,
  );
  const sinkPartsAfter = buildParts(moved).parts.filter(
    (part) => part.cabinetId === sink.id,
  );
  check(
    "and cuts exactly the same parts",
    sinkPartsAfter.length === sinkPartsBefore.length &&
      sinkPartsAfter.every(
        (part, index) =>
          part.length === sinkPartsBefore[index]!.length &&
          part.width === sinkPartsBefore[index]!.width,
      ),
  );

  // And because the row closed up, the worktop over it stays one piece.
  check(
    "and the worktop over it stays in one piece",
    buildParts(moved).parts.filter((part) => part.role === "worktop").length === 1,
  );

  // Moving without the reflow is the deliberate-gap case, and it does split
  // the top — which is what a doorway or an island in the middle of a run
  // actually does.
  const parked = moveCabinet(spec, sink.id, { x: 4200 }, { reflow: false });
  check(
    "moving one out of the run on purpose splits the worktop",
    buildParts(parked).parts.filter((part) => part.role === "worktop").length > 1,
  );

  // A design with no worktop has nothing to respond, so moving changes nothing
  // at all — which is the invariant underneath both of the above.
  const wardrobe = startingDesign("wardrobe");
  const shifted = moveCabinet(wardrobe, wardrobe.cabinets[0]!.id, { x: 900 });
  check(
    "moving a lone cabinet changes neither its parts nor its price",
    buildParts(shifted).totals.partCount === buildParts(wardrobe).totals.partCount &&
      calculateCost(shifted, buildParts(shifted)).price ===
        calculateCost(wardrobe, buildParts(wardrobe)).price,
  );

  // Dragging the left edge grows the cabinet leftwards, which is a resize and
  // a move together. Doing only the resize leaves the edge under the pointer
  // running away to the right.
  const grown = moveCabinet(
    resizeCabinet(spec, sink.id, { width: 1000 }),
    sink.id,
    { x: sink.position.x + sink.size.width - 1000 },
    { reflow: false },
  );
  const leftGrown = grown.cabinets.find((cabinet) => cabinet.id === sink.id)!;
  check(
    "growing from the left keeps the right edge where it was",
    leftGrown.position.x + leftGrown.size.width ===
      sink.position.x + sink.size.width,
    `${leftGrown.position.x + leftGrown.size.width} vs ${sink.position.x + sink.size.width}`,
  );
}

/** The same solve the drag handles use, lifted out so it can be checked. */
function closestOnAxis(
  ray: { origin: Vec; direction: Vec },
  origin: Vec,
  direction: Vec,
): number {
  const w0 = sub(origin, ray.origin);
  const a = dot(direction, direction);
  const b = dot(direction, ray.direction);
  const c = dot(ray.direction, ray.direction);
  const d = dot(direction, w0);
  const e = dot(ray.direction, w0);
  const denominator = a * c - b * b;
  if (Math.abs(denominator) < 1e-9) return 0;
  return (b * e - c * d) / denominator;
}

type Vec = { x: number; y: number; z: number };
function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function normalise(v: Vec): Vec {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}


// ---------------------------------------------------------------------------
// Kitchen modules — a parts counter, not a shape editor
// ---------------------------------------------------------------------------

{
  const base = startingDesign("kitchen", { width: 3600 });
  const anchor = base.cabinets.find((cabinet) => cabinet.label === "Sink unit")!;

  for (const entry of KITCHEN_MODULES) {
    const next = addModule(base, entry.id, anchor.id);
    const added = next.cabinets.find(
      (candidate) => !base.cabinets.some((existing) => existing.id === candidate.id),
    );

    check(`${entry.label}: is added`, added !== undefined);
    if (!added) continue;

    check(
      `${entry.label}: comes out the width the trade sells it in`,
      added.size.width === entry.width,
      `${added.size.width} vs ${entry.width}`,
    );

    // A wall cupboard added while a base unit is selected belongs on the wall,
    // not on the floor under it. Getting this wrong put extractor hoods on the
    // ground beside the dishwasher.
    if (entry.kind === "wall") {
      check(
        `${entry.label}: hangs on the wall`,
        added.position.y > 1000,
        `y = ${added.position.y}`,
      );
      check(`${entry.label}: has no plinth`, added.plinthHeight === 0);
    }
    if (entry.kind === "base" || entry.kind === "tall") {
      check(`${entry.label}: stands on the floor`, added.position.y === 0);
    }

    check(
      `${entry.label}: leaves the design buildable`,
      next.meta.corrections.length === 0,
      next.meta.corrections.join("; "),
    );
    check(`${entry.label}: does not overlap anything`, noOverlaps(next));
    check(
      `${entry.label}: cuts more parts than before`,
      buildParts(next).totals.partCount > buildParts(base).totals.partCount,
    );
  }

  // The appliance openings are openings, not carcasses with doors on.
  for (const id of ["base-dishwasher", "tall-fridge", "tall-oven"]) {
    const next = addModule(base, id, anchor.id);
    const added = next.cabinets.find(
      (candidate) => !base.cabinets.some((existing) => existing.id === candidate.id),
    )!;
    check(
      `${id}: is an opening rather than a cupboard`,
      added.bays.every((bay) => bay.door === "none"),
    );
    check(
      `${id}: has no door to cut`,
      buildParts(next).parts.filter(
        (part) => part.cabinetId === added.id && part.role === "door",
      ).length === 0,
    );
  }

  // A sink unit is open below. A shelf under a sink is a shelf that gets cut
  // out on site, and a cut list that asks for one wastes a board.
  const sink = addModule(base, "base-sink", anchor.id);
  const sinkCabinet = sink.cabinets.find(
    (candidate) => !base.cabinets.some((existing) => existing.id === candidate.id),
  )!;
  check(
    "a sink unit has nothing in it",
    sinkCabinet.bays.every((bay) => bay.fitting.kind === "open"),
  );
  check(
    "and therefore no shelves on the cut list",
    buildParts(sink).parts.filter(
      (part) => part.cabinetId === sinkCabinet.id && part.role === "shelf",
    ).length === 0,
  );

  // Adding a whole kitchen's worth of modules one after another must not
  // produce something unbuildable — this is the path somebody who is enjoying
  // themselves actually takes.
  let built = startingDesign("kitchen", { width: 2400 });
  let cursor = built.cabinets[built.cabinets.length - 1]!.id;
  for (const id of [
    "base-drawers",
    "base-sink",
    "base-dishwasher",
    "tall-larder",
    "tall-oven",
    "wall-cupboard",
    "wall-extractor",
    "open-shelving",
  ]) {
    built = addModule(built, id, cursor);
    cursor = built.cabinets[built.cabinets.length - 1]!.id;
  }

  check("eight modules added in a row stay buildable", noOverlaps(built));
  check(
    "and leave nothing to correct",
    built.meta.corrections.length === 0,
    built.meta.corrections.join("; "),
  );
  check(
    "and still price",
    calculateCost(built, buildParts(built)).price > 0,
  );
  check(
    "and still cut one placement per part",
    buildParts(built).parts.every(
      (part) => part.placements.length === part.quantity,
    ),
  );
}

// ---------------------------------------------------------------------------
// Stacked module sections (Parts 5 and 6)
// ---------------------------------------------------------------------------

// The commonest wardrobe module in Ethiopia is hanging over a shelf over two
// drawers. Before `stack`, the model could say a bay was hanging *or* shelves
// *or* drawers, and this could not be described at all.
{
  const config = moduleConfig("two-drawers-shelf-hanging");
  check("the required configuration exists", config !== undefined);

  const base = startingDesign("wardrobe", { width: 1200 });
  const bay = base.cabinets[0]!.bays[0]!;

  const configured = {
    ...base,
    cabinets: [
      {
        ...base.cabinets[0]!,
        bays: [applyConfig(bay, config!)],
      },
      ...base.cabinets.slice(1),
    ],
  };

  const parts = buildParts(configured).parts;
  const inBay = parts.filter((part) => part.bayId?.startsWith(bay.id));

  // Each of the three, present and distinguishable.
  check(
    "it produces drawer fronts",
    inBay.some((part) => part.role === "drawer_front"),
  );
  check(
    "exactly two of them",
    inBay
      .filter((part) => part.role === "drawer_front")
      .reduce((total, part) => total + part.quantity, 0) === 2,
    "the configuration is named '2 drawers'",
  );
  check(
    "each with its own drawer box behind it",
    inBay.some((part) => part.role === "drawer_side") &&
      inBay.some((part) => part.role === "drawer_base"),
    "a drawer front with no box is a flat panel, not a drawer",
  );
  check("it produces a shelf", inBay.some((part) => part.role === "shelf"));

  // The vertical order the brief draws: hanging on top, shelf in the middle,
  // drawers at the bottom.
  const lowest = (role: string) =>
    Math.min(
      ...inBay
        .filter((part) => part.role === role)
        .flatMap((part) => part.placements.map((placement) => placement.y)),
    );

  const drawerY = lowest("drawer_front");
  const shelfY = lowest("shelf");

  check(
    "the drawers are below the shelf",
    drawerY < shelfY,
    `drawers at ${Math.round(drawerY)}, shelf at ${Math.round(shelfY)}`,
  );

  // Nothing may escape the bay, at either end. The floor matters as much as
  // the ceiling: sections that each take their full share *and* dividers that
  // each take their thickness add up to more than the bay, and the overflow
  // comes out of the bottom — where it is a few millimetres of drawer hanging
  // below the carcass, invisible in a render and obvious on a workshop floor.
  const bayTop = configured.cabinets[0]!.size.height;
  const bayFloor =
    configured.cabinets[0]!.plinthHeight + configured.carcass.board.thickness;

  check(
    "every part of the stack stays inside the carcass",
    inBay.every((part) =>
      part.placements.every(
        (placement) => placement.y >= 0 && placement.y + part.size.y <= bayTop + 1,
      ),
    ),
  );
  // Fittings only. The bay's back panel carries the bay's id too, and it
  // rightly reaches down past the interior floor to the plinth — it covers the
  // bottom board rather than sitting on it.
  const fittings = inBay.filter((part) => part.role !== "back");

  check(
    "nothing in the stack hangs below the carcass floor",
    fittings.every((part) =>
      part.placements.every((placement) => placement.y >= bayFloor - 1),
    ),
    `floor is ${bayFloor}, lowest fitting at ${Math.round(
      Math.min(
        ...fittings.flatMap((part) =>
          part.placements.map((placement) => placement.y),
        ),
      ),
    )}`,
  );

  // Two drawer sections in one bay must not collide in the viewer's keys or on
  // the cut list.
  const ids = inBay.map((part) => part.id);
  check("part ids in a stack are unique", ids.length === new Set(ids).size);

  // What is not behind a drawer front is behind a door. A wardrobe whose
  // hanging rail has nothing in front of it is an open shelf unit, and this
  // bay asked for a door.
  const doors = inBay.filter((part) => part.role === "door");
  check(
    "the sections without drawer fronts are behind a door",
    doors.length > 0,
    "the bay asked for a door and the drawers only cover the bottom of it",
  );

  // The door covers the hanging and the shelf, and stops above the drawers.
  // Overlapping them would be a door that cannot open.
  const drawerTop = Math.max(
    ...inBay
      .filter((part) => part.role === "drawer_front")
      .flatMap((part) =>
        part.placements.map((placement) => placement.y + part.size.y),
      ),
  );
  check(
    "the door stops above the drawer fronts",
    doors.every((part) =>
      part.placements.every((placement) => placement.y >= drawerTop - 1),
    ),
    `drawer fronts reach ${Math.round(drawerTop)}`,
  );
}

// Every drawer front stands in front of its own box.
//
// The reason this is checked rather than assumed: what is *inside* a bay and
// what is on the *front* of it are built by two different functions, and each
// has to work out where the drawer bands are. When they disagree — and they
// did, before the band arithmetic was made one shared function — the render
// looks perfectly ordinary and the fronts are screwed to the wrong boxes.
{
  const specs: [string, DesignSpec][] = [];

  const base = startingDesign("wardrobe", { width: 1200 });
  const bay = base.cabinets[0]!.bays[0]!;

  const withFitting = (fitting: Bay["fitting"]): DesignSpec => ({
    ...base,
    cabinets: [
      { ...base.cabinets[0]!, bays: [{ ...bay, fitting }] },
      ...base.cabinets.slice(1),
    ],
  });

  specs.push(["plain drawers", withFitting({ kind: "drawers", count: 4 })]);

  for (const config of MODULE_CONFIGS) {
    if (config.fitting.kind !== "stack") continue;
    specs.push([config.id, withFitting(applyConfig(bay, config).fitting)]);
  }

  // Drawers that are *not* at the bottom.
  //
  // Every configuration in the picker puts its drawers in the bottom section,
  // where the band's floor happens to equal the bay's own floor — so all of
  // them would still pass if the fronts ignored the band and were placed from
  // the bay floor. This one would not, which is the only reason it is here.
  specs.push([
    "drawers on top",
    withFitting({
      kind: "stack",
      sections: [
        { id: "top", kind: "drawers", share: 4, drawers: 3 },
        { id: "bottom", kind: "hanging", share: 6, rails: 1 },
      ],
    }),
  ]);
  specs.push([
    "drawers in the middle",
    withFitting({
      kind: "stack",
      sections: [
        { id: "top", kind: "shelves", share: 4, count: 2 },
        { id: "middle", kind: "drawers", share: 3, drawers: 2 },
        { id: "bottom", kind: "hanging", share: 6, rails: 1 },
      ],
    }),
  ]);

  for (const [label, spec] of specs) {
    const parts = buildParts(spec).parts;
    const fronts = parts.filter((part) => part.role === "drawer_front");
    const byId = new Map(parts.map((part) => [part.id, part]));

    // A front's id ends in `-front-N`; the box it belongs to ends in
    // `-drawer-N-base`. Same prefix, so the pairing is the model's own, not a
    // guess made by this check.
    const pairs = fronts.map((front) => ({
      front,
      box: byId.get(front.id.replace(/-front-(\d+)$/, "-drawer-$1-base")),
    }));

    // Boxes and fronts come in pairs or not at all. A configuration with no
    // drawers rightly has neither; one with boxes and no fronts is the bug
    // this whole block exists for.
    const boxes = parts.filter((part) => part.role === "drawer_base");

    check(
      `${label}: boxes and fronts come together`,
      (boxes.length > 0) === (fronts.length > 0),
      `${boxes.length} boxes, ${fronts.length} fronts`,
    );

    check(
      `${label}: every drawer front has a box`,
      pairs.every((pair) => pair.box !== undefined),
      `${pairs.filter((pair) => !pair.box).length} of ${pairs.length} without one`,
    );

    check(
      `${label}: each front is at its own box's height`,
      pairs.every((pair) => {
        const frontY = pair.front.placements[0]?.y;
        const boxY = pair.box?.placements[0]?.y;
        return (
          frontY !== undefined &&
          boxY !== undefined &&
          Math.abs(frontY - boxY) <= 1
        );
      }),
      "a front at a different height from its box is screwed to the wrong drawer",
    );
  }
}

// A stack is rendered by the same code that renders a plain fitting, so a
// drawer inside a stack is built exactly like a drawer anywhere else.
{
  const base = startingDesign("wardrobe", { width: 900 });
  const bay = base.cabinets[0]!.bays[0]!;

  const plain = {
    ...base,
    cabinets: [
      {
        ...base.cabinets[0]!,
        bays: [{ ...bay, fitting: { kind: "drawers" as const, count: 2 } }],
      },
    ],
  };

  const stacked = {
    ...base,
    cabinets: [
      {
        ...base.cabinets[0]!,
        bays: [
          {
            ...bay,
            fitting: {
              kind: "stack" as const,
              sections: [
                { id: "a", kind: "open" as const, share: 1 },
                { id: "b", kind: "drawers" as const, share: 1, drawers: 2 },
              ],
            },
          },
        ],
      },
    ],
  };

  const fronts = (spec: DesignSpec) =>
    buildParts(spec)
      .parts.filter((part) => part.role === "drawer_front")
      .reduce((total, part) => total + part.quantity, 0);

  check(
    "two drawers in a stack are still two drawers",
    fronts(stacked) === fronts(plain),
    `${fronts(stacked)} vs ${fronts(plain)}`,
  );
}

// Shares are normalised, so a person editing them need not make them sum to
// anything.
{
  const base = startingDesign("wardrobe", { width: 900 });
  const bay = base.cabinets[0]!.bays[0]!;

  const build = (shares: [number, number]) =>
    buildParts({
      ...base,
      cabinets: [
        {
          ...base.cabinets[0]!,
          bays: [
            {
              ...bay,
              fitting: {
                kind: "stack" as const,
                sections: [
                  { id: "top", kind: "shelves" as const, share: shares[0], count: 2 },
                  { id: "low", kind: "drawers" as const, share: shares[1], drawers: 2 },
                ],
              },
            },
          ],
        },
      ],
    }).parts;

  const heightOf = (parts: ReturnType<typeof build>) =>
    Math.min(
      ...parts
        .filter((part) => part.role === "drawer_front")
        .flatMap((part) => part.placements.map((p) => p.y)),
    );

  check(
    "shares of 1:1 and 5:5 give the same geometry",
    Math.abs(heightOf(build([1, 1])) - heightOf(build([5, 5]))) < 1,
    "they are proportions, not millimetres",
  );
  check(
    "a bigger share for the top pushes the drawers down",
    heightOf(build([3, 1])) < heightOf(build([1, 3])),
  );
}

// Every configuration in the picker has to build.
{
  const base = startingDesign("wardrobe", { width: 1200 });
  const bay = base.cabinets[0]!.bays[0]!;

  for (const config of MODULE_CONFIGS) {
    const spec = {
      ...base,
      cabinets: [
        { ...base.cabinets[0]!, bays: [applyConfig(bay, config)] },
        ...base.cabinets.slice(1),
      ],
    };

    let built = 0;
    try {
      built = buildParts(spec).parts.length;
    } catch {
      built = -1;
    }

    check(`${config.label} builds`, built > 0, `${built} parts`);
    check(
      `${config.label} is recognised by the picker`,
      matchConfig(applyConfig(bay, config))?.id === config.id,
      "otherwise the list shows nothing selected for a module it just applied",
    );
  }

  check(
    "a hand-edited module matches no preset",
    matchConfig({
      ...bay,
      fitting: { kind: "shelves", count: 17, adjustable: true },
    }) === null,
    "it is a custom module now, and saying otherwise would be a lie",
  );
}

// ---------------------------------------------------------------------------
// Legs stand under all four corners
// ---------------------------------------------------------------------------

// The reported bug: "the generated wardrobe appears to have legs/support only
// on the FRONT". It did. The geometry emitted exactly one part — a plinth board
// across the front at z = 0 — and nothing behind it.
{
  const wardrobe = startingDesign("wardrobe", { width: 2400 });
  const legs = buildParts(wardrobe).parts.filter((part) => part.role === "leg");

  check("a wardrobe stands on legs", legs.length > 0);

  const feet = legs.flatMap((part) => part.placements);
  check(
    "one placement per leg",
    feet.length === legs.reduce((total, part) => total + part.quantity, 0),
  );

  const depth = wardrobe.envelope.depth;
  const width = wardrobe.envelope.width;

  const front = feet.filter((foot) => foot.z < depth / 2);
  const back = feet.filter((foot) => foot.z >= depth / 2);

  check(
    "there are legs at the back, not only the front",
    back.length > 0,
    `${front.length} front, ${back.length} back — the reported bug was zero at the back`,
  );
  check("as many at the back as the front", front.length === back.length);

  // Near the *edges*, not merely in the half. A wide carcass also gets
  // intermediate legs, and "something in the right-hand half" is satisfied by
  // one of those — which is how a mutation removing the right-hand corner
  // legs survived the first version of this check.
  const nearEdge = 200;
  check(
    "a leg near the left edge",
    feet.some((foot) => foot.x < nearEdge),
  );
  check(
    "a leg near the right edge",
    feet.some((foot) => foot.x > width - nearEdge),
    "intermediate legs sit in from the ends; this is the corner",
  );
  check(
    "a leg near the front",
    feet.some((foot) => foot.z < nearEdge),
  );
  check(
    "a leg near the back",
    feet.some((foot) => foot.z > depth - nearEdge),
  );

  // All four corners, named the way the brief names them, and measured from
  // the corners rather than from the halves.
  const corner = (left: boolean, front: boolean) =>
    feet.some(
      (foot) =>
        (left ? foot.x < nearEdge : foot.x > width - nearEdge) &&
        (front ? foot.z < nearEdge : foot.z > depth - nearEdge),
    );

  check("front-left", corner(true, true));
  check("front-right", corner(false, true));
  check("back-left", corner(true, false));
  check("back-right", corner(false, false));

  check(
    "every leg stands on the floor",
    feet.every((foot) => foot.y === 0),
  );
  check(
    "and none pokes out past the carcass",
    feet.every((foot) => foot.x >= 0 && foot.z >= 0 && foot.x < width && foot.z < depth),
    "a leg outside the footprint is a leg holding up nothing",
  );
}

// Legs are derived from the envelope, so a resize moves them. Part 19: "legs
// reposition".
{
  const narrow = startingDesign("wardrobe", { width: 1800 });
  const wide = startingDesign("wardrobe", { width: 3000 });

  const feetOf = (spec: typeof narrow) =>
    buildParts(spec)
      .parts.filter((part) => part.role === "leg")
      .flatMap((part) => part.placements);

  const narrowFeet = feetOf(narrow);
  const wideFeet = feetOf(wide);

  // The far *corner* leg, specifically. Comparing the overall maximum was
  // satisfied by the intermediate legs, which scale with width even when the
  // corners are hard-coded — so a pinned corner survived.
  const farCorner = (feet: { x: number; z: number }[], width: number) =>
    Math.max(...feet.filter((f) => f.x > width * 0.75).map((f) => f.x));

  check(
    "a wider wardrobe puts its far corner leg further out",
    farCorner(wideFeet, 3000) > farCorner(narrowFeet, 1800),
    `${farCorner(narrowFeet, 1800)} then ${farCorner(wideFeet, 3000)}`,
  );
  check(
    "and that corner tracks the envelope, not a fixed number",
    farCorner(wideFeet, 3000) > 3000 - 200,
    "a hard-coded corner leaves the far end of a wide carcass unsupported",
  );
  check(
    "and gets more of them",
    wideFeet.length > narrowFeet.length,
    `${narrowFeet.length} then ${wideFeet.length} — a 3 m bottom panel on four legs sags`,
  );
  check(
    "the near legs stay near the corner",
    Math.min(...wideFeet.map((f) => f.x)) ===
      Math.min(...narrowFeet.map((f) => f.x)),
  );
}

// Choosing "none" is a plinth, and even that is not front-only.
{
  const wardrobe = startingDesign("wardrobe", { width: 2400 });
  const plinthed = {
    ...wardrobe,
    legs: {
      kind: "none" as const,
      height: 100,
      thickness: 50,
      inset: 35,
      material: "White",
    },
  };

  const parts = buildParts(plinthed).parts;
  const plinths = parts.filter((part) => part.role === "plinth");

  check("choosing no legs gives a plinth", plinths.length > 0);
  check("and no legs", parts.every((part) => part.role !== "leg"));
  check(
    "the plinth wraps the sides too",
    plinths.some((part) => /side/i.test(part.label)),
    "a wardrobe with a floating side edge looks unfinished from every angle but one",
  );
}

// The cut list and the BOQ follow, because they are built from the parts.
{
  const wardrobe = startingDesign("wardrobe", { width: 2400 });
  const cutList = buildCutList(wardrobe, buildParts(wardrobe));

  check(
    "legs reach the cut list",
    cutList.rows.some((row) => /leg/i.test(row.label)),
    "a leg that is drawn but not listed is a leg the shop does not order",
  );
}

// The viewer draws them in their own colour. A leg tinted with the wardrobe's
// white disappears into the floor, which looks exactly like the reported bug
// even once the geometry is right.
{
  const source = readFileSync(
    "src/features/berchuma-studio/components/viewer/model.tsx",
    "utf8",
  );
  check(
    "the viewer has a colour for a leg",
    /case "leg":/.test(source),
  );
  check(
    "and it is not a tint of the body",
    !/case "leg":\s*\n\s*return base/.test(source),
  );
}

// The flat elevation is the third thing that has to know where a stack's
// bands are — after the interior and the fronts — and it is the one nobody can
// check by running it, because it is a React component drawn as SVG.
//
// So the check is that it does not have its own copy of the arithmetic. A
// drawing that put the shelf 40 mm from where the cut list puts it is two
// drawings of two different wardrobes, and the one that gets built is
// whichever the joiner opened.
{
  const source = readFileSync(
    "src/features/berchuma-studio/components/viewer/elevation.tsx",
    "utf8",
  );

  // Call syntax, not the bare name: the word appears in the import line and in
  // the comments either way, so matching the identifier alone would pass on a
  // file that imported it and never used it.
  check(
    "the elevation asks the geometry service where the bands are",
    /sectionBands\(/.test(source),
  );
  check(
    "and does not divide the shares itself",
    !/\.share\s*\//.test(source) && !/totalShare/.test(source),
    "a second copy of the band arithmetic is a drawing that can drift from the cut list",
  );
  check(
    "and builds each band's contents from the same fitting the geometry uses",
    /sectionFitting\(/.test(source),
  );
}



// ---------------------------------------------------------------------------
// Editing one drawer (Parts 9-14)
// ---------------------------------------------------------------------------

// The spec has carried `frontHeights` since the beginning and nothing in the
// studio ever wrote it, so every chest of drawers Medosha produced was equal
// fronts. A real one is not: the bottom drawer is deeper, because that is where
// the jumpers go.
{
  const base = startingDesign("wardrobe", { width: 900 });
  const cabinet = base.cabinets[0]!;
  const bay = cabinet.bays[0]!;

  const withDrawers: DesignSpec = {
    ...base,
    cabinets: [
      {
        ...cabinet,
        bays: [{ ...bay, fitting: { kind: "drawers", count: 4 } }],
      },
      ...base.cabinets.slice(1),
    ],
  };

  const opening = openingHeightOf(
    withDrawers.cabinets[0]!,
    withDrawers.carcass.board.thickness,
  );

  const heightsOf = (spec: DesignSpec): number[] => {
    const fitting = spec.cabinets[0]!.bays[0]!.fitting;
    return fitting.kind === "drawers" ? frontHeightsOf(fitting, opening) : [];
  };

  const countOf = (spec: DesignSpec): number => {
    const fitting = spec.cabinets[0]!.bays[0]!.fitting;
    return fitting.kind === "drawers" ? fitting.count : 0;
  };

  /** The fronts as the geometry actually draws them, top to bottom. */
  const drawnFronts = (spec: DesignSpec) =>
    buildParts(spec)
      .parts.filter((part) => part.role === "drawer_front")
      .flatMap((part) =>
        part.placements.map((placement) => ({
          y: placement.y,
          height: part.size.y,
        })),
      )
      .sort((a, b) => b.y - a.y);

  check(
    "a bay of four drawers starts equal",
    new Set(heightsOf(withDrawers)).size === 1,
    heightsOf(withDrawers).join(", "),
  );

  // ---- Setting a height ---------------------------------------------------

  const deepBottom = setDrawerHeight(withDrawers, cabinet.id, bay.id, 3, 600);
  const after = heightsOf(deepBottom);

  check(
    "setting one drawer's height changes it",
    (after[3] ?? 0) > (after[0] ?? 0),
    after.join(", "),
  );
  check(
    "and the others give way rather than the bay growing",
    Math.abs(after.reduce((sum, height) => sum + height, 0) - opening) <= 2,
    `${after.reduce((sum, height) => sum + height, 0)} vs opening ${opening}`,
  );
  check(
    "and the change reaches the geometry",
    (() => {
      const drawn = drawnFronts(deepBottom);
      const bottom = drawn[drawn.length - 1];
      const top = drawn[0];
      return (
        bottom !== undefined && top !== undefined && bottom.height > top.height
      );
    })(),
    "a number in the spec that the parts do not read is a control that does nothing",
  );

  // A floor, not a free number. A 40 mm front is a mistake, not a design.
  const tiny = setDrawerHeight(withDrawers, cabinet.id, bay.id, 0, 20);
  check(
    "a drawer front cannot be made absurdly short",
    (heightsOf(tiny)[0] ?? 0) >= 60,
    `${heightsOf(tiny)[0]} mm`,
  );

  // ---- Add, remove, duplicate --------------------------------------------

  const five = addDrawer(withDrawers, cabinet.id, bay.id, 1);
  check("adding a drawer raises the count", countOf(five) === 5);
  check(
    "and the fronts still fill the opening",
    Math.abs(heightsOf(five).reduce((sum, h) => sum + h, 0) - opening) <= 2,
  );
  check(
    "and the geometry draws five",
    drawnFronts(five).length === 5,
    `${drawnFronts(five).length} drawn`,
  );

  const three = removeDrawer(withDrawers, cabinet.id, bay.id, 0);
  check("removing a drawer lowers the count", countOf(three) === 3);
  check(
    "and the space goes back to the others",
    Math.abs(heightsOf(three).reduce((sum, h) => sum + h, 0) - opening) <= 2,
  );

  // The floor: one drawer is a chest of drawers, none is a hole in the front.
  let stripped = withDrawers;
  for (let i = 0; i < 10; i += 1) {
    stripped = removeDrawer(stripped, cabinet.id, bay.id, 0);
  }
  check(
    "the last drawer cannot be removed",
    countOf(stripped) === 1,
    `${countOf(stripped)} left`,
  );

  // And the ceiling.
  let piled = withDrawers;
  for (let i = 0; i < 12; i += 1) {
    piled = addDrawer(piled, cabinet.id, bay.id);
  }
  check(
    "drawers stop at the schema's maximum",
    countOf(piled) === 8,
    `${countOf(piled)}`,
  );

  // Duplicated from the *middle*, deliberately. Copying the last drawer cannot
  // tell "insert below the original" from "append to the end" — they are the
  // same position — so the check would pass on either.
  const tallTop = setDrawerHeight(withDrawers, cabinet.id, bay.id, 0, 700);
  const duplicated = duplicateDrawer(tallTop, cabinet.id, bay.id, 0);
  check("duplicating a drawer raises the count", countOf(duplicated) === 5);

  const copies = heightsOf(duplicated);
  check(
    "and the copy sits directly below its original",
    Math.abs((copies[0] ?? 0) - (copies[1] ?? 0)) <= 2 &&
      (copies[0] ?? 0) > (copies[2] ?? 0),
    copies.join(", "),
  );
  check(
    "and it did not land at the bottom of the stack",
    Math.abs((copies[0] ?? 0) - (copies[4] ?? 0)) > 2,
    copies.join(", "),
  );

  // ---- Moving -------------------------------------------------------------

  const moved = moveDrawer(deepBottom, cabinet.id, bay.id, 3, -1);
  const movedHeights = heightsOf(moved);
  check(
    "moving a drawer up carries its height with it",
    (movedHeights[2] ?? 0) > (movedHeights[3] ?? 0),
    movedHeights.join(", "),
    );
  check(
    "moving past the top does nothing",
    heightsOf(moveDrawer(deepBottom, cabinet.id, bay.id, 0, -1)).join() ===
      heightsOf(deepBottom).join(),
  );
  check(
    "moving past the bottom does nothing",
    heightsOf(moveDrawer(deepBottom, cabinet.id, bay.id, 3, 1)).join() ===
      heightsOf(deepBottom).join(),
  );

  // ---- Resetting ----------------------------------------------------------

  check(
    "a bay with edited fronts says so",
    hasCustomFronts(deepBottom, cabinet.id, bay.id),
  );
  const evened = evenDrawers(deepBottom, cabinet.id, bay.id);
  check(
    "evening them out clears the custom heights",
    !hasCustomFronts(evened, cabinet.id, bay.id),
    "writing equal numbers instead would look the same until the bay was resized",
  );
  check(
    "and the fronts are equal again",
    new Set(heightsOf(evened)).size === 1,
  );

  // ---- Nothing escapes ----------------------------------------------------

  // The property that matters when somebody drags a slider: whatever they do,
  // the fronts still tile the opening without overlapping or leaving a gap.
  const stress = [
    setDrawerHeight(withDrawers, cabinet.id, bay.id, 0, 900),
    setDrawerHeight(withDrawers, cabinet.id, bay.id, 2, 1500),
    addDrawer(setDrawerHeight(withDrawers, cabinet.id, bay.id, 1, 700), cabinet.id, bay.id, 0),
    removeDrawer(setDrawerHeight(withDrawers, cabinet.id, bay.id, 3, 800), cabinet.id, bay.id, 1),
  ];

  for (const [index, spec] of stress.entries()) {
    const drawn = drawnFronts(spec);
    const overlapping = drawn.some((front, i) => {
      const below = drawn[i + 1];
      // Top of the one below must not pass the bottom of this one. The gap
      // between fronts is 3 mm, so a couple of mm of slack is expected.
      return below !== undefined && below.y + below.height > front.y + 1;
    });
    check(`stress ${index + 1}: no two fronts overlap`, !overlapping);

    const top = drawn[0];
    const bottom = drawn[drawn.length - 1];
    check(
      `stress ${index + 1}: the fronts fill the opening`,
      top !== undefined &&
        bottom !== undefined &&
        top.y + top.height - bottom.y > opening - 40,
      "a chest of drawers with a strip of carcass showing is one nobody accepts",
    );
  }
}

// ---------------------------------------------------------------------------
// The hanging rail is a thing, not a gap (Part 16)
// ---------------------------------------------------------------------------

// The geometry drew a shelf and stopped. So a wardrobe rendered with an empty
// space where the rail goes, and the module the brief asks for by name — 2
// drawers, a shelf, and hanging above it — had its largest section render as
// nothing at all. Every check passed, because every check was about shelves and
// drawers.
{
  const base = startingDesign("wardrobe", { width: 1200 });
  const bay = base.cabinets[0]!.bays[0]!;

  const withFitting = (fitting: Bay["fitting"]): DesignSpec => ({
    ...base,
    cabinets: [
      { ...base.cabinets[0]!, bays: [{ ...bay, fitting }] },
      ...base.cabinets.slice(1),
    ],
  });

  const single = buildParts(
    withFitting({ kind: "hanging", rails: 1, shelfAbove: true }),
  );
  const rails = single.parts.filter((part) => part.role === "rail");

  check("a hanging bay produces a rail", rails.length > 0);
  check(
    "one rail for a single-rail bay",
    rails.reduce((total, part) => total + part.quantity, 0) === 1,
  );

  const double = buildParts(
    withFitting({ kind: "hanging", rails: 2, shelfAbove: true }),
  );
  check(
    "double hanging produces two rails",
    double.parts
      .filter((part) => part.role === "rail")
      .reduce((total, part) => total + part.quantity, 0) === 2,
  );

  // The rail hangs from its shelf. Two parts drawn from two ideas of the same
  // height is a rail floating in the middle of an opening.
  const railY = Math.min(
    ...rails.flatMap((part) => part.placements.map((p) => p.y)),
  );
  const shelfY = Math.min(
    ...single.parts
      .filter((part) => part.role === "shelf")
      .flatMap((part) => part.placements.map((p) => p.y)),
  );
  check(
    "the rail hangs below its shelf",
    railY < shelfY,
    `rail at ${Math.round(railY)}, shelf at ${Math.round(shelfY)}`,
  );
  check(
    "and close under it, not halfway down the bay",
    shelfY - railY < 120,
    `${Math.round(shelfY - railY)} mm below`,
  );

  // It must fit inside the bay it belongs to.
  check(
    "the rail is narrower than its bay",
    rails.every((part) => part.length < bay.width),
    "a rail the full width of the opening has nowhere for its sockets",
  );

  // A rail is bought tube, not a panel cut from a sheet. The existing invariant
  // suite would otherwise treat it as board and put it in the nesting.
  const cutList = buildCutList(
    withFitting({ kind: "hanging", rails: 1, shelfAbove: true }),
    single,
  );
  check(
    "the rail reaches the cut list",
    cutList.rows.some((row) => /rail/i.test(row.label)),
    "the shop has to buy it",
  );
}

// A rail inside a stacked section, which is where the quote silently lost it.
{
  const base = startingDesign("wardrobe", { width: 1200 });
  const bay = base.cabinets[0]!.bays[0]!;
  const config = moduleConfig("two-drawers-shelf-hanging")!;

  const spec: DesignSpec = {
    ...base,
    cabinets: [
      { ...base.cabinets[0]!, bays: [applyConfig(bay, config)] },
      ...base.cabinets.slice(1),
    ],
  };

  const built = buildParts(spec);
  const rails = built.parts.filter((part) => part.role === "rail");

  check(
    "the required module has a rail",
    rails.length > 0,
    "hanging is its largest section; without a rail it renders as empty space",
  );

  // The rail must be in the hanging band, not floating through the drawers.
  const railY = Math.min(
    ...rails.flatMap((part) => part.placements.map((p) => p.y)),
  );
  const drawerTop = Math.max(
    ...built.parts
      .filter((part) => part.role === "drawer_front")
      .flatMap((part) => part.placements.map((p) => p.y + part.size.y)),
  );
  check(
    "and it is above the drawers",
    railY > drawerTop,
    `rail at ${Math.round(railY)}, drawers reach ${Math.round(drawerTop)}`,
  );

  const shelves = built.parts
    .filter((part) => part.role === "shelf")
    .flatMap((part) => part.placements.map((p) => p.y));
  check(
    "and above the shelf it hangs over",
    railY > Math.min(...shelves),
    "the hanging section is the top one",
  );

  // The precise one, and the reason it is worth stating precisely.
  //
  // A rail placed at a *fraction* of its band rather than at the top of it is
  // still above the drawers and still fits a coat, so every looser check passes
  // — and the wardrobe quietly loses 200 mm of the section that exists for
  // nothing but hanging. A hanging section has no shelf of its own, so its
  // ceiling is the divider above it; for the top section that is the carcass
  // interior top, and the rail hangs one socket-drop below it.
  const ceiling =
    spec.cabinets[0]!.size.height - spec.carcass.board.thickness;
  check(
    "the rail hangs from the top of its section, not a fraction down it",
    Math.abs(ceiling - railY - 45) < 2,
    `${Math.round(ceiling - railY)} mm below the ceiling; the socket drop is 45`,
  );

  // The bug that hid: the rail hardware line filtered on `fitting.kind ===
  // "hanging"`, so a stacked bay — whose kind is "stack" — was quoted no rail
  // at all. The commonest wardrobe in Ethiopia came with a rail nobody priced.
  const railLine = built.hardware.find((line) =>
    /rail/i.test(line.hardware.kind) || /rail/i.test(line.hardware.label ?? ""),
  );
  check(
    "the rail in a stack is priced",
    railLine !== undefined && railLine.quantity > 0,
    `quoted ${railLine?.quantity ?? 0} m`,
  );

  // Derived from the parts rather than from the spec, which is what makes the
  // class of bug impossible rather than fixed once.
  const metres = rails.reduce(
    (total, part) => total + (part.length / 1000) * part.quantity,
    0,
  );
  check(
    "and the metres match the rails that were drawn",
    railLine !== undefined && Math.abs(railLine.quantity - metres) < 0.02,
    `${railLine?.quantity ?? 0} quoted vs ${metres.toFixed(2)} drawn`,
  );
}

// ---------------------------------------------------------------------------
// Notes and assumptions are safe to render
// ---------------------------------------------------------------------------

// A reported bug: the cut list rendered `notes.map((note) => <li key={note}>)`
// and React refused two children with the key "Scaled proportionally to fit."
//
// The cause was upstream. The validator emits one repair note per affected
// cabinet, and four of its corrections were generic sentences with no cabinet
// name in them — so a kitchen with ten cabinets whose bay widths were all
// slightly out produced the same sentence ten times. That is a bad note as well
// as a duplicate key: it tells the reader nothing about which cabinet.
{
  const base = startingDesign("kitchen", { width: 3600 });

  const skewed = {
    ...base,
    meta: { ...base.meta, corrections: [] },
    cabinets: base.cabinets.map((cabinet) => ({
      ...cabinet,
      bays: cabinet.bays.map((bay) => ({ ...bay, width: bay.width - 40 })),
    })),
  };

  const repaired = validateSpec(skewed).spec;
  const corrections = repaired.meta.corrections;

  check(
    "a design needing the same repair in many cabinets is reported once each",
    corrections.length === new Set(corrections).size,
    `${corrections.length - new Set(corrections).size} duplicates: ${corrections.join(" | ")}`,
  );

  check(
    "and every correction names what it corrected",
    corrections.every((line) => /:/.test(line)),
    corrections.join(" | "),
  );

  const cutList = buildCutList(repaired, buildParts(repaired));
  check(
    "so the cut list's notes are unique",
    cutList.notes.length === new Set(cutList.notes).size,
    "these are rendered as a list and were keyed on their own text",
  );
}

// The lists themselves, keyed defensively. Free-text arrays have no id in the
// data model, so position is what makes the key unique — and a check on the
// source is what stops the next person reintroducing `key={note}`.
{
  const lists: [string, RegExp][] = [
    ["src/app/designs/[slug]/cut-list/page.tsx", /key=\{`\$\{index\}-\$\{note\}`\}/],
    ["src/app/designs/[slug]/page.tsx", /key=\{`\$\{index\}-\$\{line\}`\}/],
    [
      "src/features/berchuma-studio/components/pricing/cost-panel.tsx",
      /key=\{`\$\{index\}-\$\{line\}`\}/,
    ],
  ];

  for (const [file, pattern] of lists) {
    const source = readFileSync(file, "utf8");
    check(`${file} keys its notes by position`, pattern.test(source));
    check(
      `${file} does not key on the text alone`,
      !/key=\{(note|line|item)\}/.test(source),
      "two identical sentences would collide",
    );
  }
}

// ---------------------------------------------------------------------------

console.log(`\n${DIM}Berchuma core${RESET}`);
console.log(`${DIM}${"─".repeat(50)}${RESET}`);

if (failures.length === 0) {
  console.log(`${GREEN}✓ ${passed} checks passed.${RESET}`);
  console.log(
    `${DIM}Geometry, costing and the cut list agree with the worked examples.${RESET}\n`,
  );
} else {
  console.log(`${GREEN}✓ ${passed} passed${RESET}`);
  console.log(`${RED}✗ ${failures.length} failed:${RESET}\n`);
  for (const failure of failures) console.log(`  ${RED}·${RESET} ${failure}`);
  console.log("");
  process.exit(1);
}
