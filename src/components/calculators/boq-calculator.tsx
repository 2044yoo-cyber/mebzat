"use client";

import { useMemo, useState } from "react";

import { Download, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BOQ_SECTIONS } from "@/lib/takeoff/boq";
import { formatNumber, round } from "@/lib/calculators/units";

/**
 * A bill of quantities, typed by hand.
 *
 * The section codes are `BOQ_SECTIONS` from the takeoff engine — A Preliminaries
 * through W External Works, the order an Ethiopian bill is written in. Using the
 * same list means a bill typed here and a bill measured off a model come out
 * under the same headings, which is the whole point of having a standard order.
 *
 * Rows are unlimited and every total is derived, never stored: there is no way
 * for a line total to disagree with its own quantity and rate.
 */

type Row = {
  id: string;
  section: string;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
};

const UNITS = ["m", "m²", "m³", "kg", "t", "no", "sum", "item", "L", "day"];

function blankRow(): Row {
  return {
    id: Math.random().toString(36).slice(2),
    section: "C",
    description: "",
    unit: "m³",
    quantity: "",
    rate: "",
  };
}

/** A number a person typed, or zero. Never NaN. */
function value(raw: string): number {
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function BoqCalculator({ currency = "ETB" }: { currency?: string }) {
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow(), blankRow()]);
  const [wastePercent, setWastePercent] = useState("5");
  const [labourPercent, setLabourPercent] = useState("25");
  const [taxPercent, setTaxPercent] = useState("15");

  const totals = useMemo(() => {
    const lines = rows.map((row) => ({
      ...row,
      amount: value(row.quantity) * value(row.rate),
    }));

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const waste = subtotal * (value(wastePercent) / 100);
    const labour = subtotal * (value(labourPercent) / 100);
    const beforeTax = subtotal + waste + labour;
    const tax = beforeTax * (value(taxPercent) / 100);

    return { lines, subtotal, waste, labour, beforeTax, tax, total: beforeTax + tax };
  }, [rows, wastePercent, labourPercent, taxPercent]);

  const filled = totals.lines.filter((line) => line.description.trim() !== "" || line.amount > 0);

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function exportCsv() {
    const header = ["Section", "Description", "Unit", "Quantity", "Rate", "Amount"];
    const body = totals.lines.map((line) => [
      line.section,
      line.description,
      line.unit,
      line.quantity,
      line.rate,
      round(line.amount, 2).toFixed(2),
    ]);
    const summary = [
      [],
      ["", "", "", "", "Subtotal", round(totals.subtotal, 2).toFixed(2)],
      ["", "", "", "", `Waste ${wastePercent}%`, round(totals.waste, 2).toFixed(2)],
      ["", "", "", "", `Labour ${labourPercent}%`, round(totals.labour, 2).toFixed(2)],
      ["", "", "", "", `Tax ${taxPercent}%`, round(totals.tax, 2).toFixed(2)],
      ["", "", "", "", `Grand total (${currency})`, round(totals.total, 2).toFixed(2)],
    ];

    // Quotes are doubled and every cell is wrapped, so a description containing
    // a comma does not silently split into two columns.
    const csv = [header, ...body, ...summary]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "medosha_boq.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border">
        {/* The bill scrolls inside its own box on a phone rather than taking the
            page sideways with it. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="w-32 px-3 py-2 font-medium">Section</th>
                <th scope="col" className="px-3 py-2 font-medium">Description</th>
                <th scope="col" className="w-20 px-3 py-2 font-medium">Unit</th>
                <th scope="col" className="w-24 px-3 py-2 font-medium">Qty</th>
                <th scope="col" className="w-28 px-3 py-2 font-medium">Rate</th>
                <th scope="col" className="w-28 px-3 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="w-12 px-3 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {totals.lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="px-2 py-1.5">
                    <select
                      value={line.section}
                      onChange={(event) => update(line.id, { section: event.target.value })}
                      aria-label={`Section for line ${index + 1}`}
                      className="h-10 w-full rounded-lg border bg-background px-2 text-xs"
                    >
                      {BOQ_SECTIONS.map((section) => (
                        <option key={section.code} value={section.code}>
                          {section.code} — {section.title}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={line.description}
                      onChange={(event) => update(line.id, { description: event.target.value })}
                      placeholder="Mass concrete in foundations"
                      aria-label={`Description for line ${index + 1}`}
                      className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-sm"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={line.unit}
                      onChange={(event) => update(line.id, { unit: event.target.value })}
                      aria-label={`Unit for line ${index + 1}`}
                      className="h-10 w-full rounded-lg border bg-background px-1 text-sm"
                    >
                      {UNITS.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={line.quantity}
                      onChange={(event) => update(line.id, { quantity: event.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Quantity for line ${index + 1}`}
                      className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={line.rate}
                      onChange={(event) => update(line.id, { rate: event.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Rate for line ${index + 1}`}
                      className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right text-sm font-medium tabular-nums">
                    {formatNumber(line.amount)}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((row) => row.id !== line.id))}
                      aria-label={`Remove line ${index + 1}`}
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t p-3">
          <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, blankRow()])}>
            <Plus className="size-4" />
            Add a line
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border p-4 sm:p-5">
          <p className="mb-4 text-sm font-medium">Additions</p>
          <div className="space-y-4">
            <Percent label="Material waste" value={wastePercent} onChange={setWastePercent} help="Applied to the bill subtotal." />
            <Percent label="Labour" value={labourPercent} onChange={setLabourPercent} help="As a percentage of the measured work, when it is not billed separately." />
            <Percent label="Tax / VAT" value={taxPercent} onChange={setTaxPercent} help="Applied last, to everything above it." />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Grand total</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums sm:text-5xl">{formatNumber(totals.total)}</span>
            <span className="text-base text-muted-foreground">{currency}</span>
          </p>

          <dl className="mt-5 divide-y border-t">
            <Line label={`Measured work (${filled.length} line${filled.length === 1 ? "" : "s"})`} value={totals.subtotal} />
            <Line label={`Waste ${wastePercent}%`} value={totals.waste} muted />
            <Line label={`Labour ${labourPercent}%`} value={totals.labour} muted />
            <Line label="Before tax" value={totals.beforeTax} />
            <Line label={`Tax ${taxPercent}%`} value={totals.tax} muted />
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportCsv} className="flex-1">
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button type="button" variant="outline" onClick={() => window.print()} className="flex-1">
              <Printer className="size-4" />
              Print
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRows([blankRow(), blankRow(), blankRow()])}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Percent({
  label,
  value: current,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  help: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <span className="flex items-stretch gap-2">
        <input
          value={current}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm tabular-nums"
        />
        <span className="flex w-12 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm text-muted-foreground">
          %
        </span>
      </span>
      <span className="mt-1.5 block text-xs text-muted-foreground">{help}</span>
    </label>
  );
}

function Line({ label, value: amount, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className={muted ? "text-sm text-muted-foreground" : "text-sm"}>{label}</dt>
      <dd className={muted ? "text-sm tabular-nums text-muted-foreground" : "text-sm font-medium tabular-nums"}>
        {formatNumber(amount)}
      </dd>
    </div>
  );
}
