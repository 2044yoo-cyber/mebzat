import { groupBill, type Bill } from "./boq";
import { TEMPLATES, type BuildingAreas, type BuildingConfig } from "./building-config";
import { ADDITIONAL_BASIS_LABELS, COST_FLAG_LABELS, type CostRules, type Estimate } from "./estimate";
import { CURRENCY, RATE_STATUS_LABELS, type PriceBook, type RateStatus } from "./price-book";
import { ENGINEERING_DISCLAIMER } from "./stages";
import { PROVENANCE_LABELS, type ConstructionModel, type EstimatingRules, type ModelOptions } from "./types";

/**
 * The bill of quantities and the cost estimate as a report: the same tables whether they are written to a spreadsheet or to a PDF, so that the two never
 * disagree. Nothing here is worked out again: every figure is read from the bill and the estimate it is given.
 */

export type ReportCell = string | number | null;

export type ReportColumn = {
  header: string;
  align: "left" | "right";
  /** Decimal places for a number, in the PDF; a spreadsheet keeps the number. */
  digits?: number;
  /** Relative width in the PDF. */
  weight: number;
};

export type ReportTable = {
  id: string;
  /** Sheet name in a workbook, 31 characters at most. */
  sheet: string;
  title: string;
  note?: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  /** The column whose value heads each run of rows in the PDF (and is left out of it); a spreadsheet keeps it as a column. */
  groupBy?: number;
};

export type Report = {
  title: string;
  subtitle: string;
  generatedAt: string;
  /** Key facts: the building, its areas, the totals. */
  summary: [string, string][];
  tables: ReportTable[];
  notes: string[];
};

export type ReportInput = {
  model: ConstructionModel;
  /** The configurator's building, or null for a project of the learner's own, which has no template. */
  building: BuildingConfig | null;
  areas: BuildingAreas;
  options: ModelOptions;
  rules: EstimatingRules;
  bill: Bill;
  estimate: Estimate;
  book: PriceBook;
  costRules: CostRules;
  /** ISO date or time the report is made; given rather than read from the clock, so the same study gives the same report. */
  generatedAt: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number, digits = 0) => n.toLocaleString("en", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const L = (header: string, weight: number): ReportColumn => ({ header, align: "left", weight });
const R = (header: string, weight: number, digits = 0): ReportColumn => ({ header, align: "right", weight, digits });

export function buildReport(input: ReportInput): Report {
  const { model, building, areas, options, rules, bill, estimate, book, costRules } = input;
  const template = building ? TEMPLATES[building.template] : null;
  const e = estimate;
  const tables: ReportTable[] = [];

  // ---- The bill of quantities, four ways -----------------------------------------------------------------------------------------------------------------
  const billRows = (by: "section" | "floor" | "stage" | "category") =>
    groupBill(bill, by).flatMap((g) => g.rows.map((row): ReportCell[] => [g.label, row.line.ref, row.line.description, row.line.unit, row.net === null ? null : r3(row.net), row.allowance === null ? null : r3(row.allowance), row.status]));
  const billColumns = (first: string): ReportColumn[] => [L(first, 1), L("Ref", 0.6), L("Description", 3.4), L("Unit", 0.7), R("Net quantity", 1.2, 3), R("Allowance", 1, 3), L("Status", 1)];
  const note = "Net quantities, with the allowance for waste kept apart. Status says how sure each figure is: measured from the drawing, calculated, an assumption, to be reviewed, or missing.";
  tables.push({ id: "bill", sheet: "BOQ", title: "Bill of quantities by section", note, columns: billColumns("Section"), rows: billRows("section"), groupBy: 0 });
  tables.push({ id: "bill-floor", sheet: "BOQ by floor", title: "Bill of quantities by floor", note: `${note} The slab, beams and balconies of a storey are billed with the floor they form.`, columns: billColumns("Floor"), rows: billRows("floor"), groupBy: 0 });
  tables.push({ id: "bill-stage", sheet: "BOQ by stage", title: "Bill of quantities by construction stage", note, columns: billColumns("Stage"), rows: billRows("stage"), groupBy: 0 });
  tables.push({ id: "bill-category", sheet: "BOQ by category", title: "Bill of quantities by category", note, columns: billColumns("Category"), rows: billRows("category"), groupBy: 0 });

  // ---- The cost ---------------------------------------------------------------------------------------------------------------------------------------
  const buildUp: ReportCell[][] = [
    ["Materials, with waste", r2(e.materials)],
    ["Labour", r2(e.labour)],
    ["Direct cost", r2(e.direct)],
    ...e.additional.map((a): ReportCell[] => [`${a.name}${a.enabled ? "" : " (left out)"}: ${a.basis === "fixed" ? "a fixed sum" : `${a.value} ${ADDITIONAL_BASIS_LABELS[a.basis]}`}`, r2(a.amount)]),
    ["Additional costs", r2(e.additionalTotal)],
    ["Subtotal", r2(e.subtotal)],
    [`Contingency, ${e.contingency.percent} % of the subtotal`, r2(e.contingency.amount)],
    ...e.taxes.map((t): ReportCell[] => [`${t.name}, ${t.percent} %${t.enabled ? "" : " (left out)"}`, r2(t.amount)]),
    ["Taxes", r2(e.taxTotal)],
    ["TOTAL", r2(e.total)],
  ];
  tables.push({ id: "cost-summary", sheet: "Cost summary", title: `How the total is built up (${CURRENCY})`, columns: [L("Item", 4), R(`Amount, ${CURRENCY}`, 1.4, 2)], rows: buildUp });

  const groupRows: ReportCell[][] = (["section", "floor", "stage", "category"] as const).flatMap((by) =>
    e.groups[by].map((g): ReportCell[] => [by === "section" ? "By section" : by === "floor" ? "By floor" : by === "stage" ? "By stage" : "By category", g.label, r2(g.material), r2(g.labour), r2(g.total), e.direct > 0 ? r3(g.total / e.direct) : null]),
  );
  tables.push({
    id: "cost-groups", sheet: "Cost by group", title: "Where the direct cost falls", note: "Each grouping adds up to the direct cost.",
    columns: [L("Grouping", 1), L("Group", 3.2), R("Materials", 1.3, 0), R("Labour", 1.3, 0), R("Total", 1.3, 0), { header: "Share", align: "right", weight: 0.9, digits: 3 }],
    rows: groupRows, groupBy: 0,
  });

  const flagWords = (flags: string[]) => flags.map((f) => COST_FLAG_LABELS[f as keyof typeof COST_FLAG_LABELS] ?? f).join("; ");
  const bySection = new Map(bill.sections.map((s) => [s.code, `${s.code}. ${s.title}`] as const));
  tables.push({
    id: "cost-lines", sheet: "Cost", title: "The bill, priced",
    note: "Material is the quantity plus its waste allowance times the material rate; labour is the net quantity times the labour rate. A line included in another has no price of its own.",
    columns: [L("Section", 1), L("Ref", 0.6), L("Description", 2.6), L("Unit", 0.6), R("Quantity", 1, 3), R("Material rate", 1, 2), R("Labour rate", 1, 2), R("Material", 1.1, 0), R("Labour", 1.1, 0), R("Total", 1.1, 0), L("Flags", 2.4)],
    rows: [
      ...e.lines.map((l): ReportCell[] => [bySection.get(l.section) ?? l.section, l.ref, l.description, l.unit, l.net === null ? null : r3(l.net), l.materialRate, l.labourRate, r2(l.material), r2(l.labour), r2(l.total), l.pricing === "included" ? `Included in ${l.includedIn}` : flagWords(l.flags)]),
      ["Total", "", "", "", null, null, null, r2(e.materials), r2(e.labour), r2(e.direct), ""],
    ],
    groupBy: 0,
  });

  const word = (status: RateStatus | null, rate: number | null, has: boolean): string => (status === null ? (rate === 0 ? "nothing to pay" : has ? "no rate" : "no entry") : status === "assumed" ? "example" : status);
  const sourceOf = (rate: { source: string; date: string | null } | undefined): string => (rate ? (rate.date ? `${rate.source}, ${rate.date}` : rate.source) : "");
  tables.push({
    id: "rates", sheet: "Rates used", title: "The rates used", note: `The price book: ${book.name}. A rate marked example is an assumption that came with the book, not a quotation and not a market price.`,
    columns: [L("Work item", 2.6), L("Unit", 0.6), R("Material", 0.9, 2), R("Labour", 0.9, 2), L("Material rate is", 1), L("Labour rate is", 1), L("Material source", 2), L("Labour source", 2)],
    rows: e.lines.filter((l) => l.pricing !== "included").map((l): ReportCell[] => {
      const entry = book.entries[l.workItem];
      return [l.workItem, l.unit, l.materialRate, l.labourRate, word(l.materialRateStatus, l.materialRate, !!entry), word(l.labourRateStatus, l.labourRate, !!entry), sourceOf(entry?.material), sourceOf(entry?.labour)];
    }),
  });

  tables.push({
    id: "problems", sheet: "To put right", title: "What could not be priced",
    note: e.summary.problems.length ? "These lines are not in the total, or are only partly priced." : "Every line has a quantity and a price, or is included in another line's rate.",
    columns: [L("Ref", 0.7), L("Description", 3), L("Problem", 4)],
    rows: e.summary.problems.map((p): ReportCell[] => [p.ref, p.description, `${COST_FLAG_LABELS[p.flag]}. ${p.detail}`]),
  });

  const ratios = Object.entries(rules.reinforcement.ratios).sort(([a], [b]) => a.localeCompare(b));
  tables.push({
    id: "assumptions", sheet: "Assumptions", title: "The rules and assumptions behind the figures",
    columns: [L("Topic", 1.6), L("Setting", 3), L("Value", 1.6)],
    rows: [
      ["Roof", "Roof type", options.roofType], ["Walls", "Block type", options.blockType], ["Floors", "Floor finish", options.floorFinish],
      ["Quantities", "Openings deducted from wall areas", rules.openingDeduction === "over-threshold" ? `those over ${rules.openingThresholdM2} m²` : rules.openingDeduction],
      ["Quantities", "Mortar joint, mm", rules.jointMm],
      ["Reinforcement", "Source of steel quantities", rules.reinforcement.basis === "ratio" ? "Estimated from kg of steel per m³ of concrete (not a bar schedule)" : "Only an approved bar schedule"],
      ...(rules.reinforcement.basis === "ratio" ? ratios.map(([k, v]): ReportCell[] => ["Reinforcement", `kg of steel per m³: ${k.replace("concrete.", "")}`, v]) : []),
      ...Object.entries(rules.allowances).map(([k, v]): ReportCell[] => ["Waste allowance", `${k}, %`, v]),
      ...costRules.additional.map((a): ReportCell[] => ["Additional cost", `${a.name} (${a.enabled ? "included" : "left out"}; ${ADDITIONAL_BASIS_LABELS[a.basis]})`, a.value]),
      ["Contingency", "% of the subtotal", costRules.contingencyPercent],
      ...costRules.taxes.map((t): ReportCell[] => ["Tax", `${t.name} (${t.enabled ? "included" : "left out"}), %`, t.percent]),
    ],
  });

  const share = (n: number) => `${fmt((n / (e.direct || 1)) * 100, 1)} %`;
  const summary: [string, string][] = [
    ["Building", model.title],
    ...(building && template
      ? ([["Template", template.label], ["Floors", String(building.floors)], ["Length × width, mm", `${fmt(building.length)} × ${fmt(building.width)}`], ["Floor to floor, mm", fmt(building.floorToFloor)]] as [string, string][])
      : ([["Template", "Your own project"], ["Floors", String(model.storeys.length)]] as [string, string][])),
    ["Footprint, m²", fmt(areas.footprint, 1)],
    ["Gross floor area, m²", fmt(areas.grossFloorArea, 1)],
    ["Balconies, m²", fmt(areas.balconyPerFloor.reduce((a, b) => a + b, 0), 1)],
    ["Total slab area, m²", fmt(areas.totalSlabArea, 1)],
    ["Roof", `${options.roofType === "pitched" ? "Pitched" : "Flat"}, ${fmt(areas.roofArea, 1)} m² of covering`],
    ["Direct cost", `${CURRENCY} ${fmt(e.direct)}`],
    ["Total with additions, contingency and tax", `${CURRENCY} ${fmt(e.total)}`],
    ["Per m² of gross floor area", e.area.perM2 === null ? "—" : `${CURRENCY} ${fmt(e.area.perM2)}`],
    ["Per m² of slab, balconies included", e.area.perM2Slab === null ? "—" : `${CURRENCY} ${fmt(e.area.perM2Slab)}`],
    ["Direct cost on example rates", `${share(e.summary.directByRate.assumed)}`],
    ["Direct cost on rates entered", `${share(e.summary.directByRate.entered)}`],
    ["Direct cost on rates quoted", `${share(e.summary.directByRate.quoted)}`],
    ["Direct cost on assumed quantities", `${share(e.summary.directByQuantity.assumed + e.summary.directByQuantity.review)}`],
    ["Lines", `${e.summary.byPricing.priced} priced, ${e.summary.byPricing.partial} partly, ${e.summary.byPricing.unpriced} unpriced, ${e.summary.byPricing["no-quantity"]} without a quantity, ${e.summary.byPricing.included} included in another`],
  ];

  const notes = [
    `Prices are in ${CURRENCY} and are indicative. The rates that came with the price book are examples (${RATE_STATUS_LABELS.assumed.toLowerCase()}); only a rate marked entered or quoted is anyone's figure.`,
    "Reinforcement is estimated from a typical weight of steel for each cubic metre of concrete, not from a bar schedule: the structural design replaces it.",
    ENGINEERING_DISCLAIMER,
    `Quantity statuses: ${(Object.keys(PROVENANCE_LABELS) as (keyof typeof PROVENANCE_LABELS)[]).map((k) => `${k} = ${PROVENANCE_LABELS[k]}`).join("; ")}.`,
  ];

  return {
    title: `${template ? template.label : "Project"}: bill of quantities and cost estimate`,
    subtitle: model.title,
    generatedAt: input.generatedAt,
    summary, tables, notes,
  };
}
