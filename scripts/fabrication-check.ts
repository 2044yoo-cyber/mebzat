/**
 * The fabrication engine — the arithmetic a workshop is billed on.
 *
 *   npm run check:fabrication
 *
 * One calculation matters more than the rest here and it is checked from every
 * angle: **how many bars, and what do they cost.** Getting it wrong is not a
 * rounding error, it is a quotation that is out by a factor of four.
 *
 *   18.5 m of profile, 6 m bars at ETB 4,000
 *   Wrong:  18.5 × 4,000 = ETB 74,000
 *   Right:      4 × 4,000 = ETB 16,000
 *
 * And "4" is not 18.5 ÷ 6 rounded up either. Whether eighteen and a half metres
 * is three bars or four depends entirely on the lengths of the pieces, which is
 * why this packs them rather than dividing.
 *
 * Pure functions, no database, no network.
 */

import {
  costLinear,
  packLinear,
  DEFAULT_KERF_MM,
  STOCK_LENGTHS_MM,
  type LinearPiece,
} from "../src/features/berchuma-studio/services/linear-stock.ts";
import {
  buildOpening,
  glazingRatio,
} from "../src/features/berchuma-studio/services/openings.ts";
import { defaultOpening } from "../src/features/berchuma-studio/types/openings.ts";
import {
  averageMarketPrice,
  costLine,
  normaliseUnit,
  resolvePrice,
  type PriceCandidate,
} from "../src/lib/pricing/resolve.ts";

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const RESET = "[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const only = (pieces: LinearPiece[], options = {}) => {
  const [stock] = packLinear(pieces, options);
  if (!stock) throw new Error("nothing packed");
  return stock;
};

const profile = (length: number, quantity: number, label = "piece"): LinearPiece => ({
  profileId: "alu-40",
  profileLabel: "40 × 40 aluminium",
  length,
  quantity,
  label,
});

// ---------------------------------------------------------------------------
// 1. The calculation from the brief
// ---------------------------------------------------------------------------

// Ten pieces of 1.85 m is 18.5 m exactly. Three fit a 6 m bar (5.55 m plus two
// kerfs), so ten pieces need four bars.
const brief = only([profile(1850, 10, "mullion")], { stockLengths: [6000] });

check("18.5 m of profile is 18.5 m", brief.requiredMetres === 18.5, `${brief.requiredMetres}`);
check("and it is four 6 m bars", brief.bars === 4, `${brief.bars} bars`);

const barPriced = costLinear(brief, 4000, "bar");
check(
  "priced per bar, that is ETB 16,000",
  barPriced.total === 16000,
  `${barPriced.total}`,
);
check(
  "and NOT 18.5 × 4,000",
  barPriced.total !== 74000,
  "the length was multiplied by a per-bar price",
);
check("the quantity quoted is bars, not metres", barPriced.quantity === 4);
check("and the unit says so", barPriced.unit.includes("bar"), barPriced.unit);

// The same material quoted per metre is a different sum, and the offcut is
// still bought.
const metrePriced = costLinear(brief, 667, "metre");
check(
  "priced per metre, the purchased length is charged, not the required length",
  metrePriced.quantity === 24,
  `${metrePriced.quantity} m`,
);
check(
  "which is four bars' worth",
  metrePriced.total === Math.round(24 * 667 * 100) / 100,
  `${metrePriced.total}`,
);

// ---------------------------------------------------------------------------
// 2. Division is not the answer
// ---------------------------------------------------------------------------

// The same 18.5 m in pieces just over half a bar: six of 3.084 m. Two will
// never share a bar, so it is six bars — half as much again as the naive
// ceil(18.5 / 6) = 4, and the reason dividing is an estimate rather than an
// answer.
const awkward = only([profile(3084, 6, "jamb")], { stockLengths: [6000] });
check(
  "pieces that pack badly need more bars than the division suggests",
  awkward.bars > Math.ceil(18.5 / 6),
  `${awkward.bars} bars for ${awkward.requiredMetres} m`,
);

// And the surprise in the other direction, which a fabricator will want to
// argue with: a 6 m bar does **not** yield two 3 m pieces. The blade takes
// 5 mm and the end is faced off, so the second piece is 15 mm too long. This
// is real, it is why shops order over-length, and quietly rounding it away
// would understate every frame with a 3 m member in it.
const halves = only([profile(3000, 4, "head")], { stockLengths: [6000] });
check(
  "two 3 m pieces do not come out of a 6 m bar",
  halves.bars === 4,
  `${halves.bars} bars for four 3 m pieces`,
);

// Trim the ends off and allow for the blade, and they do.
const neat = only([profile(2997, 4, "head")], {
  stockLengths: [6000],
  endTrim: 0,
});
check(
  "cut 3 mm shorter, two per bar",
  neat.bars === 2,
  `${neat.bars}`,
);
check(
  "with only the kerf and the last few millimetres wasted",
  neat.wasteMetres < 0.03,
  `${neat.wasteMetres} m`,
);

// ---------------------------------------------------------------------------
// 3. The kerf is real material
// ---------------------------------------------------------------------------

// Two pieces that add up to exactly one bar do not fit it — the blade has to
// go somewhere. This is the check that catches a packer written with `<=` and
// no kerf at all.
const exact = only([profile(3000, 2)], { stockLengths: [6000], endTrim: 0 });
check(
  "two halves that sum to exactly one bar need two bars",
  exact.bars === 2,
  `${exact.bars}`,
);

// Take the kerf off one of them and they do fit.
const fits = only([profile(3000, 1), profile(2995, 1)], {
  stockLengths: [6000],
  endTrim: 0,
});
check(
  "allow for the blade and they share a bar",
  fits.bars === 1,
  `${fits.bars}`,
);

const trimmed = only([profile(2995, 2)], { stockLengths: [6000], endTrim: 10 });
check(
  "facing off the bar end can cost a whole bar",
  trimmed.bars === 2,
  `${trimmed.bars}`,
);

check(
  "the first cut on a bar costs no kerf",
  only([profile(5990, 1)], { stockLengths: [6000], endTrim: 10 }).bars === 1,
);

const kerfLoss = only([profile(1000, 5)], { stockLengths: [6000], endTrim: 0 });
check(
  "the kerf is counted once per cut after the first",
  kerfLoss.layouts[0]?.kerfLoss === DEFAULT_KERF_MM * 4,
  `${kerfLoss.layouts[0]?.kerfLoss}`,
);

// ---------------------------------------------------------------------------
// 4. Choosing the stock length
// ---------------------------------------------------------------------------

// A 2.9 m piece from a 6 m bar wastes half the bar. From a 3 m bar it wastes
// almost nothing, and buying the 6 m bar because it is first in the list is the
// expensive kind of default.
const short = only([profile(2900, 3)]);
check(
  "a length close to a shorter stock size picks that stock size",
  short.stockLength === 3000,
  `${short.stockLength} mm`,
);
check("and buys three of them", short.bars === 3, `${short.bars}`);
check(
  "wasting almost nothing",
  short.wasteFraction < 0.05,
  `${(short.wasteFraction * 100).toFixed(1)}%`,
);

const long = only([profile(5900, 2)]);
check(
  "a length that only fits the longest bar uses it",
  long.stockLength === 6000,
  `${long.stockLength}`,
);

check(
  "a supplier who only stocks 5.8 m bars gets a different answer",
  only([profile(2900, 3)], { stockLengths: [5800] }).stockLength === 5800,
);

check(
  "the default stock list is longest first",
  [...STOCK_LENGTHS_MM].every(
    (length, i, all) => i === 0 || all[i - 1]! >= length,
  ),
);

// ---------------------------------------------------------------------------
// 5. What cannot be cut is said, not dropped
// ---------------------------------------------------------------------------

const tooLong = only([profile(7000, 1, "transom")], { stockLengths: [6000] });
check("a piece longer than any bar is reported", tooLong.unplaced.length === 1);
check(
  "with the reason a person can act on",
  tooLong.unplaced[0]?.reason.includes("6000") ?? false,
  tooLong.unplaced[0]?.reason,
);
check(
  "and it is not silently counted as fitting",
  tooLong.layouts.length === 0,
  `${tooLong.layouts.length} bars`,
);

// The rest of the order still packs. One impossible piece must not throw away
// the nine that were fine.
const mixed = only([profile(7000, 1, "transom"), profile(2000, 3, "jamb")], {
  stockLengths: [6000],
});
check(
  "the pieces that do fit are still packed around it",
  mixed.layouts.length === 2 && mixed.unplaced.length === 1,
  `${mixed.layouts.length} bars, ${mixed.unplaced.length} unplaced`,
);
check(
  "and all three of them are on a bar",
  mixed.layouts.reduce((n, l) => n + l.cuts.length, 0) === 3,
);

// ---------------------------------------------------------------------------
// 6. Profiles do not share bars
// ---------------------------------------------------------------------------

const two = packLinear([
  { profileId: "alu-40", profileLabel: "40 × 40", length: 3000, quantity: 1, label: "a" },
  { profileId: "bead", profileLabel: "Glazing bead", length: 2000, quantity: 1, label: "b" },
]);

check("two profiles are two stock lines", two.length === 2);
check(
  "and neither is cut from the other's bar",
  two.every((stock) => stock.bars === 1),
  two.map((s) => `${s.profileId}:${s.bars}`).join(" "),
);

// ---------------------------------------------------------------------------
// 7. Waste, allowance, and arithmetic that has to close
// ---------------------------------------------------------------------------

for (const stock of [brief, awkward, halves, neat, short, long]) {
  check(
    `${stock.profileId} @ ${stock.stockLength}: purchased = bars × bar length`,
    Math.abs(stock.purchasedMetres - (stock.bars * stock.stockLength) / 1000) < 0.001,
    `${stock.purchasedMetres} vs ${(stock.bars * stock.stockLength) / 1000}`,
  );
  check(
    `${stock.profileId} @ ${stock.stockLength}: waste = purchased − required`,
    Math.abs(stock.wasteMetres - (stock.purchasedMetres - stock.requiredMetres)) <
      0.002,
    `${stock.wasteMetres}`,
  );
  check(
    `${stock.profileId} @ ${stock.stockLength}: you never buy less than you need`,
    stock.purchasedMetres >= stock.requiredMetres,
  );
  check(
    `${stock.profileId} @ ${stock.stockLength}: every piece is on a bar`,
    stock.layouts.reduce((n, l) => n + l.cuts.length, 0) +
      stock.unplaced.length ===
      stock.pieces.reduce((n, p) => n + p.quantity, 0),
  );
}

const allowed = only([profile(1000, 4)], { stockLengths: [6000], allowance: 20 });
check(
  "a fabrication allowance lengthens every piece",
  allowed.requiredMetres === 4.08,
  `${allowed.requiredMetres} m`,
);
check(
  "and no allowance is added by default",
  only([profile(1000, 4)], { stockLengths: [6000] }).requiredMetres === 4,
);

// No cut may exceed the usable length of the bar it sits on, and no bar may
// hold more than it has room for. This is the invariant the packer exists to
// maintain, checked directly rather than inferred from the bar count.
for (const stock of [brief, awkward, halves, neat, short, long, mixed]) {
  for (const layout of stock.layouts) {
    const consumed =
      layout.cuts.reduce((total, cut) => total + cut.length, 0) + layout.kerfLoss;
    check(
      `${stock.profileId} bar ${layout.number} holds what it claims`,
      consumed <= layout.usableLength + 0.001,
      `${consumed} > ${layout.usableLength}`,
    );
    check(
      `${stock.profileId} bar ${layout.number} offcut closes`,
      Math.abs(layout.usableLength - consumed - layout.offcut) < 0.11,
      `${layout.offcut}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 8. Same input, same answer
// ---------------------------------------------------------------------------

const order: LinearPiece[] = [
  profile(1850, 4, "mullion"),
  profile(2400, 2, "head"),
  profile(900, 6, "bead"),
];

const first = JSON.stringify(packLinear(order));
const again = JSON.stringify(packLinear([...order].reverse()));
check(
  "the same pieces in a different order pack identically",
  first === again,
  "a quotation that moves when nothing changed is a quotation nobody trusts",
);

check(
  "and running it twice gives the same answer",
  JSON.stringify(packLinear(order)) === first,
);

// ---------------------------------------------------------------------------
// 9. Nothing in, nothing out
// ---------------------------------------------------------------------------

check("no pieces is no stock", packLinear([]).length === 0);
check(
  "a zero quantity is not a bar",
  packLinear([profile(2000, 0)]).length === 0,
);
check(
  "nor is a zero length",
  packLinear([profile(0, 5)]).length === 0,
);

// ---------------------------------------------------------------------------
// 10. The worked example from the brief, end to end
//
//   "A 2400 mm wide × 2100 mm high black aluminium sliding door with clear
//    glass."
//
// Profiles, glass, hardware, bars, cost.
// ---------------------------------------------------------------------------

const door = buildOpening({
  ...defaultOpening("sliding-door"),
  reference: "D-01",
  width: 2400,
  height: 2100,
  given: { width: true, height: true },
  finish: "Black anodised",
  glass: "clear-6",
});

check("the title says what it is", door.title.includes("2400 × 2100"), door.title);
check("and what colour", door.title.includes("Black anodised"));

check("it has profiles", door.profiles.length > 0);
check("it has glass", door.glass.length === 1);
check("it has hardware", door.hardware.length > 0);

// Frame: head and sill at the full opening width, jambs between them.
const head = door.profiles.find((p) => p.label === "Frame head");
const jamb = door.profiles.find((p) => p.label === "Frame jamb");
check("the head is cut to the opening width", head?.length === 2400, `${head?.length}`);
check("there are two jambs", jamb?.quantity === 2, `${jamb?.quantity}`);
check(
  "and they fit between head and sill rather than beside them",
  jamb?.length === 2100 - 27 * 2,
  `${jamb?.length}`,
);

// Two sashes that overlap at the interlock are together wider than the hole.
const stile = door.profiles.find((p) => p.label === "Sash stile");
check("four stiles for two sashes", stile?.quantity === 4, `${stile?.quantity}`);
check(
  "the sash is shorter than the daylight by its clearance",
  stile?.length === 2100 - 27 * 2 - 3 * 2,
  `${stile?.length}`,
);

const interlock = door.profiles.find((p) => p.label === "Interlock stile");
check("a two-panel slider has one interlock", interlock?.quantity === 1);

// Glass is smaller than the sash and the frame is not glass.
const pane = door.glass[0];
check("the glass is 6 mm", pane?.thickness === 6);
check("two panes", pane?.quantity === 2, `${pane?.quantity}`);
check(
  "each pane is smaller than the opening",
  (pane?.width ?? 0) < 2400 && (pane?.height ?? 0) < 2100,
);
check(
  "the glazed area is less than the opening area",
  door.glazedArea < door.openingArea,
  `${door.glazedArea} vs ${door.openingArea}`,
);
check(
  "but most of the door is glass",
  glazingRatio(door) > 0.6 && glazingRatio(door) < 1,
  `${glazingRatio(door)}`,
);

// Hardware a slider actually needs.
const hw = (id: string) => door.hardware.find((h) => h.id === id);
check("two rollers on the sliding sash", hw("roller-tandem")?.quantity === 2);
check("a sliding handle", hw("handle-sliding")?.quantity === 1);
check("a hook lock", hw("lock-hook")?.quantity === 1);
check("weatherseal by the metre", (hw("brush-pile")?.quantity ?? 0) > 0);
check("glazing gasket", (hw("gasket-wedge")?.quantity ?? 0) > 0);
check("silicone", (hw("silicone")?.quantity ?? 0) >= 1);
check("frame fixings", (hw("frame-fixing")?.quantity ?? 0) >= 6);
check(
  "and every hardware line says why there are that many",
  door.hardware.every((line) => line.basis.length > 0),
);

// No hinges on a slider. A schedule that lists both is a schedule nobody read.
check("no hinges on a sliding door", hw("hinge") === undefined);

// Now the part that costs money.
const stock = packLinear(door.profiles);
check("the profiles pack into bars", stock.length > 0);
check(
  "every profile buys whole bars",
  stock.every((s) => Number.isInteger(s.bars) && s.bars > 0),
);
check(
  "and never fewer metres than are needed",
  stock.every((s) => s.purchasedMetres >= s.requiredMetres),
);

const frameStock = stock.find((s) => s.profileId === "sliding-27-frame");
check("the frame profile is one line", frameStock !== undefined);
if (frameStock) {
  const perBar = costLinear(frameStock, 4000, "bar");
  check(
    "priced per bar it is bars × price",
    perBar.total === frameStock.bars * 4000,
    `${perBar.total}`,
  );
  check(
    "which is not the required length × the bar price",
    perBar.total !== Math.round(frameStock.requiredMetres * 4000),
  );
}

// A hinged door is a different animal and must not come out the same.
const hinged = buildOpening({
  ...defaultOpening("hinged-door"),
  given: { width: true, height: true },
});
const hingedHw = (id: string) => hinged.hardware.find((h) => h.id === id);
check("a hinged door has hinges", (hingedHw("hinge")?.quantity ?? 0) >= 2);
check(
  "three of them on a 2100 mm leaf",
  hingedHw("hinge")?.quantity === 3,
  `${hingedHw("hinge")?.quantity}`,
);
check("a lever handle, not a sliding one", hingedHw("handle-lever") !== undefined);
check("and no rollers", hingedHw("roller-tandem") === undefined);
check(
  "and no interlock",
  hinged.profiles.every((p) => p.label !== "Interlock stile"),
);

// A fixed light opens, locks and hinges not at all.
const fixed = buildOpening({
  ...defaultOpening("fixed-window"),
  given: { width: true, height: true },
});
check("a fixed light has no hinges", fixed.hardware.every((h) => h.id !== "hinge"));
check("no handle", fixed.hardware.every((h) => !h.id.startsWith("handle")));
check("but it is still glazed", fixed.glass[0]!.quantity >= 1);

// Six windows are six frames of material in one packing problem.
const one = buildOpening({ ...defaultOpening("casement-window"), quantity: 1 });
const six = buildOpening({ ...defaultOpening("casement-window"), quantity: 6 });
check(
  "six windows need six times the profile",
  six.profiles[0]!.quantity === one.profiles[0]!.quantity * 6,
);
check("and six times the glass", six.glass[0]!.quantity === one.glass[0]!.quantity * 6);
check(
  "but pack into fewer bars than six separate orders",
  packLinear(six.profiles).reduce((n, s) => n + s.bars, 0) <
    packLinear(one.profiles).reduce((n, s) => n + s.bars, 0) * 6,
);

// Dimensions the customer gave are the dimensions that get cut.
const stated = buildOpening({
  ...defaultOpening("sliding-door"),
  width: 2437,
  height: 2088,
  given: { width: true, height: true },
});
check(
  "a stated width is used exactly, not rounded to a standard size",
  stated.profiles.find((p) => p.label === "Frame head")?.length === 2437,
);
check(
  "and a stated opening produces no estimate warning",
  stated.notes.every((note) => !note.includes("estimated")),
);

const estimated = buildOpening(defaultOpening("sliding-door"));
check(
  "an unstated one says so",
  estimated.notes.some((note) => note.includes("estimated")),
);

// Toughened glass is ordered, not cut on site.
const toughened = buildOpening({
  ...defaultOpening("shopfront"),
  given: { width: true, height: true },
});
check("toughened glass is made to size", toughened.glass[0]!.madeToSize);
check(
  "and the schedule says why that matters",
  toughened.notes.some((note) => note.includes("cannot be cut")),
);
check(
  "float glass is not flagged that way",
  !buildOpening({ ...defaultOpening("sliding-window"), given: { width: true, height: true } })
    .glass[0]!.madeToSize,
);

// ---------------------------------------------------------------------------
// 11. Which price wins, and in what unit
// ---------------------------------------------------------------------------

const all: PriceCandidate[] = [
  { source: "ai", price: 3000, unit: "m" },
  { source: "market", price: 3500, unit: "bar", sampleSize: 4 },
  { source: "product", price: 3800, unit: "bar", productId: "p1", productTitle: "Alu 40×40" },
  { source: "user", price: 4000, unit: "bar" },
];

check("the user's price beats everything", resolvePrice(all)?.source === "user");
check("and it is the number that comes out", resolvePrice(all)?.price === 4000);
check(
  "a chosen product beats the average",
  resolvePrice(all.filter((c) => c.source !== "user"))?.source === "product",
);
check(
  "the average beats an AI guess",
  resolvePrice(all.filter((c) => c.source === "market" || c.source === "ai"))
    ?.source === "market",
);
check(
  "and an AI guess is used only when nothing else exists",
  resolvePrice([{ source: "ai", price: 3000, unit: "m" }])?.source === "ai",
);
check(
  "which is flagged as an estimate",
  resolvePrice([{ source: "ai", price: 3000, unit: "m" }])?.estimated === true,
);
check(
  "a real price is not",
  resolvePrice([{ source: "user", price: 1, unit: "m" }])?.estimated === false,
);

check("every source has a label", resolvePrice(all)?.sourceLabel === "User edited");
check(
  "and the alternatives are kept so a reset is possible",
  resolvePrice(all)?.alternatives.length === 4,
);
check(
  "in precedence order",
  resolvePrice(all)?.alternatives[0]?.source === "user" &&
    resolvePrice(all)?.alternatives[3]?.source === "ai",
);

// Nothing usable is null, not zero. A line that costs nothing is worse than a
// line that says it has no price.
check("no candidates is no price", resolvePrice([]) === null);
check(
  "a zero price is not a price",
  resolvePrice([{ source: "user", price: 0, unit: "m" }]) === null,
);
check(
  "nor is a missing unit",
  resolvePrice([{ source: "user", price: 10, unit: "" }]) === null,
);

// ---- The average --------------------------------------------------------

const avg = averageMarketPrice([
  { price: 3800, unit: "bar" },
  { price: 4000, unit: "bar" },
  { price: 4200, unit: "bar" },
]);
check("three listings average to the middle one", avg?.price === 4000, `${avg?.price}`);
check("and the sample size is shown", avg?.sampleSize === 3);

// One supplier with an extra zero must not drag the average.
const fatFinger = averageMarketPrice([
  { price: 3800, unit: "bar" },
  { price: 4000, unit: "bar" },
  { price: 4200, unit: "bar" },
  { price: 40000, unit: "bar" },
]);
check(
  "a mis-keyed listing does not move the average much",
  (fatFinger?.price ?? 0) < 4200,
  `${fatFinger?.price}`,
);

// Units are never blended.
const mixedUnits = averageMarketPrice([
  { price: 4000, unit: "bar" },
  { price: 4200, unit: "bar" },
  { price: 700, unit: "m" },
]);
check(
  "listings in a different unit are excluded, not averaged in",
  mixedUnits?.unit === "bar" && mixedUnits?.sampleSize === 2,
  `${mixedUnits?.unit} × ${mixedUnits?.sampleSize}`,
);
check("and the exclusion is reported", mixedUnits?.ignored === 1);

check("no listings is null", averageMarketPrice([]) === null);

// ---- Units people actually type -----------------------------------------

for (const [written, meant] of [
  ["M²", "m²"], ["sqm", "m²"], ["sq.m", "m²"], ["m2", "m²"],
  ["LM", "m"], ["linear metre", "m"], ["Meter", "m"],
  ["Pcs", "pc"], ["NOS", "pc"], ["each", "pc"],
  ["lengths", "bar"], ["Sticks", "bar"],
  ["Sheets", "sheet"], ["boards", "sheet"],
  ["Kgs", "kg"], ["Tonnes", "tonne"], ["bags", "bag"], ["Litres", "L"],
] as const) {
  check(`"${written}" is ${meant}`, normaliseUnit(written) === meant, normaliseUnit(written));
}

// ---- The four-times-too-big quotation ------------------------------------

const perBar = resolvePrice([{ source: "user", price: 4000, unit: "bar" }])!;
const perMetre = resolvePrice([{ source: "user", price: 4000, unit: "m" }])!;

check(
  "four bars at ETB 4,000 a bar is ETB 16,000",
  costLine(4, "bar", perBar)?.total === 16000,
);
check(
  "and 18.5 m cannot be priced against a per-bar rate at all",
  costLine(18.5, "m", perBar) === null,
  "it returned a number instead of refusing",
);
check(
  "which is the whole point — no silent conversion",
  costLine(4, "bar", perMetre) === null,
);
check(
  "matching units are fine",
  costLine(18.5, "m", perMetre)?.total === 74000,
);
check(
  "written differently, they still match",
  costLine(18.5, "Linear Metre", perMetre)?.total === 74000,
);

check(
  "every cost line shows its arithmetic",
  costLine(4, "bar", perBar)?.formula === "4 bar × ETB 4000 = ETB 16000",
  costLine(4, "bar", perBar)?.formula,
);
check(
  "and carries the source through to the line",
  costLine(4, "bar", perBar)?.sourceLabel === "User edited",
);
check("a negative quantity is refused", costLine(-1, "bar", perBar) === null);

// ---- The door, priced ----------------------------------------------------

// Deliberately written without `!`. An earlier version asserted non-null here
// and, when a mutation broke the precedence order, the resolved price became a
// per-metre AI guess, `costLine` correctly refused it, and the `!` turned that
// into an uncaught TypeError — which killed the run before the summary printed
// and reported none of the failures already recorded. A check that crashes
// instead of failing is a check that tells you nothing.
if (frameStock) {
  const chosen = resolvePrice([
    { source: "ai", price: 700, unit: "m" },
    { source: "market", price: 3900, unit: "bar", sampleSize: 3 },
    { source: "user", price: 4000, unit: "bar" },
  ]);
  const line = chosen ? costLine(frameStock.bars, "bar", chosen) : null;

  check("the door frame gets a price at all", chosen !== null);
  check("in bars, so it can be costed", chosen?.unit === "bar", chosen?.unit);
  check("the door frame is priced from bars", line?.unit === "bar");
  check(
    "at the price the user typed",
    line?.unitPrice === 4000 && line?.source === "user",
  );
  check(
    "and the total is bars × price",
    line?.total === frameStock.bars * 4000,
    `${line?.total}`,
  );
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}fabrication: bars, not metres${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
