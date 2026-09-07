"use client";

import { useMemo, useState } from "react";

import { Download, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatNumber, round } from "@/lib/calculators/units";

/**
 * A material list with a price against each line.
 *
 * The prices are typed. Medosha has a Price Exchange and this will read from it,
 * but a calculator that pre-filled invented birr figures would be worse than one
 * that asks — an estimate built on a made-up rate looks exactly like an estimate
 * built on a real one.
 */

type Row = { id: string; name: string; quantity: string; unit: string; price: string };

const UNITS = ["bags", "m³", "m²", "m", "kg", "t", "pcs", "no", "L", "sheets", "boxes"];

function blankRow(): Row {
  return { id: Math.random().toString(36).slice(2), name: "", quantity: "", unit: "pcs", price: "" };
}

function value(raw: string): number {
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function MaterialsCalculator({ currency = "ETB" }: { currency?: string }) {
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow(), blankRow()]);
  const [wastePercent, setWastePercent] = useState("5");
  const [taxPercent, setTaxPercent] = useState("15");

  const totals = useMemo(() => {
    const lines = rows.map((row) => ({ ...row, amount: value(row.quantity) * value(row.price) }));
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const waste = subtotal * (value(wastePercent) / 100);
    const beforeTax = subtotal + waste;
    const tax = beforeTax * (value(taxPercent) / 100);
    return { lines, subtotal, waste, beforeTax, tax, total: beforeTax + tax };
  }, [rows, wastePercent, taxPercent]);

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function exportCsv() {
    const csv = [
      ["Material", "Quantity", "Unit", "Unit price", "Amount"],
      ...totals.lines.map((line) => [
        line.name,
        line.quantity,
        line.unit,
        line.price,
        round(line.amount, 2).toFixed(2),
      ]),
      [],
      ["", "", "", "Subtotal", round(totals.subtotal, 2).toFixed(2)],
      ["", "", "", `Waste ${wastePercent}%`, round(totals.waste, 2).toFixed(2)],
      ["", "", "", `Tax ${taxPercent}%`, round(totals.tax, 2).toFixed(2)],
      ["", "", "", `Total (${currency})`, round(totals.total, 2).toFixed(2)],
    ]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "medosha_materials.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Material</th>
                <th scope="col" className="w-24 px-3 py-2 font-medium">Qty</th>
                <th scope="col" className="w-24 px-3 py-2 font-medium">Unit</th>
                <th scope="col" className="w-32 px-3 py-2 font-medium">Unit price</th>
                <th scope="col" className="w-32 px-3 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="w-12 px-3 py-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {totals.lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="px-2 py-1.5">
                    <input
                      value={line.name}
                      onChange={(event) => update(line.id, { name: event.target.value })}
                      placeholder="Cement, 50 kg bag"
                      aria-label={`Material for line ${index + 1}`}
                      className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-sm"
                    />
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
                    <select
                      value={line.unit}
                      onChange={(event) => update(line.id, { unit: event.target.value })}
                      aria-label={`Unit for line ${index + 1}`}
                      className="h-10 w-full rounded-lg border bg-background px-1 text-sm"
                    >
                      {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={line.price}
                      onChange={(event) => update(line.id, { price: event.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Unit price for line ${index + 1}`}
                      className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
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
            Add a material
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border p-4 sm:p-5">
          <p className="mb-4 text-sm font-medium">Additions</p>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Waste allowance</span>
              <span className="flex items-stretch gap-2">
                <input
                  value={wastePercent}
                  onChange={(event) => setWastePercent(event.target.value)}
                  inputMode="decimal"
                  className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm tabular-nums"
                />
                <span className="flex w-12 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm text-muted-foreground">%</span>
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Tax / VAT</span>
              <span className="flex items-stretch gap-2">
                <input
                  value={taxPercent}
                  onChange={(event) => setTaxPercent(event.target.value)}
                  inputMode="decimal"
                  className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm tabular-nums"
                />
                <span className="flex w-12 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm text-muted-foreground">%</span>
              </span>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total material cost</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums sm:text-5xl">{formatNumber(totals.total)}</span>
            <span className="text-base text-muted-foreground">{currency}</span>
          </p>
          <dl className="mt-5 divide-y border-t">
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-sm">Materials</dt>
              <dd className="text-sm font-medium tabular-nums">{formatNumber(totals.subtotal)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-sm text-muted-foreground">Waste {wastePercent}%</dt>
              <dd className="text-sm tabular-nums text-muted-foreground">{formatNumber(totals.waste)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-sm text-muted-foreground">Tax {taxPercent}%</dt>
              <dd className="text-sm tabular-nums text-muted-foreground">{formatNumber(totals.tax)}</dd>
            </div>
          </dl>
          <Button type="button" variant="outline" onClick={exportCsv} className="mt-5 w-full">
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
