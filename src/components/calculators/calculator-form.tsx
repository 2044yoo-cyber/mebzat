"use client";

import { useMemo, useState } from "react";

import { Calculator, ChevronDown, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldInput } from "./field-input";
import { ResultsPanel } from "./results-panel";
import { SaveControl } from "./save-control";
import { fieldVisible, initialState, validate, type FormState } from "@/lib/calculators/validate";
import type { CalculatorSpec } from "@/lib/calculators/types";
import type { LengthUnit } from "@/lib/calculators/units";

/**
 * The form every calculator uses.
 *
 * Inputs on the left, results on the right, stacking to one column on a phone —
 * which is the layout the brief asked for and also the only one that works when
 * the results are longer than the inputs, as they are for a cut list.
 *
 * The result is computed on submit rather than on every keystroke. That is
 * deliberate: a number that changes while you are still typing the number above
 * it is unreadable, and half-typed input ("1." on the way to "1.5") would
 * flicker an error under every field.
 */
export function CalculatorForm({
  spec,
  currency = "ETB",
  seed,
  onCalculated,
}: {
  spec: CalculatorSpec;
  currency?: string;
  /**
   * Starting values from the URL, for a design arriving from the Studio.
   * Applied once, when the form is first built — not pushed in later, which
   * would overwrite whatever the reader had already typed.
   */
  seed?: Record<string, string>;
  onCalculated?: (summary: { headline: string; state: FormState }) => void;
}) {
  const [state, setState] = useState<FormState>(() => initialState(spec.fields, seed));
  const [submitted, setSubmitted] = useState(false);
  const [showWorking, setShowWorking] = useState(false);

  const visible = useMemo(
    () => spec.fields.filter((field) => fieldVisible(field, state)),
    [spec.fields, state],
  );

  const { values, errors } = useMemo(() => validate(spec.fields, state), [spec.fields, state]);

  // Only computed once the reader has asked, and only when nothing is wrong.
  const output = useMemo(() => {
    if (!submitted || Object.keys(errors).length > 0 || !spec.compute) return null;
    try {
      return spec.compute(values);
    } catch {
      // Arithmetic should not throw, but if it ever does the reader gets a
      // sentence rather than a stack trace.
      return null;
    }
  }, [submitted, errors, values, spec]);

  const failed = submitted && Object.keys(errors).length > 0;

  function setField(id: string, raw: string) {
    setState((prev) => ({ ...prev, [id]: { raw, unit: prev[id]?.unit ?? "m" } }));
  }

  function setUnit(id: string, unit: LengthUnit) {
    setState((prev) => ({ ...prev, [id]: { raw: prev[id]?.raw ?? "", unit } }));
  }

  function reset() {
    // Reset goes back to the calculator's own defaults, not to the seed. A
    // reader who pressed Reset wants a blank form, not the wardrobe they
    // arrived with.
    setState(initialState(spec.fields));
    setSubmitted(false);
    setShowWorking(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          const check = validate(spec.fields, state);
          if (Object.keys(check.errors).length === 0 && spec.compute) {
            const result = spec.compute(check.values);
            onCalculated?.({
              headline: `${result.headline.value} ${result.headline.unit ?? ""}`.trim(),
              state,
            });
          }
        }}
        className="rounded-2xl border p-4 sm:p-5"
      >
        {spec.note && (
          <p className="mb-4 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            {spec.note}
          </p>
        )}

        <div className="space-y-4">
          {visible.map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={state[field.id]?.raw ?? ""}
              unit={state[field.id]?.unit}
              error={submitted ? errors[field.id] : undefined}
              currency={currency}
              onValue={(raw) => setField(field.id, raw)}
              onUnit={(unit) => setUnit(field.id, unit)}
            />
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="submit" size="lg" className="h-12 flex-1 text-base">
            <Calculator className="size-4" />
            Calculate
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={reset} className="h-12">
            <RotateCcw className="size-4" />
            <span className="sr-only sm:not-sr-only">Reset</span>
          </Button>
        </div>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Check the fields marked above.
          </p>
        )}
      </form>

      <div className="min-w-0 lg:sticky lg:top-4">
        {output ? (
          <>
            <div className="mb-3 flex flex-wrap items-start gap-2">
              <SaveControl
                slug={spec.slug}
                state={state}
                headline={`${output.headline.value} ${output.headline.unit ?? ""}`.trim()}
              />
            </div>
            <ResultsPanel
              output={output}
              structural={spec.structural}
              showWorking={showWorking}
              onToggleWorking={() => setShowWorking((open) => !open)}
              title={spec.title}
            />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <Calculator className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Your result will appear here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Fill in the fields and press Calculate. Nothing is sent anywhere — the arithmetic runs
              on your device.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export { ChevronDown };
