import type { Quantity } from "./measure";
import type { DataSource } from "./model";

/**
 * The bill of quantities.
 *
 * Sections A–W in the order Ethiopian bills are written, an item structure a
 * quantity surveyor recognises, and — the part that matters most — a line back
 * from every number to the elements it was measured from.
 *
 * ## Why every line carries element ids
 *
 * The brief asked for it directly: click "Exterior painting, 683.4 m²" and the
 * exterior walls light up in the 3D model. That is not a separate index or a
 * search; it is `elementIds`, carried unchanged from the measurement through
 * the item to the bill, and used as the highlight set. One field, threaded all
 * the way, is what makes the chain traceable in both directions.
 *
 * The reverse direction falls out of the same field: given an element, the
 * lines that mention it are the lines it contributed to.
 */

/** The standard sections. Only the ones with items in them get printed. */
export const BOQ_SECTIONS = [
  { code: "A", title: "Preliminaries" },
  { code: "B", title: "Earthworks" },
  { code: "C", title: "Concrete" },
  { code: "D", title: "Reinforcement" },
  { code: "E", title: "Formwork" },
  { code: "F", title: "Masonry" },
  { code: "G", title: "Waterproofing" },
  { code: "H", title: "Roofing" },
  { code: "I", title: "Doors & Windows" },
  { code: "J", title: "Plastering" },
  { code: "K", title: "Flooring" },
  { code: "L", title: "Wall Finishes" },
  { code: "M", title: "Painting" },
  { code: "N", title: "Ceiling" },
  { code: "O", title: "Plumbing" },
  { code: "P", title: "Sanitary" },
  { code: "Q", title: "Electrical" },
  { code: "R", title: "HVAC / MEP" },
  { code: "S", title: "Joinery" },
  { code: "T", title: "Kitchen" },
  { code: "U", title: "Wardrobes" },
  { code: "V", title: "Furniture" },
  { code: "W", title: "External Works" },
] as const;

export type BoqSectionCode = (typeof BOQ_SECTIONS)[number]["code"];

export function sectionTitle(code: BoqSectionCode): string {
  return BOQ_SECTIONS.find((section) => section.code === code)?.title ?? code;
}

/**
 * One line of the bill.
 *
 * `rate` and `amount` are optional because a bill is a real document before it
 * is priced — a tender bill goes out with the quantities and no rates at all,
 * and forcing a zero into those columns turns "not yet priced" into "free".
 */
export type BoqItem = {
  /** "C.03". Assigned when the bill is assembled, not by the caller. */
  ref: string;
  section: BoqSectionCode;
  description: string;
  unit: string;
  quantity: number;

  rate?: number | null;
  amount?: number | null;
  currency?: string;

  /** Where the quantity came from and how much to trust it. */
  source: DataSource;
  confidence: number;
  /** The sum, so the quantity can be checked without opening the model. */
  formula?: string | null;
  /** Sheet reference, when the measurement came off a drawing. */
  drawingRef?: string | null;
  /** Every element behind this line. The highlight set. */
  elementIds: string[];
  /** Anything the reader has to know: assumptions, missing information. */
  notes?: string[];
};

export type BoqSection = {
  code: BoqSectionCode;
  title: string;
  items: BoqItem[];
  /** Null while any item in the section is unpriced. */
  total: number | null;
};

export type Boq = {
  title: string;
  currency: string;
  sections: BoqSection[];
  /** Null while anything is unpriced — a partial total is a misleading one. */
  total: number | null;
  /** Lines whose quantity rests on an AI estimate, for the covering note. */
  estimatedItems: number;
  /** Lines with no rate yet. */
  unpricedItems: number;
};

/** What a caller hands in, before refs and totals are worked out. */
export type BoqDraftItem = Omit<BoqItem, "ref" | "amount"> & {
  ref?: string;
};

/**
 * Builds one quantity into a draft item.
 *
 * The point of going through this rather than writing the object by hand is
 * that the formula, the provenance and the element ids come across
 * automatically. Every one of those is something a person would forget on the
 * fortieth line, and each is exactly what makes the line checkable.
 */
export function itemFromQuantity(
  section: BoqSectionCode,
  description: string,
  quantity: Quantity,
  options: {
    unit?: string;
    rate?: number | null;
    drawingRef?: string | null;
    notes?: string[];
  } = {},
): BoqDraftItem {
  return {
    section,
    description,
    unit: options.unit ?? quantity.unit,
    quantity: quantity.value,
    rate: options.rate ?? null,
    source: quantity.source,
    confidence: quantity.confidence,
    formula: quantity.formula,
    drawingRef: options.drawingRef ?? null,
    elementIds: quantity.elementIds,
    notes: options.notes,
  };
}

/**
 * Assembles the bill.
 *
 * Empty sections are dropped — the brief asked for that and it is right: a bill
 * with "H. Roofing … nil" in it on a project with no roof wastes the reader's
 * time and invites the question of whether it was forgotten.
 *
 * Amounts are computed here rather than trusted from the caller, so a rate
 * change cannot leave a stale amount behind it.
 */
export function buildBoq(
  title: string,
  drafts: BoqDraftItem[],
  currency = "ETB",
): Boq {
  const sections: BoqSection[] = [];
  let estimatedItems = 0;
  let unpricedItems = 0;

  for (const { code, title: sectionTitleText } of BOQ_SECTIONS) {
    const inSection = drafts.filter((draft) => draft.section === code);
    if (inSection.length === 0) continue;

    const items: BoqItem[] = inSection.map((draft, index) => {
      const rate = draft.rate ?? null;
      const amount =
        rate === null ? null : Math.round(draft.quantity * rate * 100) / 100;

      if (draft.source === "ai") estimatedItems += 1;
      if (rate === null) unpricedItems += 1;

      return {
        ...draft,
        ref: `${code}.${String(index + 1).padStart(2, "0")}`,
        rate,
        amount,
        currency,
      };
    });

    // A section total is only meaningful when every line in it has a rate.
    const sectionTotal = items.every((item) => item.amount !== null)
      ? Math.round(
          items.reduce((sum, item) => sum + (item.amount ?? 0), 0) * 100,
        ) / 100
      : null;

    sections.push({ code, title: sectionTitleText, items, total: sectionTotal });
  }

  const total = sections.every((section) => section.total !== null)
    ? Math.round(
        sections.reduce((sum, section) => sum + (section.total ?? 0), 0) * 100,
      ) / 100
    : null;

  return {
    title,
    currency,
    sections,
    total: sections.length === 0 ? null : total,
    estimatedItems,
    unpricedItems,
  };
}

/** Every line in the bill, flattened. */
export function allItems(boq: Boq): BoqItem[] {
  return boq.sections.flatMap((section) => section.items);
}

/**
 * The elements to highlight when somebody clicks a line.
 *
 * The forward direction of the traceability chain.
 */
export function elementsForItem(item: BoqItem): string[] {
  return item.elementIds;
}

/**
 * The lines an element contributed to.
 *
 * The reverse direction. Clicking a wall in the 3D model and seeing that it
 * appears in masonry, plaster, and paint is the check that catches an element
 * measured twice — which is the most common way a bill comes out over.
 */
export function itemsForElement(boq: Boq, elementId: string): BoqItem[] {
  return allItems(boq).filter((item) => item.elementIds.includes(elementId));
}

/**
 * Whether this bill can responsibly be sent to anybody.
 *
 * Not a score. Three specific questions with specific answers, because "82%
 * confident" tells a reader nothing they can act on and "four quantities rest
 * on AI estimates" tells them exactly what to check.
 */
export function boqWarnings(boq: Boq): string[] {
  const warnings: string[] = [];
  const items = allItems(boq);

  if (boq.estimatedItems > 0) {
    warnings.push(
      `${boq.estimatedItems} quantit${boq.estimatedItems === 1 ? "y rests" : "ies rest"} on an AI estimate rather than measured geometry. Verify before tendering.`,
    );
  }
  if (boq.unpricedItems > 0) {
    warnings.push(
      `${boq.unpricedItems} item${boq.unpricedItems === 1 ? " has" : "s have"} no rate yet, so no total is shown.`,
    );
  }

  const lowConfidence = items.filter((item) => item.confidence < 0.6);
  if (lowConfidence.length > 0) {
    warnings.push(
      `${lowConfidence.length} item${lowConfidence.length === 1 ? "" : "s"} measured with low confidence: ${lowConfidence
        .slice(0, 3)
        .map((item) => item.ref)
        .join(", ")}${lowConfidence.length > 3 ? "…" : ""}.`,
    );
  }

  return warnings;
}
