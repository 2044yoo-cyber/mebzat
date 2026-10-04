import type { Quantity } from "./measure";

/**
 * The four trades everybody gets wrong, done deterministically.
 *
 * Paint, masonry, concrete and reinforcement. Each is arithmetic over a
 * measured area or volume plus a specification, and each has a specific way of
 * going wrong that is worth guarding against by name:
 *
 *   Paint      — coats forgotten, or openings not deducted.
 *   Masonry    — a block size assumed when the drawing states another.
 *   Concrete   — volume right, but no allowance for what is lost on site.
 *   Rebar      — invented. This one is the serious one.
 *
 * On that last point the brief was unambiguous and it is a safety matter, not a
 * commercial one: **never invent reinforcement details.** A bar schedule that
 * looks confident and was guessed is how somebody builds a beam with the wrong
 * steel in it. Where the structural information is missing, this returns
 * nothing and says so.
 */

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

export type PaintSystem = {
  id: string;
  label: string;
  /** Square metres one litre covers, in one coat, on a prepared surface. */
  coveragePerLitre: number;
  /** Coats the specification calls for. */
  coats: number;
  /** Sold in this size. Paint comes in tins, not in litres. */
  tinLitres: number;
};

export const PAINT_SYSTEMS: PaintSystem[] = [
  { id: "emulsion-interior", label: "Interior emulsion", coveragePerLitre: 12, coats: 2, tinLitres: 20 },
  { id: "emulsion-exterior", label: "Exterior emulsion", coveragePerLitre: 10, coats: 2, tinLitres: 20 },
  { id: "primer", label: "Primer / undercoat", coveragePerLitre: 11, coats: 1, tinLitres: 20 },
  { id: "gloss", label: "Gloss on joinery", coveragePerLitre: 14, coats: 2, tinLitres: 4 },
  { id: "ceiling", label: "Ceiling emulsion", coveragePerLitre: 12, coats: 2, tinLitres: 20 },
];

export type PaintResult = {
  area: Quantity;
  system: PaintSystem;
  coats: number;
  /** Litres needed before any waste. */
  litres: number;
  /** Litres including waste. */
  litresWithWaste: number;
  /** Tins to buy — you cannot buy 43.7 litres. */
  tins: number;
  formula: string;
};

/**
 * How much paint.
 *
 * Area × coats ÷ coverage, then rounded up to whole tins. The rounding to tins
 * is the step people leave out, and it matters: 43.7 litres of a paint sold in
 * 20-litre tins is three tins, not 2.185.
 */
export function paintQuantity(
  area: Quantity,
  system: PaintSystem,
  options: { coats?: number; wastePercent?: number } = {},
): PaintResult {
  const coats = options.coats ?? system.coats;
  const waste = Math.max(0, options.wastePercent ?? 5);

  const litres = round((area.value * coats) / system.coveragePerLitre, 2);
  const litresWithWaste = round(litres * (1 + waste / 100), 2);
  const tins = Math.ceil(litresWithWaste / system.tinLitres);

  return {
    area,
    system,
    coats,
    litres,
    litresWithWaste,
    tins,
    formula:
      `${area.value.toFixed(2)} m² × ${coats} coats ÷ ${system.coveragePerLitre} m²/L` +
      ` = ${litres.toFixed(2)} L, +${waste}% = ${litresWithWaste.toFixed(2)} L` +
      ` → ${tins} × ${system.tinLitres} L tin${tins === 1 ? "" : "s"}`,
  };
}

// ---------------------------------------------------------------------------
// Masonry
// ---------------------------------------------------------------------------

export type BlockType = {
  id: string;
  label: string;
  /** Nominal face dimensions in millimetres, excluding the mortar joint. */
  length: number;
  height: number;
  /** Wall thickness this block builds. */
  thickness: number;
};

/** Hollow concrete blocks as sold in Ethiopia, plus the common brick. */
export const BLOCK_TYPES: BlockType[] = [
  { id: "hcb-100", label: "HCB 100 mm", length: 400, height: 200, thickness: 100 },
  { id: "hcb-150", label: "HCB 150 mm", length: 400, height: 200, thickness: 150 },
  { id: "hcb-200", label: "HCB 200 mm", length: 400, height: 200, thickness: 200 },
  { id: "hcb-250", label: "HCB 250 mm", length: 400, height: 200, thickness: 250 },
  { id: "brick-clay", label: "Clay brick", length: 230, height: 76, thickness: 110 },
];

export type MasonryResult = {
  area: Quantity;
  block: BlockType;
  jointMm: number;
  blocksPerM2: number;
  blocks: number;
  blocksWithWaste: number;
  /** Mortar volume, m³. */
  mortar: number;
  formula: string;
  notes: string[];
};

/**
 * Blocks, and the mortar between them.
 *
 * Blocks per square metre is computed from the block's own face size plus the
 * joint, not looked up in a table — because the table is where "12.5 blocks per
 * m²" comes from, and it is only true for one block size and one joint.
 *
 * `stated` is the block named on the drawing. When it is given it is used, and
 * the brief said why: *do not assume block size when the project specification
 * provides another size.*
 */
export function masonryQuantity(
  area: Quantity,
  block: BlockType,
  options: { jointMm?: number; wastePercent?: number; stated?: boolean } = {},
): MasonryResult {
  const joint = options.jointMm ?? 10;
  const waste = Math.max(0, options.wastePercent ?? 5);
  const notes: string[] = [];

  // One block occupies its own face plus one joint on two sides.
  const unitArea = ((block.length + joint) * (block.height + joint)) / 1_000_000;
  const blocksPerM2 = round(1 / unitArea, 3);
  const blocks = Math.ceil(area.value * blocksPerM2);
  const blocksWithWaste = Math.ceil(blocks * (1 + waste / 100));

  // Mortar is the wall volume minus the volume the blocks themselves occupy.
  const wallVolume = area.value * (block.thickness / 1000);
  const blockVolume =
    blocks * ((block.length * block.height * block.thickness) / 1_000_000_000);
  const mortar = round(Math.max(0, wallVolume - blockVolume), 3);

  if (options.stated === false) {
    notes.push(
      `Block size not stated on the drawing — ${block.label} assumed. Confirm before ordering.`,
    );
  }

  return {
    area,
    block,
    jointMm: joint,
    blocksPerM2,
    blocks,
    blocksWithWaste,
    mortar,
    formula:
      `1 ÷ ((${block.length} + ${joint}) × (${block.height} + ${joint}) mm)` +
      ` = ${blocksPerM2} blocks/m²; ${area.value.toFixed(2)} m² × ${blocksPerM2}` +
      ` = ${blocks}, +${waste}% = ${blocksWithWaste}`,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Concrete
// ---------------------------------------------------------------------------

export type ConcreteResult = {
  volume: Quantity;
  grade: string;
  /** Volume including the site allowance. */
  orderedVolume: number;
  /** Cement, sand and aggregate for that volume, by the nominal mix. */
  cementBags: number;
  sandM3: number;
  aggregateM3: number;
  formula: string;
};

/** Nominal volumetric mixes, cement : sand : aggregate. */
export const CONCRETE_MIXES: Record<string, { ratio: [number, number, number]; label: string }> = {
  C5: { ratio: [1, 4, 8], label: "C5 lean / blinding" },
  C15: { ratio: [1, 3, 6], label: "C15" },
  C20: { ratio: [1, 2, 4], label: "C20" },
  C25: { ratio: [1, 1.5, 3], label: "C25" },
  C30: { ratio: [1, 1, 2], label: "C30" },
};

/** A 50 kg bag of cement is about this much loose volume. */
const CEMENT_BAG_M3 = 0.0347;

/**
 * Concrete, and what goes into it.
 *
 * The dry volume of the constituents is about 1.54 times the wet volume of the
 * concrete they make — the aggregate packs into the spaces between. Skipping
 * that factor under-orders every pour by a third, which is a well-known way to
 * stop a slab halfway.
 */
export function concreteQuantity(
  volume: Quantity,
  grade: keyof typeof CONCRETE_MIXES,
  options: { wastePercent?: number } = {},
): ConcreteResult {
  const waste = Math.max(0, options.wastePercent ?? 5);
  const mix = CONCRETE_MIXES[grade] ?? CONCRETE_MIXES.C20!;
  const [cement, sand, aggregate] = mix.ratio;
  const parts = cement + sand + aggregate;

  const orderedVolume = round(volume.value * (1 + waste / 100), 3);
  const dryVolume = orderedVolume * 1.54;

  const cementM3 = (dryVolume * cement) / parts;

  return {
    volume,
    grade: mix.label,
    orderedVolume,
    cementBags: Math.ceil(cementM3 / CEMENT_BAG_M3),
    sandM3: round((dryVolume * sand) / parts, 2),
    aggregateM3: round((dryVolume * aggregate) / parts, 2),
    formula:
      `${volume.value.toFixed(3)} m³ +${waste}% = ${orderedVolume.toFixed(3)} m³;` +
      ` dry volume × 1.54 = ${dryVolume.toFixed(3)} m³ split ${cement}:${sand}:${aggregate}`,
  };
}

// ---------------------------------------------------------------------------
// Reinforcement
// ---------------------------------------------------------------------------

export type RebarLine = {
  /** Bar mark from the schedule, when there is one. */
  mark?: string | null;
  /** Nominal diameter in millimetres. */
  diameter: number;
  /** Cut length of one bar, in metres. */
  length: number;
  count: number;
  member: string;
};

export type RebarResult = {
  byDiameter: {
    diameter: number;
    totalLength: number;
    kgPerMetre: number;
    weightKg: number;
    /** 12 m is the standard bar; this is how many to order. */
    bars: number;
  }[];
  totalWeightKg: number;
  lines: RebarLine[];
  notes: string[];
};

/** Mass per metre of deformed bar: d² ÷ 162, the standard approximation. */
export function rebarKgPerMetre(diameter: number): number {
  return round((diameter * diameter) / 162, 4);
}

const STANDARD_BAR_LENGTH_M = 12;

/**
 * Weighs a bar schedule.
 *
 * Takes a schedule; it does not invent one. If `lines` is empty the result is
 * empty and carries a note saying the structural information is missing — which
 * is the honest output and the one the brief demanded. A plausible-looking
 * schedule nobody specified is worse than no schedule at all, because it will
 * be built.
 */
export function rebarQuantity(lines: RebarLine[]): RebarResult {
  if (lines.length === 0) {
    return {
      byDiameter: [],
      totalWeightKg: 0,
      lines: [],
      notes: [
        "No reinforcement schedule found. Bar sizes, spacing and laps must come from the structural drawings — they are not estimated here.",
      ],
    };
  }

  const byDiameter = new Map<number, number>();
  for (const line of lines) {
    if (line.diameter <= 0 || line.length <= 0 || line.count <= 0) continue;
    const total = line.length * line.count;
    byDiameter.set(line.diameter, (byDiameter.get(line.diameter) ?? 0) + total);
  }

  const groups = [...byDiameter.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([diameter, totalLength]) => {
      const kgPerMetre = rebarKgPerMetre(diameter);
      return {
        diameter,
        totalLength: round(totalLength, 2),
        kgPerMetre,
        weightKg: round(totalLength * kgPerMetre, 2),
        // Bars are bought whole, the same rule as aluminium: you cannot buy
        // 47.3 metres of Y12 when it comes in 12 m lengths.
        bars: Math.ceil(totalLength / STANDARD_BAR_LENGTH_M),
      };
    });

  return {
    byDiameter: groups,
    totalWeightKg: round(
      groups.reduce((sum, group) => sum + group.weightKg, 0),
      2,
    ),
    lines,
    notes: [],
  };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
