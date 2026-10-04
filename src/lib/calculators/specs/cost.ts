import { buildCost, BUILD_QUALITY, CITIES, cityFactor, cityLabel, labourCost, qualityFactor } from "../cost";
import { count, num, str, type CalculatorSpec } from "../types";
import { round } from "../units";

const CITY_OPTIONS = CITIES.map((city) => ({ value: city.value, label: city.label }));

export const costSpecs: CalculatorSpec[] = [
  {
    slug: "material-cost",
    title: "Material Cost Calculator",
    category: "cost",
    summary: "Add up any number of materials by quantity and unit price, with waste and VAT.",
    keywords: ["material", "cost", "price", "quantity", "unit price", "total", "supplier"],
    custom: "materials",
    fields: [],
  },

  {
    slug: "labour-cost",
    title: "Labour Cost Calculator",
    category: "cost",
    summary: "Crew cost from workers, daily wage and days — with man-days, man-hours and a cost per hour.",
    keywords: ["labour", "labor", "wage", "workers", "daily", "crew", "man days", "man hours"],
    fields: [
      { kind: "number", id: "workers", label: "Workers", suffix: "people", integer: true, defaultValue: 6, min: 1 },
      { kind: "money", id: "wage", label: "Daily wage each", placeholder: "500" },
      { kind: "number", id: "days", label: "Days", suffix: "days", defaultValue: 20, min: 0 },
      { kind: "number", id: "hours", label: "Working hours per day", suffix: "hours", defaultValue: 8, min: 1 },
      {
        kind: "number",
        id: "overhead",
        label: "Overhead on labour",
        suffix: "%",
        defaultValue: 0,
        optional: true,
        help: "Supervision, transport, site welfare — anything you carry per head.",
      },
    ],
    compute(values) {
      const result = labourCost({
        workers: count(values, "workers", 6),
        dailyWage: num(values, "wage"),
        days: num(values, "days", 20),
        hoursPerDay: num(values, "hours", 8),
      });

      const overheadPercent = num(values, "overhead", 0);
      const overhead = result.total * (Math.max(0, overheadPercent) / 100);
      const total = result.total + overhead;

      return {
        headline: { label: "Total labour cost", value: round(total, 2).toFixed(2), unit: "ETB" },
        lines: [
          { label: "Wages", value: result.total.toFixed(2), unit: "ETB" },
          ...(overheadPercent > 0
            ? [{ label: `Overhead (${overheadPercent}%)`, value: round(overhead, 2).toFixed(2), unit: "ETB" }]
            : []),
          { label: "Man-days", value: result.manDays.toFixed(1), unit: "days" },
          { label: "Man-hours", value: result.manHours.toFixed(1), unit: "hours" },
          { label: "Cost per man-hour", value: result.perHour.toFixed(2), unit: "ETB", muted: true },
        ],
        formula: [
          ...result.formula,
          ...(overheadPercent > 0
            ? [`Overhead = ${result.total.toFixed(2)} × ${overheadPercent}% = ${round(overhead, 2).toFixed(2)}`]
            : []),
        ],
      };
    },
  },

  {
    slug: "project-cost",
    title: "Project Cost Calculator",
    category: "cost",
    summary: "Materials, labour, equipment, transport and overheads into one total, with waste and contingency applied correctly.",
    keywords: ["project", "cost", "total", "budget", "overhead", "contingency", "equipment", "transport"],
    note: "Waste is applied to materials only; contingency is applied to the whole subtotal afterwards. Applying either to the wrong base is how an estimate ends up several percent out before anything is ordered.",
    fields: [
      { kind: "money", id: "material", label: "Materials", placeholder: "800000" },
      { kind: "money", id: "labour", label: "Labour", placeholder: "300000" },
      { kind: "money", id: "equipment", label: "Equipment and plant", placeholder: "80000", optional: true },
      { kind: "money", id: "transport", label: "Transport", placeholder: "40000", optional: true },
      { kind: "money", id: "other", label: "Other costs", placeholder: "0", optional: true },
      { kind: "number", id: "overhead", label: "Overhead", suffix: "%", defaultValue: 10, optional: true },
      { kind: "number", id: "waste", label: "Material waste", suffix: "%", defaultValue: 5, optional: true },
      { kind: "number", id: "contingency", label: "Contingency", suffix: "%", defaultValue: 10, optional: true },
    ],
    compute(values) {
      const material = num(values, "material");
      const labour = num(values, "labour");
      const other = num(values, "equipment") + num(values, "transport") + num(values, "other");

      const base = buildCost({
        material,
        labour,
        other,
        wastePercent: num(values, "waste", 5),
        contingencyPercent: num(values, "contingency", 10),
      });

      const overheadPercent = num(values, "overhead", 10);
      const overhead = base.total * (Math.max(0, overheadPercent) / 100);
      const total = base.total + overhead;

      return {
        headline: { label: "Total project cost", value: round(total, 2).toFixed(2), unit: "ETB" },
        lines: [
          { label: "Materials", value: base.material.toFixed(2), unit: "ETB", muted: true },
          { label: "Material waste", value: base.waste.toFixed(2), unit: "ETB", muted: true },
          { label: "Labour", value: base.labour.toFixed(2), unit: "ETB", muted: true },
          { label: "Equipment, transport and other", value: base.other.toFixed(2), unit: "ETB", muted: true },
          { label: "Contingency", value: base.contingency.toFixed(2), unit: "ETB" },
          ...(overheadPercent > 0
            ? [{ label: `Overhead (${overheadPercent}%)`, value: round(overhead, 2).toFixed(2), unit: "ETB" }]
            : []),
        ],
        formula: [
          ...base.formula,
          ...(overheadPercent > 0
            ? [
                `Overhead = ${base.total.toFixed(2)} × ${overheadPercent}% = ${round(overhead, 2).toFixed(2)}`,
                `Total = ${round(total, 2).toFixed(2)}`,
              ]
            : []),
        ],
      };
    },
  },
];

export const constructionSpecs: CalculatorSpec[] = [
  {
    slug: "construction-cost",
    title: "Construction Cost Calculator",
    category: "construction",
    summary: "Budget a build from its floor area, storeys, quality and location — with the rate you supply, not one we invented.",
    keywords: ["construction cost", "build cost", "budget", "estimate", "per m2", "quality", "storeys"],
    popular: true,
    note: "The rate per square metre is yours to supply. Medosha does not publish a national build rate, and a calculator that invented one would give you a confident number with nothing behind it. Take the rate from a recent comparable job, or from the Price Exchange.",
    fields: [
      { kind: "number", id: "area", label: "Floor area per storey", suffix: "m²", placeholder: "120" },
      { kind: "number", id: "floors", label: "Storeys", suffix: "floors", integer: true, defaultValue: 1, min: 1 },
      { kind: "money", id: "materialRate", label: "Material cost per m²", placeholder: "12000", help: "Your own rate, or one from a comparable job." },
      { kind: "money", id: "labourRate", label: "Labour cost per m²", placeholder: "5000" },
      {
        kind: "select",
        id: "quality",
        label: "Construction quality",
        options: BUILD_QUALITY.map((q) => ({ value: q.value, label: q.label })),
        defaultValue: "standard",
      },
      { kind: "select", id: "city", label: "Location", options: CITY_OPTIONS, defaultValue: "addis_ababa" },
      { kind: "number", id: "waste", label: "Material waste", suffix: "%", defaultValue: 5, optional: true },
      { kind: "number", id: "contingency", label: "Contingency", suffix: "%", defaultValue: 10, optional: true },
    ],
    compute(values) {
      const area = num(values, "area");
      const floors = count(values, "floors", 1);
      const totalArea = area * floors;

      const quality = str(values, "quality", "standard");
      const city = str(values, "city", "addis_ababa");
      const qFactor = qualityFactor(quality);
      const cFactor = cityFactor(city);

      const material = totalArea * num(values, "materialRate") * qFactor * cFactor;
      const labour = totalArea * num(values, "labourRate") * qFactor;

      const result = buildCost({
        material,
        labour,
        wastePercent: num(values, "waste", 5),
        contingencyPercent: num(values, "contingency", 10),
      });

      return {
        headline: { label: "Total estimated cost", value: result.total.toFixed(2), unit: "ETB" },
        lines: [
          { label: "Total floor area", value: round(totalArea, 2).toFixed(2), unit: "m²" },
          { label: "Materials", value: result.material.toFixed(2), unit: "ETB" },
          { label: "Material waste", value: result.waste.toFixed(2), unit: "ETB", muted: true },
          { label: "Labour", value: result.labour.toFixed(2), unit: "ETB" },
          { label: "Contingency", value: result.contingency.toFixed(2), unit: "ETB" },
          {
            label: "Cost per m²",
            value: totalArea > 0 ? round(result.total / totalArea, 2).toFixed(2) : "—",
            unit: "ETB/m²",
          },
        ],
        formula: [
          `Floor area = ${area} m² × ${floors} storey${floors === 1 ? "" : "s"} = ${round(totalArea, 2).toFixed(2)} m²`,
          `Quality factor (${quality}) = ×${qFactor}; location factor (${cityLabel(city)}) = ×${cFactor}`,
          `Materials = ${round(totalArea, 2).toFixed(2)} m² × ${num(values, "materialRate")} × ${qFactor} × ${cFactor} = ${result.material.toFixed(2)}`,
          `Labour = ${round(totalArea, 2).toFixed(2)} m² × ${num(values, "labourRate")} × ${qFactor} = ${result.labour.toFixed(2)}`,
          ...result.formula,
        ],
        warnings: [
          "The quality and location factors adjust the rate you entered; they are planning adjustments, not market prices. Confirm against a recent quotation before committing to a budget.",
        ],
      };
    },
  },

  {
    slug: "boq",
    title: "BOQ Calculator",
    category: "construction",
    summary: "Build a bill of quantities line by line, with waste, labour, tax and a grand total. Print, export or save it.",
    keywords: ["boq", "bill of quantities", "tender", "items", "rates", "quantity surveyor", "bill"],
    popular: true,
    custom: "boq",
    fields: [],
  },

  {
    slug: "project-profit",
    title: "Project Profit Calculator",
    category: "construction",
    summary: "Gross profit, margin and the cost breakdown for a project against its contract value.",
    keywords: ["profit", "margin", "contract value", "gross profit", "project", "overhead", "net"],
    fields: [
      { kind: "money", id: "contract", label: "Contract value", placeholder: "2500000" },
      { kind: "money", id: "material", label: "Materials", placeholder: "1000000" },
      { kind: "money", id: "labour", label: "Labour", placeholder: "500000" },
      { kind: "money", id: "equipment", label: "Equipment", placeholder: "150000", optional: true },
      { kind: "money", id: "transport", label: "Transport", placeholder: "80000", optional: true },
      { kind: "money", id: "other", label: "Other expenses", placeholder: "50000", optional: true },
      { kind: "number", id: "overhead", label: "Overhead", suffix: "%", defaultValue: 10, optional: true, help: "Company overhead carried by this job, as a share of its direct cost." },
    ],
    compute(values) {
      const contract = num(values, "contract");
      const direct =
        num(values, "material") +
        num(values, "labour") +
        num(values, "equipment") +
        num(values, "transport") +
        num(values, "other");

      const overheadPercent = num(values, "overhead", 10);
      const overhead = direct * (Math.max(0, overheadPercent) / 100);
      const totalCost = direct + overhead;
      const gross = contract - direct;
      const net = contract - totalCost;
      const margin = contract > 0 ? (net / contract) * 100 : 0;

      const warnings: string[] = [];
      if (net < 0) warnings.push("This project loses money once overhead is carried. Re-check the rates or the scope.");
      else if (margin < 5 && contract > 0) {
        warnings.push(`A ${round(margin, 2)}% net margin leaves almost nothing for the things that go wrong.`);
      }

      return {
        headline: { label: "Net profit", value: round(net, 2).toFixed(2), unit: "ETB" },
        lines: [
          { label: "Contract value", value: contract.toFixed(2), unit: "ETB", muted: true },
          { label: "Direct cost", value: round(direct, 2).toFixed(2), unit: "ETB" },
          { label: `Overhead (${overheadPercent}%)`, value: round(overhead, 2).toFixed(2), unit: "ETB" },
          { label: "Total cost", value: round(totalCost, 2).toFixed(2), unit: "ETB" },
          { label: "Gross profit (before overhead)", value: round(gross, 2).toFixed(2), unit: "ETB" },
          { label: "Net margin", value: round(margin, 2).toFixed(2), unit: "%" },
          {
            label: "Cost as a share of contract",
            value: contract > 0 ? round((totalCost / contract) * 100, 2).toFixed(2) : "—",
            unit: "%",
            muted: true,
          },
        ],
        formula: [
          `Direct cost = ${round(direct, 2).toFixed(2)}`,
          `Overhead = ${round(direct, 2).toFixed(2)} × ${overheadPercent}% = ${round(overhead, 2).toFixed(2)}`,
          `Total cost = ${round(totalCost, 2).toFixed(2)}`,
          `Gross profit = ${contract.toFixed(2)} − ${round(direct, 2).toFixed(2)} = ${round(gross, 2).toFixed(2)}`,
          `Net profit = ${contract.toFixed(2)} − ${round(totalCost, 2).toFixed(2)} = ${round(net, 2).toFixed(2)}`,
          `Net margin = ${round(net, 2).toFixed(2)} ÷ ${contract.toFixed(2)} = ${round(margin, 2)}%`,
        ],
        warnings,
      };
    },
  },
];
