"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CostBreakdown, CostGroup } from "../../types/cost";
import type { SpecIssue } from "../../types/spec";

/**
 * What it costs, and how much of that is actually known.
 *
 * The confidence meter is the reason this panel is built the way it is. A
 * price with no provenance is a number somebody made up, and the difference
 * between Berchuma and a spreadsheet is that this one can say which lines came
 * from a supplier listing on Medosha this week and which came from a constant.
 * When the price exchange has no matching listings the number is low and the
 * panel says so — that is the honest state of a young price table, not a fault
 * to hide behind a rounded total.
 */

const GROUP_LABELS: Record<CostGroup, string> = {
  material: "Boards",
  edge_band: "Edge banding",
  hardware: "Hardware",
  labour: "Shop labour",
  finishing: "Finishing",
  installation: "Installation",
  transport: "Delivery",
};

const GROUP_ORDER: CostGroup[] = [
  "material",
  "edge_band",
  "hardware",
  "labour",
  "finishing",
  "installation",
  "transport",
];

export function CostPanel({
  cost,
  issues,
  assumptions,
}: {
  cost: CostBreakdown;
  issues: SpecIssue[];
  assumptions: string[];
}) {
  const money = (value: number) =>
    `${cost.currency} ${Math.round(value).toLocaleString("en-US")}`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Estimated price
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {money(cost.price)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {money(cost.productionCost)} to make, plus {cost.margin.percent}% margin.
          Excludes VAT.
        </p>

        <Confidence value={cost.confidence} />

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Sheets" value={cost.sheets.reduce((n, s) => n + s.count, 0)} />
          <Stat label="Shop days" value={cost.productionDays} />
          {/* Offcut, not "waste": the waste allowance is already inside the
              sheet count, so quoting the allowance here alongside a zero-birr
              waste line read as though nothing was being thrown away. This is
              the share of the sheets bought that no part is cut from. */}
          <Stat label="Offcut" value={`${offcutPercent(cost)}%`} />
        </dl>
      </div>

      {issues.length > 0 ? <Issues issues={issues} /> : null}

      <div className="rounded-xl border bg-card">
        {GROUP_ORDER.filter((group) => cost.subtotals[group] > 0).map((group) => (
          <GroupRow
            key={group}
            label={GROUP_LABELS[group]}
            amount={cost.subtotals[group]}
            money={money}
            lines={cost.lines.filter((line) => line.group === group)}
          />
        ))}

        {/* Only when it is a real charge. The board allowance is already spent
            inside the sheet count above, and a line reading "Waste at 15% —
            ETB 0" invites the reader to conclude nothing is being wasted. */}
        {cost.waste.amount > 0 ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              Waste at {cost.waste.percent}%
            </span>
            <span className="tabular-nums">{money(cost.waste.amount)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm font-medium">
          <span>Cost to make</span>
          <span className="tabular-nums">{money(cost.productionCost)}</span>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Margin at {cost.margin.percent}%
          </span>
          <span className="tabular-nums">{money(cost.margin.amount)}</span>
        </div>
      </div>

      {cost.sheets.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sheet usage
          </p>
          <ul className="mt-2 space-y-2">
            {cost.sheets.map((sheet) => (
              <li key={sheet.boardId} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{sheet.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {sheet.count} × sheet
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.round(sheet.utilisation * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {Math.round(sheet.utilisation * 100)}% used — the rest is offcut.
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(assumptions.length > 0 || cost.assumptions.length > 0) && (
        <div className="rounded-xl border border-dashed p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Info className="size-3.5" aria-hidden />
            Assumed, not measured
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {/* Two sources merged, so an identical sentence from both is the
                ordinary case rather than the edge one — the spec's assumption
                and the costing's often say the same thing. Deduplicated so the
                reader sees it once, and keyed on position so the list is safe
                even when it is not. */}
            {[...new Set([...assumptions, ...cost.assumptions])].map(
              (line, index) => (
                <li key={`${index}-${line}`}>· {line}</li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The share of the board bought that no part is cut from.
 *
 * Weighted by sheets rather than averaged across board types, because nine
 * sheets of walnut at 78% and one of HDF at 40% is not a 59% job.
 */
function offcutPercent(cost: CostBreakdown): number {
  const total = cost.sheets.reduce((sum, sheet) => sum + sheet.count, 0);
  if (total === 0) return 0;
  const used = cost.sheets.reduce(
    (sum, sheet) => sum + sheet.utilisation * sheet.count,
    0,
  );
  return Math.max(0, Math.round(100 - (used / total) * 100));
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}

/**
 * How much of the price rests on live listings.
 *
 * Weighted by money rather than by line count, because a boards line worth
 * 40,000 birr and a shelf-pin line worth 90 are not equally load-bearing.
 */
function Confidence({ value }: { value: number }) {
  const percent = Math.round(value);
  const tone =
    percent >= 70
      ? "bg-emerald-500"
      : percent >= 35
        ? "bg-amber-500"
        : "bg-muted-foreground/50";

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Priced from live listings</span>
        <span className="font-medium tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", tone)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {percent === 0
          ? "No matching supplier listings yet — every rate below is an estimate."
          : percent >= 70
            ? "Most of this price comes from what suppliers are asking on Medosha now."
            : "Part of this price is estimated. Lines marked “est.” had no listing to match."}
      </p>
    </div>
  );
}

function GroupRow({
  label,
  amount,
  lines,
  money,
}: {
  label: string;
  amount: number;
  lines: CostBreakdown["lines"];
  money: (value: number) => string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50"
      >
        <span className="flex items-center gap-1.5">
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
          {label}
          <span className="text-xs text-muted-foreground">({lines.length})</span>
        </span>
        <span className="tabular-nums">{money(amount)}</span>
      </button>

      {open ? (
        <ul className="space-y-2 bg-muted/30 px-4 pb-3 pt-1">
          {lines.map((line) => (
            <li key={line.id} className="text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1">
                  {line.label}
                  {line.source === "fallback" ? (
                    <span
                      className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground"
                      title="No supplier listing matched this item, so a catalogue rate was used."
                    >
                      est.
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums">{money(line.amount)}</span>
              </div>
              <p className="text-muted-foreground">
                {line.quantity.toLocaleString("en-US")} {line.unit} ×{" "}
                {money(line.rate)}
                {line.note ? ` — ${line.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Issues({ issues }: { issues: SpecIssue[] }) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
        <AlertTriangle className="size-3.5" aria-hidden />
        {issues.length === 1 ? "One thing changed" : `${issues.length} things changed`}
      </p>
      <ul className="mt-2 space-y-2 text-xs">
        {issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            <p>{issue.message}</p>
            {issue.correction ? (
              <p className="text-muted-foreground">{issue.correction}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
