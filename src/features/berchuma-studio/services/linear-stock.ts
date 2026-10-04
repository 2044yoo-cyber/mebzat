/**
 * Cutting lengths out of bars.
 *
 * Aluminium profile, timber batten, steel tube, handrail — anything bought as a
 * stick of a fixed length and cut into pieces. The board nester next door
 * solves the two-dimensional version of this problem; this is the
 * one-dimensional one, and it is the one that decides what a window costs.
 *
 * ## The calculation this exists to get right
 *
 * A door needs 18.5 m of profile. Bars come in 6 m lengths at ETB 4,000 each.
 *
 *   Wrong:  18.5 × 4,000 = ETB 74,000
 *   Right:   4 × 4,000 = ETB 16,000
 *
 * The first is what you get by pricing a length against a price-per-bar, and it
 * is wrong by a factor of four and a half. The second is what the fabricator
 * actually pays, because you cannot buy 18.5 metres of a thing sold in
 * six-metre sticks — you buy four bars and put the offcut on the rack.
 *
 * And 18.5 ÷ 6 = 3.08 does not mean four bars either. It means four *if the
 * pieces happen to fit*: eight cuts of 2.31 m fit three per bar with 0.93 m
 * left over, so it is three bars. Twelve cuts of 1.55 m are four per bar
 * exactly, which is three bars again — but make them 1.55 m plus a 5 mm kerf
 * and only three fit, so it is four. The division is an estimate; the packing
 * is the answer.
 *
 * Pure and deterministic: the same cut list yields the same bars every time, so
 * the number on the quotation is the number at the saw.
 */

/** The blade turns this much of every cut into swarf. */
export const DEFAULT_KERF_MM = 5;

/**
 * Trimmed off the end of each bar before anything is cut from it.
 *
 * Extruded profile arrives with a damaged or out-of-square end often enough
 * that shops face it off as a habit. It costs a few millimetres a bar and it is
 * the difference between a piece fitting and a piece being 3 mm short, so the
 * default is not zero.
 */
export const DEFAULT_END_TRIM_MM = 10;

/** Stock lengths sold in Ethiopia, longest first. */
export const STOCK_LENGTHS_MM = [6000, 5800, 4000, 3000] as const;

export type LinearPiece = {
  /** Which profile this is cut from. Pieces of different profiles never share. */
  profileId: string;
  profileLabel: string;
  /** Finished length in millimetres, after any fabrication allowance. */
  length: number;
  quantity: number;
  /** Where it goes — "head", "jamb", "sash top". Printed on the cut list. */
  label: string;
  /**
   * The angle each end is cut at, in degrees. 45 for a mitre, 90 for square.
   *
   * Carried through to the cut list because a mitred piece cut square is
   * scrap, and it is the single most common way a window frame is remade.
   */
  angles?: [number, number];
};

export type BarLayout = {
  /** 1-based within its profile. "Bar 3 of 4" is how a shop refers to it. */
  number: number;
  stockLength: number;
  /** Usable length after the end trim. */
  usableLength: number;
  cuts: { label: string; length: number; angles?: [number, number] }[];
  /** What is left in one continuous piece at the end of the bar. */
  offcut: number;
  /** Material consumed by the blade on this bar. */
  kerfLoss: number;
};

export type ProfileStock = {
  profileId: string;
  profileLabel: string;
  stockLength: number;
  /** Every piece needed, before packing. */
  pieces: { label: string; length: number; quantity: number }[];
  /** Total finished length required, in metres. What people quote at you. */
  requiredMetres: number;
  /** Bars to buy. This is what the cost is calculated from. */
  bars: number;
  /** Bar length × bars, in metres. Always ≥ requiredMetres. */
  purchasedMetres: number;
  /** purchased − required, in metres. */
  wasteMetres: number;
  /** Share of what is bought that ends up as offcut and swarf, 0–1. */
  wasteFraction: number;
  layouts: BarLayout[];
  /** Pieces longer than a bar, which no packing can fix. */
  unplaced: { label: string; length: number; reason: string }[];
};

export type LinearOptions = {
  kerf?: number;
  endTrim?: number;
  /**
   * Millimetres added to every finished length before cutting.
   *
   * A shop that welds and then dresses the joint wants a little extra on each
   * piece. Zero by default: adding material nobody asked for makes a quotation
   * quietly expensive, and the shops that need it know they need it.
   */
  allowance?: number;
  /**
   * Stock lengths available, longest first. Defaults to {@link STOCK_LENGTHS_MM}.
   *
   * A supplier that only stocks 5.8 m bars is a different bar count and a
   * different price, which is why this is configurable rather than assumed.
   */
  stockLengths?: readonly number[];
};

/**
 * Works out the bars.
 *
 * First-fit-decreasing: sort the pieces longest first and put each one on the
 * first bar it fits. It is not optimal — nothing polynomial is — but on real
 * fabrication lists it lands within a bar of optimal, and it is stable, which
 * matters more here than the last few percent. A packer that reshuffles when
 * an unrelated piece changes produces a quotation that moves for no visible
 * reason.
 *
 * The stock length is chosen per profile: whichever available length wastes
 * least across the whole set. A 2.9 m piece is 51% waste from a 6 m bar and 3%
 * from a 3 m bar, and buying the 6 m bar because it is the default is the
 * expensive kind of default.
 */
export function packLinear(
  pieces: LinearPiece[],
  options: LinearOptions = {},
): ProfileStock[] {
  const kerf = options.kerf ?? DEFAULT_KERF_MM;
  const endTrim = options.endTrim ?? DEFAULT_END_TRIM_MM;
  const allowance = Math.max(0, options.allowance ?? 0);
  const stockLengths = [...(options.stockLengths ?? STOCK_LENGTHS_MM)].sort(
    (a, b) => b - a,
  );

  // One bin-packing problem per profile. A 40×40 mullion and a glazing bead are
  // not interchangeable however well they would fit together.
  const byProfile = new Map<string, LinearPiece[]>();
  for (const piece of pieces) {
    if (piece.quantity <= 0 || piece.length <= 0) continue;
    const list = byProfile.get(piece.profileId) ?? [];
    list.push(piece);
    byProfile.set(piece.profileId, list);
  }

  const result: ProfileStock[] = [];

  for (const [profileId, group] of byProfile) {
    const profileLabel = group[0]?.profileLabel ?? profileId;

    // Expanded, because six identical jambs are six pieces to place. Longest
    // first is the "decreasing" half of first-fit-decreasing.
    const cuts = group
      .flatMap((piece) =>
        Array.from({ length: Math.floor(piece.quantity) }, () => ({
          label: piece.label,
          length: piece.length + allowance,
          angles: piece.angles,
        })),
      )
      .sort((a, b) => b.length - a.length);

    const requiredMm = cuts.reduce((total, cut) => total + cut.length, 0);

    // Try every stock length and keep the one that buys least material. Ties go
    // to the longer bar, which means fewer bars to handle and fewer joints.
    let best: { stockLength: number; layouts: BarLayout[]; unplaced: ProfileStock["unplaced"] } | null =
      null;

    for (const stockLength of stockLengths) {
      const attempt = packAt(cuts, stockLength, kerf, endTrim);
      const bought = attempt.layouts.length * stockLength;

      if (
        best === null ||
        attempt.unplaced.length < best.unplaced.length ||
        (attempt.unplaced.length === best.unplaced.length &&
          bought < best.layouts.length * best.stockLength)
      ) {
        best = { stockLength, ...attempt };
      }
    }

    if (!best) continue;

    const purchasedMm = best.layouts.length * best.stockLength;

    result.push({
      profileId,
      profileLabel,
      stockLength: best.stockLength,
      // Sorted, not echoed in input order. The packing was already
      // order-independent; this summary was not, so adding a piece to the top
      // of a design reordered the cut list and made a re-quote look like a
      // changed quote.
      pieces: group
        .map((piece) => ({
          label: piece.label,
          length: piece.length,
          quantity: Math.floor(piece.quantity),
        }))
        .sort((a, b) => b.length - a.length || a.label.localeCompare(b.label)),
      requiredMetres: round(requiredMm / 1000, 3),
      bars: best.layouts.length,
      purchasedMetres: round(purchasedMm / 1000, 3),
      wasteMetres: round(Math.max(0, purchasedMm - requiredMm) / 1000, 3),
      wasteFraction: purchasedMm > 0 ? round(1 - requiredMm / purchasedMm, 4) : 0,
      layouts: best.layouts,
      unplaced: best.unplaced,
    });
  }

  return result.sort((a, b) => a.profileLabel.localeCompare(b.profileLabel));
}

/** First-fit-decreasing against one stock length. */
function packAt(
  cuts: { label: string; length: number; angles?: [number, number] }[],
  stockLength: number,
  kerf: number,
  endTrim: number,
): { layouts: BarLayout[]; unplaced: ProfileStock["unplaced"] } {
  const usable = stockLength - endTrim;
  const layouts: BarLayout[] = [];
  const unplaced: ProfileStock["unplaced"] = [];

  // Remaining length on each open bar, in the same order as `layouts`.
  const remaining: number[] = [];

  for (const cut of cuts) {
    if (cut.length > usable) {
      // No arrangement fixes a piece longer than the bar. Saying so beats
      // silently dropping it, which is how a frame arrives missing a head.
      unplaced.push({
        label: cut.label,
        length: cut.length,
        reason: `${cut.length} mm does not fit a ${stockLength} mm bar`,
      });
      continue;
    }

    let placed = false;
    for (let i = 0; i < layouts.length; i += 1) {
      // The kerf is only spent when there is already a cut on this bar — the
      // first piece starts at the trimmed end and costs nothing extra. Charging
      // a kerf per piece rather than per cut adds a bar every twenty pieces.
      const needed = cut.length + (layouts[i]!.cuts.length > 0 ? kerf : 0);
      if (remaining[i]! >= needed) {
        const layout = layouts[i]!;
        if (layout.cuts.length > 0) layout.kerfLoss += kerf;
        layout.cuts.push(cut);
        remaining[i] = remaining[i]! - needed;
        placed = true;
        break;
      }
    }

    if (!placed) {
      layouts.push({
        number: layouts.length + 1,
        stockLength,
        usableLength: usable,
        cuts: [cut],
        offcut: 0,
        kerfLoss: 0,
      });
      remaining.push(usable - cut.length);
    }
  }

  for (let i = 0; i < layouts.length; i += 1) {
    layouts[i]!.offcut = round(remaining[i] ?? 0, 1);
  }

  return { layouts, unplaced };
}

/**
 * What a set of bars costs, from a price quoted per bar or per metre.
 *
 * The distinction is the whole point. A supplier who quotes "ETB 4,000" for a
 * 6 m bar and a supplier who quotes "ETB 667 per metre" are quoting the same
 * material, but only one of those numbers can be multiplied by 18.5.
 *
 * `unit` says which was quoted, and it comes from the marketplace listing
 * rather than being guessed — the brief was explicit that the calculation has
 * to respect the product's actual selling unit.
 */
export function costLinear(
  stock: ProfileStock,
  price: number,
  unit: "bar" | "metre",
): { quantity: number; unit: string; unitPrice: number; total: number } {
  if (unit === "bar") {
    return {
      quantity: stock.bars,
      unit: `bar of ${stock.stockLength / 1000} m`,
      unitPrice: price,
      total: round(stock.bars * price, 2),
    };
  }

  // Priced per metre, you still buy whole bars — the offcut is bought and paid
  // for even though nothing is cut from it. Charging only the required metres
  // understates every quotation by the waste.
  return {
    quantity: stock.purchasedMetres,
    unit: "m",
    unitPrice: price,
    total: round(stock.purchasedMetres * price, 2),
  };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
