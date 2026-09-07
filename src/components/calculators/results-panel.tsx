"use client";

import { AlertTriangle, ChevronDown, Printer, Sigma } from "lucide-react";

import { cn } from "@/lib/utils";
import { safeText } from "@/lib/calculators/validate";
import type { CalcOutput } from "@/lib/calculators/types";

/**
 * The answer.
 *
 * Three things are load-bearing here.
 *
 * **The headline is enormous.** Somebody standing on a site holding a phone
 * needs one number, and it should be readable without bringing the screen
 * closer.
 *
 * **`safeText` guards every printed value.** Validated inputs should make it
 * impossible for `NaN` to reach this component, but "should" is doing a lot of
 * work in a system with forty calculators, and the word NaN on screen destroys
 * confidence in every other number on the page.
 *
 * **The working is one tap away.** A quantity surveyor will not trust a number
 * whose derivation is hidden, and hiding it by default keeps the page calm for
 * everybody who does not need it.
 */
export function ResultsPanel({
  output,
  structural,
  showWorking,
  onToggleWorking,
  title,
}: {
  output: CalcOutput;
  structural?: boolean;
  showWorking: boolean;
  onToggleWorking: () => void;
  title: string;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {output.headline.label}
        </p>
        <p className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums sm:text-5xl">
            {safeText(output.headline.value)}
          </span>
          {output.headline.unit && (
            <span className="text-base text-muted-foreground">{output.headline.unit}</span>
          )}
        </p>

        {output.lines.length > 0 && (
          <dl className="mt-5 divide-y border-t">
            {output.lines.map((line, index) => (
              <div
                key={`${line.label}-${index}`}
                className="flex items-baseline justify-between gap-3 py-2.5"
              >
                <dt className={cn("text-sm", line.muted && "text-muted-foreground")}>{line.label}</dt>
                <dd
                  className={cn(
                    "shrink-0 text-right text-sm font-medium tabular-nums",
                    line.muted && "font-normal text-muted-foreground",
                  )}
                >
                  {safeText(line.value)}
                  {line.unit && <span className="ml-1 font-normal text-muted-foreground">{line.unit}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {output.warnings && output.warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            Worth checking
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-900 dark:text-amber-200/90">
            {output.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {output.tables?.map((table) => (
        <div key={table.title} className="rounded-2xl border">
          <p className="border-b px-4 py-3 text-sm font-medium">{table.title}</p>
          {/* Wide tables scroll inside their own box; the page never scrolls sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {table.columns.map((column) => (
                    <th key={column} scope="col" className="px-4 py-2 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {table.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-2 tabular-nums">
                        {safeText(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.note && <p className="border-t px-4 py-3 text-xs text-muted-foreground">{table.note}</p>}
        </div>
      ))}

      {structural && (
        <p className="rounded-2xl border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">Quantities only.</strong> These estimates are
          for planning and ordering. They do not replace structural engineering design, and they do not
          discharge any local building-code requirement. Have a registered structural engineer design
          and check anything that carries load.
        </p>
      )}

      <div className="rounded-2xl border">
        <button
          type="button"
          onClick={onToggleWorking}
          aria-expanded={showWorking}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <Sigma className="size-4" />
            Show calculation
          </span>
          <ChevronDown className={cn("size-4 transition-transform", showWorking && "rotate-180")} />
        </button>
        {showWorking && (
          <div className="border-t px-4 py-3">
            <ol className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {output.formula.map((step, index) => (
                <li key={index} className="break-words font-mono">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => window.print()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted print:hidden"
      >
        <Printer className="size-4" />
        Print this {title.replace(" Calculator", "").toLowerCase()} result
      </button>
    </div>
  );
}
