import { fromMarkup, fromPrice, vat } from "../cost";
import { num, str, type CalculatorSpec } from "../types";
import { round } from "../units";

export const businessSpecs: CalculatorSpec[] = [
  {
    slug: "markup",
    title: "Markup Calculator",
    category: "business",
    summary: "Selling price and profit from a cost and a markup percentage — and the margin it really gives you.",
    keywords: ["markup", "mark up", "price", "profit", "selling price", "quote"],
    note: "Markup is measured against your cost. The margin it produces is always a smaller number — 25% markup is a 20% margin — and quoting one when you meant the other is the most expensive arithmetic mistake in contracting.",
    fields: [
      { kind: "money", id: "cost", label: "Your cost", placeholder: "100000" },
      { kind: "number", id: "markup", label: "Markup", suffix: "%", defaultValue: 25, placeholder: "25" },
    ],
    compute(values) {
      const cost = num(values, "cost");
      const result = fromMarkup(cost, num(values, "markup", 25));

      return {
        headline: { label: "Selling price", value: result.price.toFixed(2), unit: "ETB" },
        lines: [
          { label: "Cost", value: cost.toFixed(2), unit: "ETB", muted: true },
          { label: "Profit", value: result.profit.toFixed(2), unit: "ETB" },
          { label: "Margin this gives", value: result.marginPercent.toFixed(2), unit: "%" },
        ],
        formula: result.formula,
      };
    },
  },

  {
    slug: "margin",
    title: "Margin Calculator",
    category: "business",
    summary: "Profit, margin and the equivalent markup from a cost and a selling price.",
    keywords: ["margin", "profit", "gross margin", "percentage", "selling price"],
    fields: [
      { kind: "money", id: "cost", label: "Your cost", placeholder: "100000" },
      { kind: "money", id: "price", label: "Selling price", placeholder: "125000" },
    ],
    compute(values) {
      const cost = num(values, "cost");
      const price = num(values, "price");
      const result = fromPrice(cost, price);

      const warnings: string[] = [];
      if (result.profit < 0) {
        warnings.push("The selling price is below cost — this job loses money at that figure.");
      }

      return {
        headline: { label: "Margin", value: result.marginPercent.toFixed(2), unit: "%" },
        lines: [
          { label: "Profit", value: result.profit.toFixed(2), unit: "ETB" },
          { label: "Equivalent markup on cost", value: result.markupPercent.toFixed(2), unit: "%" },
          { label: "Cost as a share of the price", value: price > 0 ? round((cost / price) * 100, 2).toFixed(2) : "—", unit: "%", muted: true },
        ],
        formula: result.formula,
        warnings,
      };
    },
  },

  {
    slug: "vat",
    title: "VAT Calculator",
    category: "business",
    summary: "Add VAT to a net figure, or pull it back out of a tax-inclusive one. The rate is yours to set.",
    keywords: ["vat", "tax", "value added tax", "inclusive", "exclusive", "net", "gross", "tot"],
    note: "The rate defaults to 15%, the standard Ethiopian VAT rate at the time of writing. Change it to whatever applies to your invoice — nothing here is fixed.",
    fields: [
      {
        kind: "select",
        id: "direction",
        label: "The amount I have is",
        options: [
          { value: "exclusive", label: "Net — VAT still to be added" },
          { value: "inclusive", label: "Gross — VAT already included" },
        ],
        defaultValue: "exclusive",
      },
      { kind: "money", id: "amount", label: "Amount", placeholder: "100000" },
      { kind: "number", id: "rate", label: "VAT rate", suffix: "%", defaultValue: 15, placeholder: "15" },
    ],
    compute(values) {
      const inclusive = str(values, "direction", "exclusive") === "inclusive";
      const result = vat(num(values, "amount"), num(values, "rate", 15), inclusive);

      return {
        headline: {
          label: inclusive ? "Net, before VAT" : "Gross, including VAT",
          value: (inclusive ? result.net : result.gross).toFixed(2),
          unit: "ETB",
        },
        lines: [
          { label: "Net", value: result.net.toFixed(2), unit: "ETB" },
          { label: "VAT", value: result.tax.toFixed(2), unit: "ETB" },
          { label: "Gross", value: result.gross.toFixed(2), unit: "ETB" },
        ],
        formula: result.formula,
      };
    },
  },
];
