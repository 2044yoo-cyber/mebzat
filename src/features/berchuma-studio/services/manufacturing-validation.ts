import type { PartsBreakdown } from "../types/parts";
import type { DesignSpec } from "../types/spec";
import type { CutList } from "./cutlist";

export type ManufacturingIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  design: string;
  item: string;
  message: string;
  action: string;
};

function issue(
  severity: ManufacturingIssue["severity"],
  code: string,
  design: string,
  item: string,
  message: string,
  action: string,
): ManufacturingIssue {
  return { severity, code, design, item, message, action };
}

/**
 * Deterministic pre-production checks. This deliberately consumes the same
 * parts and cut list as pricing and nesting; it never re-derives dimensions.
 */
export function validateManufacturingDesign(
  spec: DesignSpec,
  breakdown: PartsBreakdown,
  cut: CutList,
): ManufacturingIssue[] {
  const design = spec.title || "Untitled design";
  const issues: ManufacturingIssue[] = [];
  const envelope = spec.envelope;

  for (const [dimension, value] of Object.entries({
    width: envelope.width,
    height: envelope.height,
    depth: envelope.depth,
  })) {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push(issue("error", "invalid-envelope", design, dimension,
        `Envelope ${dimension} must be a finite positive measurement.`,
        "Correct the cabinet dimensions before manufacturing."));
    }
  }

  const seenIds = new Set<string>();
  for (const part of breakdown.parts) {
    if (seenIds.has(part.id)) {
      issues.push(issue("error", "duplicate-part-id", design, part.id,
        "Two generated parts share the same internal part ID.",
        "Regenerate the design and verify the affected cabinet before cutting."));
    }
    seenIds.add(part.id);

    for (const [dimension, value] of [["length", part.length], ["width", part.width], ["thickness", part.board.thickness]] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        issues.push(issue("error", "invalid-part-dimension", design, part.label,
          `Part ${dimension} must be a finite positive measurement.`,
          "Correct the source design or material specification and regenerate the cut list."));
      }
    }
    if (!Number.isInteger(part.quantity) || part.quantity < 1) {
      issues.push(issue("error", "invalid-part-quantity", design, part.label,
        `Part quantity must be a positive whole number; received ${part.quantity}.`,
        "Regenerate the design before exporting production documents."));
    }
    if (part.placements.length !== part.quantity) {
      issues.push(issue("error", "placement-count-mismatch", design, part.label,
        `The model contains ${part.placements.length} placement(s) for quantity ${part.quantity}.`,
        "Do not manufacture until the 3D placements and part quantities agree."));
    }
    if (!Number.isFinite(part.board.sheet.length) || !Number.isFinite(part.board.sheet.width) ||
        part.board.sheet.length <= 0 || part.board.sheet.width <= 0) {
      issues.push(issue("error", "invalid-stock-sheet", design, part.board.label,
        "The selected stock sheet has an invalid length or width.",
        "Choose a valid board size in material settings."));
    }
  }

  for (const group of cut.unplaced) {
    for (const piece of group.pieces) {
      issues.push(issue("error", "part-does-not-fit", design, piece.label,
        `${piece.reason} (stock: ${group.boardLabel}).`,
        "Change the part or select a compatible stock sheet; do not cut from this layout."));
    }
  }

  for (const board of cut.byBoard) {
    const expected = new Map<number, number>();
    for (const row of board.rows) expected.set(row.index, row.quantity);
    const actual = new Map<number, number>();
    for (const sheet of board.nesting.sheets) {
      for (const place of sheet.placements) {
        actual.set(place.index, (actual.get(place.index) ?? 0) + 1);
        const outside = place.x < 0 || place.y < 0 ||
          place.x + place.width > sheet.length + 0.001 ||
          place.y + place.height > sheet.width + 0.001;
        if (outside) {
          issues.push(issue("error", "placement-out-of-bounds", design, place.label,
            `The part extends beyond the usable sheet on sheet ${sheet.number}.`,
            "Regenerate the cutting layout before manufacturing."));
        }
        const row = board.rows.find((item) => item.index === place.index);
        if (row?.grainLocked && place.rotated) {
          issues.push(issue("error", "grain-direction", design, place.label,
            "A grain-locked part is rotated in the cutting layout.",
            "Keep the grain direction and regenerate the nesting layout."));
        }
      }
      for (let i = 0; i < sheet.placements.length; i += 1) {
        const a = sheet.placements[i]!;
        for (let j = i + 1; j < sheet.placements.length; j += 1) {
          const b = sheet.placements[j]!;
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width &&
            a.y < b.y + b.height && b.y < a.y + a.height;
          if (overlap) {
            issues.push(issue("error", "overlapping-cuts", design, `${a.label} / ${b.label}`,
              `Two parts overlap on ${board.boardLabel}, sheet ${sheet.number}.`,
              "Do not use this layout; regenerate it and inspect the sheet diagram."));
          }
        }
      }
    }
    for (const [index, quantity] of expected) {
      if ((actual.get(index) ?? 0) !== quantity) {
        const row = board.rows.find((item) => item.index === index);
        issues.push(issue("error", "cut-quantity-mismatch", design, row?.label ?? String(index),
          `The layout places ${actual.get(index) ?? 0} of ${quantity} required piece(s).`,
          "Regenerate the cut list and verify every piece is placed."));
      }
    }
  }

  for (const item of cut.hardware) {
    if (!Number.isFinite(item.quantity) || item.quantity < 0) {
      issues.push(issue("error", "invalid-hardware-quantity", design, item.label,
        "Hardware quantity is negative or not a finite number.",
        "Review the fitting selection and hardware schedule."));
    }
  }

  if (!issues.some((entry) => entry.severity === "error")) {
    issues.push(issue("info", "manufacturing-check-passed", design, "Production geometry",
      `Validated ${breakdown.parts.length} generated part definition(s), ${cut.totals.pieces} cut piece(s), and ${cut.byBoard.length} stock material group(s).`,
      "Confirm supplier prices, finish, grain direction and workshop measurements before cutting."));
  }
  return issues;
}
