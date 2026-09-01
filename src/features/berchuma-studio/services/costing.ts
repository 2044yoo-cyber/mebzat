import {
  DEFAULT_SHOP_RATES,
  type CostBreakdown,
  type CostGroup,
  type CostLine,
  type MarketRate,
  type ShopRates,
} from "../types/cost";
import type { PartsBreakdown } from "../types/parts";
import type { DesignSpec } from "../types/spec";

/**
 * What the thing costs.
 *
 * Pure arithmetic over the parts list and a set of rates. No fetching, no
 * clock, no rounding until the very end — which is what lets the browser
 * re-run it on every frame of a width drag and get the same answer the server
 * will get when the job goes to the shop.
 *
 * The design decision worth defending: rates come in as an argument rather
 * than being looked up in here. It makes the function testable, it makes the
 * client able to recompute without a round trip, and it forces the caller to
 * be explicit about where the numbers came from — which is what makes
 * `confidence` meaningful rather than decorative.
 */

export function calculateCost(
  spec: DesignSpec,
  breakdown: PartsBreakdown,
  options: {
    rates?: MarketRate[];
    shop?: Partial<ShopRates>;
    currency?: string;
    /**
     * Sheets per board id, from a real nesting. Supplied by every caller that
     * has already laid the parts out; without it this falls back to the
     * area-plus-allowance estimate, which is what the note on each line says.
     */
    sheetCounts?: Record<string, number>;
  } = {},
): CostBreakdown {
  const shop: ShopRates = { ...DEFAULT_SHOP_RATES, ...options.shop };
  const currency = options.currency ?? "ETB";
  const rates = options.rates ?? [];
  const lines: CostLine[] = [];
  const assumptions: string[] = [];

  /** Live rate for a price key, or the material's own fallback. */
  const rateFor = (key: string, fallback: number) => {
    const match = rates.find(
      (rate) => rate.key.toLowerCase() === key.toLowerCase(),
    );
    if (match) {
      return {
        amount: match.amount,
        source: "listing" as const,
        listingId: match.listingId,
      };
    }
    return { amount: fallback, source: "fallback" as const };
  };

  // ---- Board -------------------------------------------------------------
  // Priced by the sheet, not by the square metre, because that is how it is
  // bought: half a sheet left over is still a sheet paid for.
  const sheets: CostBreakdown["sheets"] = [];
  const boards = collectBoards(spec);

  for (const [boardId, area] of Object.entries(breakdown.totals.areaByBoard)) {
    const board = boards.get(boardId);
    if (!board) continue;

    const sheetArea = (board.sheet.length * board.sheet.width) / 1_000_000;

    // The real count when the caller has nested the parts, and an estimate
    // only when nobody has. The estimate is area plus a flat allowance, which
    // is wrong in the direction that costs money: a 2300 × 803 back panel uses
    // 62% of a sheet and no second one will fit beside it, so three of them
    // are three sheets however the arithmetic averages out. On the worked
    // wardrobe the allowance said three and the layout needs four.
    const nested = options.sheetCounts?.[boardId];
    const count =
      nested ?? Math.max(1, Math.ceil((area * (1 + shop.wastePercent / 100)) / sheetArea));
    const utilisation = count > 0 ? area / (count * sheetArea) : 0;

    const rate = rateFor(board.priceKey, board.fallbackRate);
    lines.push({
      id: `board-${boardId}`,
      group: "material",
      label: board.label,
      quantity: count,
      unit: "sheet",
      rate: rate.amount,
      amount: count * rate.amount,
      source: rate.source,
      listingId: rate.listingId,
      note:
        `${area.toFixed(2)} m² of parts, ${(utilisation * 100).toFixed(0)}% of the sheets used` +
        (nested === undefined ? " (sheet count estimated)" : ""),
    });

    sheets.push({
      boardId,
      label: board.label,
      count,
      utilisation: round(utilisation, 3),
    });
  }

  // ---- Edge band ---------------------------------------------------------
  const bands = collectBands(spec);
  for (const [bandId, metres] of Object.entries(breakdown.totals.bandByEdge)) {
    const band = bands.get(bandId);
    if (!band) continue;
    const rate = rateFor(band.priceKey, band.fallbackRate);
    lines.push({
      id: `band-${bandId}`,
      group: "edge_band",
      label: band.label,
      quantity: round(metres, 1),
      unit: "m",
      rate: rate.amount,
      amount: metres * rate.amount,
      source: rate.source,
      listingId: rate.listingId,
    });
  }

  // ---- Hardware ----------------------------------------------------------
  for (const line of breakdown.hardware) {
    const rate = rateFor(line.hardware.priceKey, line.hardware.fallbackRate);
    lines.push({
      id: `hardware-${line.hardware.id}`,
      group: "hardware",
      label: line.hardware.label,
      quantity: line.quantity,
      unit: line.hardware.unit,
      rate: rate.amount,
      amount: line.quantity * rate.amount,
      source: rate.source,
      listingId: rate.listingId,
      note: line.note,
    });
  }

  // ---- Lighting ----------------------------------------------------------
  if (spec.lighting?.ledStrip) {
    // A strip runs the width of the unit unless the spec says otherwise.
    const metres =
      spec.lighting.metres ?? round(spec.envelope.width / 1000, 2);
    const strip = spec.hardware.find((item) => item.id === "led-strip");
    const fallback = strip?.fallbackRate ?? 260;
    const rate = rateFor(strip?.priceKey ?? "LED strip warm white", fallback);
    lines.push({
      id: "lighting-led",
      group: "hardware",
      label: `LED strip, ${spec.lighting.colourTemperature}K`,
      quantity: metres,
      unit: "m",
      rate: rate.amount,
      amount: metres * rate.amount,
      source: rate.source,
      listingId: rate.listingId,
    });
  }

  // ---- Labour ------------------------------------------------------------
  // Minutes per operation rather than a flat percentage of materials, because
  // a unit with twelve drawers and one with none use the same board and
  // nothing like the same time.
  const doorLeaves = breakdown.parts
    .filter((part) => part.role === "door")
    .reduce((total, part) => total + part.quantity, 0);
  const drawers = breakdown.parts.filter(
    (part) => part.role === "drawer_front",
  ).length;

  const minutes =
    breakdown.totals.partCount * shop.minutesPerPart +
    doorLeaves * shop.minutesPerDoor +
    drawers * shop.minutesPerDrawer;

  const personHours = minutes / 60;
  const personDays = personHours / shop.hoursPerDay;

  lines.push({
    id: "labour-shop",
    group: "labour",
    label: "Shop labour",
    quantity: round(personDays, 2),
    unit: "person-day",
    rate: shop.labourDayRate,
    amount: personDays * shop.labourDayRate,
    source: "fallback",
    note: `${breakdown.totals.partCount} parts, ${doorLeaves} doors, ${drawers} drawers`,
  });

  // ---- Finishing ---------------------------------------------------------
  // Zero for melamine and foil, which arrive finished. Only sprayed work bills
  // here, and the rate defaults to zero so nobody is charged for it silently.
  if (shop.finishingRatePerSqm > 0) {
    const area = Object.values(breakdown.totals.areaByBoard).reduce(
      (total, value) => total + value,
      0,
    );
    lines.push({
      id: "finishing",
      group: "finishing",
      label: `Spray finish, ${spec.finish.sheen}`,
      quantity: round(area, 2),
      unit: "m²",
      rate: shop.finishingRatePerSqm,
      amount: area * shop.finishingRatePerSqm,
      source: "fallback",
    });
  }

  // ---- Subtotals ---------------------------------------------------------
  const subtotals = emptySubtotals();
  for (const line of lines) {
    subtotals[line.group] += line.amount;
  }

  // Installation is a share of what has been costed so far, which is how
  // fitters actually quote it.
  const beforeInstall =
    subtotals.material +
    subtotals.edge_band +
    subtotals.hardware +
    subtotals.labour +
    subtotals.finishing;

  if (shop.installationPercent > 0) {
    const amount = beforeInstall * (shop.installationPercent / 100);
    lines.push({
      id: "installation",
      group: "installation",
      label: "Delivery and fitting on site",
      quantity: 1,
      unit: "job",
      rate: amount,
      amount,
      source: "fallback",
      note: `${shop.installationPercent}% of production cost`,
    });
    subtotals.installation = amount;
  }

  if (shop.transportFlat > 0) {
    lines.push({
      id: "transport",
      group: "transport",
      label: "Transport",
      quantity: 1,
      unit: "trip",
      rate: shop.transportFlat,
      amount: shop.transportFlat,
      source: "fallback",
    });
    subtotals.transport = shop.transportFlat;
  }

  const directCost = Object.values(subtotals).reduce((a, b) => a + b, 0);

  // Waste is already inside the sheet count; this line is the *visible*
  // statement of it, not a second charge. Charging it twice is the classic way
  // a generated quote comes out 15% high.
  const wasteAmount = 0;

  const productionCost = directCost + wasteAmount;
  const marginAmount = productionCost * (shop.marginPercent / 100);

  // ---- Confidence --------------------------------------------------------
  // Weighted by money, not by line count: one guessed board rate matters more
  // than four guessed pin rates.
  const priced = lines.filter((line) => line.source === "listing");
  const pricedAmount = priced.reduce((total, line) => total + line.amount, 0);
  const rateableAmount = lines
    .filter((line) => line.group !== "labour" && line.group !== "installation")
    .reduce((total, line) => total + line.amount, 0);
  const confidence =
    rateableAmount > 0 ? (pricedAmount / rateableAmount) * 100 : 0;

  if (priced.length === 0) {
    assumptions.push(
      "No supplier listing matched these materials, so every rate is an indicative fallback.",
    );
  } else if (confidence < 60) {
    assumptions.push(
      `${Math.round(confidence)}% of the material cost is priced from live listings; the rest uses fallback rates.`,
    );
  }

  if (!options.shop) {
    assumptions.push(
      `Shop rates are Medosha defaults — ETB ${shop.labourDayRate}/day, ${shop.marginPercent}% margin, ${shop.wastePercent}% waste.`,
    );
  }

  assumptions.push(
    `Sheet count assumes ${shop.wastePercent}% offcut; real nesting will change it.`,
  );

  return {
    currency,
    lines: lines.map((line) => ({
      ...line,
      rate: round(line.rate, 2),
      amount: round(line.amount, 2),
    })),
    subtotals: mapValues(subtotals, (value) => round(value, 2)),
    directCost: round(directCost, 2),
    waste: { percent: shop.wastePercent, amount: wasteAmount },
    productionCost: round(productionCost, 2),
    margin: { percent: shop.marginPercent, amount: round(marginAmount, 2) },
    price: round(productionCost + marginAmount, 2),
    sheets,
    // Calendar days, so a crew of two halves the wait but not the bill.
    productionDays: round(personDays / Math.max(1, shop.crewSize), 1),
    confidence: round(confidence, 1),
    assumptions,
  };
}

// ---------------------------------------------------------------------------

function collectBoards(spec: DesignSpec) {
  const map = new Map<string, DesignSpec["carcass"]["board"]>();
  map.set(spec.carcass.board.id, spec.carcass.board);
  map.set(spec.carcass.backBoard.id, spec.carcass.backBoard);
  return map;
}

function collectBands(spec: DesignSpec) {
  const map = new Map<string, DesignSpec["carcass"]["edgeBand"]>();
  map.set(spec.carcass.edgeBand.id, spec.carcass.edgeBand);
  return map;
}

function emptySubtotals(): Record<CostGroup, number> {
  return {
    material: 0,
    edge_band: 0,
    hardware: 0,
    labour: 0,
    finishing: 0,
    installation: 0,
    transport: 0,
  };
}

function mapValues<K extends string>(
  input: Record<K, number>,
  fn: (value: number) => number,
): Record<K, number> {
  const output = {} as Record<K, number>;
  for (const key of Object.keys(input) as K[]) output[key] = fn(input[key]);
  return output;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
