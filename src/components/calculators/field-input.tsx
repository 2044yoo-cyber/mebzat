"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";
import { LENGTH_LABELS, LENGTH_UNITS, type LengthUnit } from "@/lib/calculators/units";
import type { Field } from "@/lib/calculators/types";

/**
 * One input.
 *
 * Four field kinds, one component, because the parts that matter — the label
 * association, the error message, the touch target, the decimal keyboard on a
 * phone — are identical for all of them and should not be re-implemented per
 * kind.
 *
 * `inputMode="decimal"` is the difference between a usable phone form and an
 * unusable one: it brings up the numeric keypad *with a decimal point*, which
 * `type="number"` alone does not guarantee on Android.
 */
export function FieldInput({
  field,
  value,
  unit,
  error,
  currency,
  onValue,
  onUnit,
}: {
  field: Field;
  value: string;
  unit?: LengthUnit;
  error?: string;
  currency: string;
  onValue: (next: string) => void;
  onUnit: (next: LengthUnit) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  const describedBy = [error ? errorId : null, field.help ? helpId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {field.label}
        {field.optional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>}
      </label>

      {field.kind === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(event) => onValue(event.target.value)}
          aria-describedby={describedBy || undefined}
          className="h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-sm"
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex min-w-0 items-stretch gap-2">
          {field.kind === "money" && (
            <span className="flex shrink-0 items-center rounded-xl border bg-muted px-3 text-sm text-muted-foreground">
              {currency}
            </span>
          )}

          <input
            id={id}
            value={value}
            onChange={(event) => onValue(event.target.value)}
            placeholder={field.placeholder}
            // The numeric keypad with a decimal point, on every phone.
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            className={cn(
              "h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm tabular-nums",
              error && "border-destructive",
            )}
          />

          {field.kind === "length" && (
            <select
              value={unit}
              onChange={(event) => onUnit(event.target.value as LengthUnit)}
              aria-label={`Unit for ${field.label}`}
              className="h-11 w-20 shrink-0 rounded-xl border bg-muted px-2 text-sm"
            >
              {(field.units ?? LENGTH_UNITS).map((one) => (
                <option key={one} value={one}>
                  {LENGTH_LABELS[one]}
                </option>
              ))}
            </select>
          )}

          {field.kind === "number" && field.suffix && (
            <span className="flex w-20 shrink-0 items-center justify-center rounded-xl border bg-muted px-2 text-center text-xs text-muted-foreground">
              {field.suffix}
            </span>
          )}
        </div>
      )}

      {field.help && (
        <p id={helpId} className="mt-1.5 text-xs text-muted-foreground">
          {field.help}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
