"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, Search } from "lucide-react";

import { cn } from "@/lib/utils";

import { buildBill, type BillGrouping } from "../construction/boq";
import type { BuildingAreas } from "../construction/building-config";
import {
  ADDITIONAL_BASIS_LABELS, COST_FLAG_LABELS, DEFAULT_COST_RULES, estimateCost,
  type AdditionalBasis, type CostFlag, type CostRules, type Estimate, type EstimateLine,
} from "../construction/estimate";
import {
  CURRENCY, RATE_STATUS_LABELS, defaultPriceBook, noteRate, resetRate, setRate,
  type PriceBook, type RateKind, type RateStatus,
} from "../construction/price-book";
import { sectionTitle } from "@/lib/takeoff/boq";
import type { ConstructionModel, ViewState } from "../construction/types";
import { Section, Segmented, StatusBadge } from "./construction-panels";

/** Money, whole birr; rates to the centime. */
export const etb = (n: number | null, digits = 0): string => (n === null ? "—" : n.toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
const pct = (n: number): string => `${(n * 100).toLocaleString("en", { maximumFractionDigits: 1 })} %`;

const GROUPINGS: { id: BillGrouping; label: string }[] = [
  { id: "section", label: "Section" },
  { id: "floor", label: "Floor" },
  { id: "stage", label: "Stage" },
  { id: "category", label: "Category" },
];

const RATE_BADGE: Record<RateStatus, string> = {
  assumed: "border-amber-300 bg-amber-50 text-amber-900",
  entered: "border-sky-300 bg-sky-50 text-sky-900",
  quoted: "border-emerald-300 bg-emerald-50 text-emerald-900",
};
const RATE_WORD: Record<RateStatus, string> = { assumed: "example", entered: "entered", quoted: "quoted" };

const FLAG_STYLE: Partial<Record<CostFlag, string>> = {
  "no-price-entry": "border-red-300 bg-red-50 text-red-800",
  "unit-differs": "border-red-300 bg-red-50 text-red-800",
  "material-price-missing": "border-red-300 bg-red-50 text-red-800",
  "labour-price-missing": "border-red-300 bg-red-50 text-red-800",
  "no-quantity": "border-red-300 bg-red-50 text-red-800",
  "quantity-incomplete": "border-red-300 bg-red-50 text-red-800",
  "example-rate": RATE_BADGE.assumed,
  "entered-rate": RATE_BADGE.entered,
  "quoted-rate": RATE_BADGE.quoted,
  "quantity-assumed": "border-amber-300 bg-amber-50 text-amber-900",
  "quantity-review": "border-orange-300 bg-orange-50 text-orange-900",
  included: "border-slate-300 bg-slate-50 text-slate-700",
};

function Flag({ flag }: { flag: CostFlag }) {
  return <span data-flag={flag} className={cn("inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-tight", FLAG_STYLE[flag])}>{COST_FLAG_LABELS[flag]}</span>;
}

/** A number the learner types: what is on screen while typing is theirs; the figure goes through as soon as it is a figure. */
function NumberField({ value, onCommit, label, testId, step = "any", max, className }: { value: number | null; onCommit: (value: number | null) => void; label: string; testId?: string; step?: string; max?: number; className?: string }) {
  const shown = value === null ? "" : String(value);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      data-testid={testId}
      value={draft ?? shown}
      onFocus={() => setDraft(shown)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const text = e.target.value.trim().replaceAll(",", "");
        if (text === "") { onCommit(null); return; }
        const n = Number(text);
        if (Number.isFinite(n) && n >= 0 && (max === undefined || n <= max)) onCommit(n);
      }}
      data-step={step}
      className={cn("h-9 w-full min-w-0 rounded-lg border bg-background px-2 text-right text-sm tabular-nums", className)}
    />
  );
}

/** The estimate ---------------------------------------------------------------------------------------------------------- */

export function EstimatePanel({ model, view, areas, book, costRules, onCostRules, onHighlight, onPick }: {
  model: ConstructionModel; view: ViewState; areas: BuildingAreas; book: PriceBook; costRules: CostRules; onCostRules: (rules: CostRules) => void;
  onHighlight: (ids: string[]) => void; onPick: (id: string) => void;
}) {
  const bill = useMemo(() => buildBill(model, view.options, "building"), [model, view.options]);
  const estimate = useMemo(() => estimateCost(bill, book, costRules, { grossFloor: areas.grossFloorArea, totalSlab: areas.totalSlabArea }), [bill, book, costRules, areas.grossFloorArea, areas.totalSlabArea]);
  const [by, setBy] = useState<BillGrouping>("floor");
  const [q, setQ] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const s = estimate.summary;
  const unpriced = s.byPricing.unpriced + s.byPricing.partial + s.byPricing["no-quantity"];
  const needle = q.trim().toLowerCase();
  const shownLines = estimate.lines.filter((l) => (!problemsOnly || l.pricing === "unpriced" || l.pricing === "partial" || l.pricing === "no-quantity" || l.flags.includes("quantity-incomplete")) && (!needle || `${l.ref} ${l.description} ${l.workItem}`.toLowerCase().includes(needle)));
  const setAdditional = (id: string, patch: Partial<CostRules["additional"][number]>) => onCostRules({ ...costRules, additional: costRules.additional.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const setTax = (id: string, patch: Partial<CostRules["taxes"][number]>) => onCostRules({ ...costRules, taxes: costRules.taxes.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  // The cost up to the stage on show, for the stage view.
  const upToStage = useMemo(() => estimate.groups.stage.filter((g) => Number(g.key) <= view.stage).reduce((sum, g) => sum + g.total, 0), [estimate.groups.stage, view.stage]);
  const groups = estimate.groups[by];
  const biggest = Math.max(1, ...groups.map((g) => g.total));

  return (
    <div className="space-y-2" data-testid="estimate-panel">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" data-testid="estimate-disclaimer">
        <p className="flex items-start gap-1.5 font-semibold"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />An indicative estimate in Ethiopian birr, not a quotation</p>
        <p className="mt-1">
          {s.exampleShare > 0.005
            ? `${pct(s.exampleShare)} of the direct cost rests on example rates: assumptions that came with the price book, not market prices. `
            : "None of the direct cost rests on example rates. "}
          {unpriced > 0 ? `${unpriced} line${unpriced === 1 ? " has" : "s have"} no price or no quantity and ${unpriced === 1 ? "is" : "are"} not in the total. ` : ""}
          Replace the rates on the Rates tab with your own or a supplier&apos;s and the estimate follows at once; the building is not drawn again.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-3" data-testid="estimate-summary">
        <p className="text-xs text-muted-foreground">Total for the whole building, with additional costs, contingency and tax</p>
        <p className="text-2xl font-semibold tabular-nums" data-testid="estimate-total" data-value={estimate.total}>{CURRENCY} {etb(estimate.total)}</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Per m² of gross floor area ({etb(estimate.area.grossFloor)} m²)</dt>
          <dd className="text-right font-semibold tabular-nums" data-testid="estimate-per-m2" data-value={estimate.area.perM2 ?? ""}>{estimate.area.perM2 === null ? "—" : `${CURRENCY} ${etb(estimate.area.perM2)}`}</dd>
          <dt className="text-muted-foreground">Per m² of slab, balconies included ({etb(estimate.area.totalSlab)} m²)</dt>
          <dd className="text-right tabular-nums" data-testid="estimate-per-m2-slab">{estimate.area.perM2Slab === null ? "—" : `${CURRENCY} ${etb(estimate.area.perM2Slab)}`}</dd>
          <dt className="text-muted-foreground">Direct cost per m² (before additions and tax)</dt>
          <dd className="text-right tabular-nums" data-testid="estimate-direct-per-m2">{estimate.area.directPerM2 === null ? "—" : `${CURRENCY} ${etb(estimate.area.directPerM2)}`}</dd>
          <dt className="text-muted-foreground">Up to stage {view.stage} ({etb(upToStage)} direct)</dt>
          <dd className="text-right tabular-nums" data-testid="estimate-to-stage">{estimate.direct > 0 ? pct(upToStage / estimate.direct) : "—"}</dd>
        </dl>
      </section>

      <Section title="How the total is built up" testId="estimate-buildup">
        <table className="w-full text-xs">
          <tbody>
            <BuildRow label="Materials (with waste)" value={estimate.materials} testId="estimate-materials" />
            <BuildRow label="Labour" value={estimate.labour} testId="estimate-labour" />
            <BuildRow label="Direct cost" value={estimate.direct} testId="estimate-direct" strong />
          </tbody>
        </table>
        <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Additional costs</p>
        <ul className="space-y-1.5" data-testid="additional-costs">
          {costRules.additional.map((a, i) => {
            const row = estimate.additional[i]!;
            return (
              <li key={a.id} className="rounded-lg border p-2" data-additional={a.id}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={a.enabled} aria-label={`Include ${a.name}`} onChange={(e) => setAdditional(a.id, { enabled: e.target.checked })} />
                  <span className={cn("min-w-0 flex-1 text-xs", !a.enabled && "text-muted-foreground line-through")}>{a.name}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums" data-testid={`additional-${a.id}`}>{etb(row.amount)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 pl-6">
                  <div className="w-24"><NumberField value={a.value} onCommit={(v) => setAdditional(a.id, { value: v ?? 0 })} label={`${a.name}: ${a.basis === "fixed" ? "amount" : "percent"}`} testId={`additional-value-${a.id}`} max={a.basis === "fixed" ? 1e10 : 1000} /></div>
                  <select aria-label={`${a.name}: basis`} value={a.basis} onChange={(e) => setAdditional(a.id, { basis: e.target.value as AdditionalBasis })} className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-1.5 text-xs">
                    {(Object.keys(ADDITIONAL_BASIS_LABELS) as AdditionalBasis[]).map((b) => <option key={b} value={b}>{ADDITIONAL_BASIS_LABELS[b]}</option>)}
                  </select>
                </div>
                {a.note ? <p className="mt-1 pl-6 text-[11px] text-muted-foreground">{a.note}</p> : null}
              </li>
            );
          })}
        </ul>
        <table className="w-full text-xs">
          <tbody>
            <BuildRow label="Additional costs" value={estimate.additionalTotal} testId="estimate-additional-total" />
            <BuildRow label="Subtotal" value={estimate.subtotal} testId="estimate-subtotal" strong />
          </tbody>
        </table>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex-1">Contingency, % of the subtotal</span>
          <div className="w-20"><NumberField value={costRules.contingencyPercent} onCommit={(v) => onCostRules({ ...costRules, contingencyPercent: v ?? 0 })} label="Contingency percent" testId="contingency-percent" max={100} /></div>
          <span className="w-24 text-right font-semibold tabular-nums" data-testid="estimate-contingency">{etb(estimate.contingency.amount)}</span>
        </div>
        <ul className="space-y-1.5" data-testid="taxes">
          {costRules.taxes.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 text-xs" data-tax={t.id}>
              <input type="checkbox" checked={t.enabled} aria-label={`Include ${t.name}`} onChange={(e) => setTax(t.id, { enabled: e.target.checked })} />
              <span className={cn("min-w-0 flex-1", !t.enabled && "text-muted-foreground line-through")}>{t.name}, %</span>
              <div className="w-20"><NumberField value={t.percent} onCommit={(v) => setTax(t.id, { percent: v ?? 0 })} label={`${t.name}: percent`} testId={`tax-percent-${t.id}`} max={100} /></div>
              <span className="w-24 text-right font-semibold tabular-nums" data-testid={`tax-${t.id}`}>{etb(estimate.taxes[i]!.amount)}</span>
            </li>
          ))}
        </ul>
        {costRules.taxes.some((t) => t.note) ? <p className="text-[11px] text-muted-foreground">{costRules.taxes.find((t) => t.note)?.note}</p> : null}
        <table className="w-full text-xs">
          <tbody>
            <BuildRow label="Taxes" value={estimate.taxTotal} testId="estimate-tax-total" />
            <BuildRow label="Total" value={estimate.total} testId="estimate-total-row" strong />
          </tbody>
        </table>
        <button type="button" onClick={() => onCostRules(structuredClone(DEFAULT_COST_RULES))} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs"><RotateCcw className="size-3.5" />Put the additional costs back to the examples</button>
      </Section>

      <Section title="What the estimate rests on" testId="estimate-flags">
        <ul className="space-y-1 text-xs">
          <li data-flag-row="example"><span className="font-semibold">{etb(s.directByRate.assumed)}</span> of the direct cost is on example rates ({pct(s.exampleShare)}).</li>
          <li data-flag-row="entered"><span className="font-semibold">{etb(s.directByRate.entered)}</span> is on rates you entered.</li>
          <li data-flag-row="quoted"><span className="font-semibold">{etb(s.directByRate.quoted)}</span> is on rates a supplier quoted.</li>
          <li data-flag-row="quantity"><span className="font-semibold">{etb(s.directByQuantity.assumed + s.directByQuantity.review)}</span> is on quantities that are assumptions or need review (steel from kg per m³, for one).</li>
          <li data-flag-row="lines">{s.byPricing.priced} lines priced, {s.byPricing.partial} partly priced, {s.byPricing.unpriced} unpriced, {s.byPricing["no-quantity"]} without a quantity, {s.byPricing.included} included in another line&apos;s rate.</li>
        </ul>
        {s.problems.length ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900" data-testid="estimate-problems">
            <p className="font-semibold">{s.problems.length} thing{s.problems.length === 1 ? "" : "s"} to put right</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{s.problems.slice(0, 8).map((p) => <li key={`${p.ref}-${p.flag}`}><span className="font-mono">{p.ref}</span> {p.description}: {p.detail}</li>)}</ul>
            {s.problems.length > 8 ? <button type="button" onClick={() => setProblemsOnly(true)} className="mt-1 underline">Show all {s.problems.length} in the lines below</button> : null}
          </div>
        ) : <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900" data-testid="estimate-no-problems">Every line has a quantity and a price, or is included in another line&apos;s.</p>}
      </Section>

      <Section title="Where the cost falls" testId="estimate-breakdown">
        <Segmented label="Group the cost" value={by} onChange={setBy} options={GROUPINGS} />
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.key} data-group={g.key} data-grouping={by} className={cn("rounded-lg border p-2", by === "stage" && Number(g.key) === view.stage && "border-brand bg-brand/5")}>
              <div className="flex items-baseline gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{g.label}</span><span className="shrink-0 font-semibold tabular-nums" data-testid={`group-total-${g.key}`}>{etb(g.total)}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(1, (g.total / biggest) * 100)}%` }} /></div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">materials {etb(g.material)} · labour {etb(g.labour)} · {estimate.direct > 0 ? pct(g.total / estimate.direct) : "—"} of the direct cost</p>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground" data-testid="breakdown-sum">The groups add up to the direct cost: {etb(groups.reduce((sum, g) => sum + g.total, 0))} of {etb(estimate.direct)}.</p>
      </Section>

      <Section title={`The lines of the bill, priced (${shownLines.length})`} testId="estimate-lines" defaultOpen={false}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter priced lines" placeholder="Filter lines" className="min-h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm" /></label>
          <label className="flex min-h-10 items-center gap-1.5 text-xs"><input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />Problems only</label>
        </div>
        <ul>
          {shownLines.map((l) => <LineRow key={l.ref} line={l} model={model} open={open === l.ref} onToggle={() => { setOpen(open === l.ref ? null : l.ref); onHighlight(open === l.ref ? [] : [...new Set(l.parts.map((p) => p.componentId))]); }} onPick={onPick} />)}
        </ul>
      </Section>
    </div>
  );
}

function BuildRow({ label, value, testId, strong = false }: { label: string; value: number; testId: string; strong?: boolean }) {
  return (
    <tr className={cn(strong && "border-t font-semibold")}>
      <td className="py-1">{label}</td>
      <td className="py-1 text-right tabular-nums" data-testid={testId} data-value={value}>{etb(value)}</td>
    </tr>
  );
}

function LineRow({ line: l, model, open, onToggle, onPick }: { line: EstimateLine; model: ConstructionModel; open: boolean; onToggle: () => void; onPick: (id: string) => void }) {
  const ids = [...new Set(l.parts.map((p) => p.componentId))];
  return (
    <li className="border-b last:border-b-0" data-line={l.ref} data-pricing={l.pricing} data-work-item={l.workItem}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-12 w-full items-start gap-2 px-1 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-tight"><span className="mr-1.5 font-mono text-[11px] text-muted-foreground">{l.ref}</span>{l.description}</span>
          <span className="mt-0.5 flex flex-wrap gap-1">{l.flags.slice(0, 4).map((f) => <Flag key={f} flag={f} />)}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">{l.pricing === "included" ? "included" : etb(l.total)}</span>
          <span className="block text-[10px] text-muted-foreground tabular-nums">{l.net === null ? "no quantity" : `${etb(l.net, 3)} ${l.unit}`}</span>
        </span>
      </button>
      {open ? (
        <div className="space-y-1.5 px-1 pb-3 text-xs">
          {l.pricing === "included" ? <p>This line is priced with <span className="font-mono">{l.includedIn}</span>: its rate covers it. The quantity stays in the bill for ordering.</p> : (
            <>
              <p className="break-words rounded bg-muted p-1.5">
                Material ({etb(l.net, 3)} + {etb(l.allowance, 3)} waste) {l.unit} × {l.materialRate === null ? "no rate" : etb(l.materialRate, 2)} = {etb(l.material)}; labour {etb(l.net, 3)} {l.unit} × {l.labourRate === null ? "no rate" : etb(l.labourRate, 2)} = {etb(l.labour)}.
              </p>
              <p className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">Quantity:</span><StatusBadge status={l.quantityStatus} />
                {l.materialRateStatus ? <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", RATE_BADGE[l.materialRateStatus])}>material rate: {RATE_WORD[l.materialRateStatus]}</span> : null}
                {l.labourRateStatus ? <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", RATE_BADGE[l.labourRateStatus])}>labour rate: {RATE_WORD[l.labourRateStatus]}</span> : null}
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-1">{ids.slice(0, 6).map((id) => <button key={id} type="button" onClick={() => onPick(id)} className="max-w-48 truncate rounded-full border px-2 py-1 text-[11px]">{model.components.find((c) => c.id === id)?.name ?? id}</button>)}{ids.length > 6 ? <span className="px-1 py-1 text-[11px] text-muted-foreground">+{ids.length - 6} more lit up in 3D</span> : null}</div>
        </div>
      ) : null}
    </li>
  );
}

/** The rates ------------------------------------------------------------------------------------------------------------- */

export function RatesPanel({ model, view, areas, book, onBook, costRules }: { model: ConstructionModel; view: ViewState; areas: BuildingAreas; book: PriceBook; onBook: (book: PriceBook) => void; costRules: CostRules }) {
  const bill = useMemo(() => buildBill(model, view.options, "building"), [model, view.options]);
  const estimate = useMemo(() => estimateCost(bill, book, costRules, { grossFloor: areas.grossFloorArea, totalSlab: areas.totalSlabArea }), [bill, book, costRules, areas.grossFloorArea, areas.totalSlabArea]);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "building" | "missing" | "example" | "changed">("building");
  const [open, setOpen] = useState<string | null>(null);
  const lineOf = useMemo(() => new Map(estimate.lines.map((l) => [l.workItem, l])), [estimate.lines]);
  const descOf = useMemo(() => new Map(bill.lines.map((l) => [l.workItem, l.description])), [bill.lines]);
  const base = useMemo(() => defaultPriceBook(), []);
  const needle = q.trim().toLowerCase();
  const rows = Object.values(book.entries)
    .filter((e) => {
      const line = lineOf.get(e.workItem);
      if (only === "building" && !line) return false;
      if (only === "missing" && !(e.includedIn === null && (e.material.value === null || e.labour.value === null))) return false;
      if (only === "example" && !(e.includedIn === null && (e.material.status === "assumed" || e.labour.status === "assumed") && line)) return false;
      if (only === "changed" && JSON.stringify(e) === JSON.stringify(base.entries[e.workItem])) return false;
      return !needle || `${e.workItem} ${descOf.get(e.workItem) ?? ""}`.toLowerCase().includes(needle);
    })
    .sort((a, b) => a.workItem.localeCompare(b.workItem));
  const sections = new Map<string, typeof rows>();
  for (const e of rows) { const sec = lineOf.get(e.workItem)?.section ?? "—"; sections.set(sec, [...(sections.get(sec) ?? []), e]); }
  const changed = Object.values(book.entries).filter((e) => JSON.stringify(e) !== JSON.stringify(base.entries[e.workItem])).length;

  return (
    <div className="space-y-2" data-testid="rates-panel">
      <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
        <p><span className="font-semibold text-foreground">The price book.</span> A material rate and a labour rate in birr for each line of work. The rates that came with the book are examples, set so that an estimate can be seen working: they are assumptions, not quotations and not market prices. Type your own, or a supplier&apos;s, and say where it is from. Material is priced on the quantity plus its waste; labour on the net quantity.</p>
        <p className="mt-1" data-testid="rates-status">{changed} rate{changed === 1 ? "" : "s"} changed from the examples · {estimate.summary.byPricing.included} lines are priced inside another line&apos;s rate.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rates" placeholder="Search work" className="min-h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm" /></label>
        <select aria-label="Which rates" value={only} onChange={(e) => setOnly(e.target.value as typeof only)} className="min-h-10 rounded-xl border bg-background px-2 text-xs">
          <option value="building">Work in this building</option>
          <option value="all">All work in the book</option>
          <option value="missing">Rates missing</option>
          <option value="example">Still example rates</option>
          <option value="changed">Changed by you</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="rates-count">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</p>
      {[...sections].sort((a, b) => a[0].localeCompare(b[0])).map(([code, entries]) => (
        <details key={code} open={!!needle || only !== "building" || entries.length <= 6} className="rounded-xl border bg-card" data-rate-section={code}>
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{code === "—" ? "Not in this building" : `${code}. ${sectionTitle(code as Parameters<typeof sectionTitle>[0])}`} ({entries.length})</summary>
          <ul className="border-t">
            {entries.map((e) => {
              const line = lineOf.get(e.workItem);
              const isOpen = open === e.workItem;
              const isChanged = JSON.stringify(e) !== JSON.stringify(base.entries[e.workItem]);
              return (
                <li key={e.workItem} className="border-b p-2 last:border-b-0" data-rate-row={e.workItem} data-included={e.includedIn ? "true" : "false"}>
                  <div className="flex items-start gap-2">
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.workItem)} className="min-w-0 flex-1 text-left">
                      <span className="block text-xs leading-tight">{descOf.get(e.workItem) ?? e.workItem}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">{e.workItem} · per {e.unit}{line ? ` · ${line.ref}` : ""}</span>
                    </button>
                    {isChanged && !e.includedIn ? <button type="button" aria-label={`Put ${e.workItem} back to the example`} title="Put back to the example" onClick={() => onBook(resetRate(book, e.workItem))} className="flex size-8 shrink-0 items-center justify-center rounded-lg border"><RotateCcw className="size-3.5" /></button> : null}
                  </div>
                  {e.includedIn ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">Priced with <span className="font-mono">{e.includedIn}</span>. {e.note}</p>
                  ) : (
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      {(["material", "labour"] as RateKind[]).map((kind) => (
                        <div key={kind}>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground"><span className="capitalize">{kind}</span><span className={cn("rounded-full border px-1.5 leading-tight", RATE_BADGE[e[kind].status])} data-rate-status={e[kind].status}>{e[kind].value === null ? "missing" : RATE_WORD[e[kind].status]}</span></div>
                          <NumberField value={e[kind].value} onCommit={(v) => onBook(setRate(book, e.workItem, kind, v))} label={`${e.workItem} ${kind} rate`} testId={`rate-${e.workItem}-${kind}`} />
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !e.includedIn ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {(["material", "labour"] as RateKind[]).map((kind) => (
                        <div key={kind} className="space-y-1 rounded-lg bg-muted/50 p-2 text-[11px]">
                          <p className="font-semibold capitalize">{kind} rate: where it is from</p>
                          <input aria-label={`${e.workItem} ${kind} source`} value={e[kind].source} onChange={(ev) => onBook(noteRate(book, e.workItem, kind, { source: ev.target.value }))} className="h-9 w-full rounded-lg border bg-background px-2 text-xs" />
                          <div className="flex items-center gap-1.5">
                            <select aria-label={`${e.workItem} ${kind} status`} value={e[kind].status} onChange={(ev) => onBook(noteRate(book, e.workItem, kind, { status: ev.target.value as RateStatus }))} className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-1.5 text-xs">
                              {(Object.keys(RATE_STATUS_LABELS) as RateStatus[]).map((st) => <option key={st} value={st}>{RATE_STATUS_LABELS[st]}</option>)}
                            </select>
                            <input type="date" aria-label={`${e.workItem} ${kind} date`} value={e[kind].date ?? ""} onChange={(ev) => onBook(noteRate(book, e.workItem, kind, { date: ev.target.value || null }))} className="h-9 w-32 rounded-lg border bg-background px-1.5 text-xs" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
      <button type="button" data-testid="reset-rates" disabled={changed === 0} onClick={() => onBook(defaultPriceBook())} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-4 text-sm font-medium disabled:opacity-50"><RotateCcw className="size-4" />Put every rate back to the examples</button>
    </div>
  );
}

export type { Estimate };
