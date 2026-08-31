"use client";

import { useCallback, useMemo, useState } from "react";

import { calculateCost } from "../services/costing";
import { buildCutList, sheetCountsOf } from "../services/cutlist";
import { buildParts } from "../services/geometry";
import type { CostBreakdown, MarketRate } from "../types/cost";
import type { PartsBreakdown } from "../types/parts";
import { validateSpec, type DesignSpec, type SpecIssue } from "../types/spec";

/**
 * The design the studio is holding, and everything that follows from it.
 *
 * Parts, cost and issues are derived, never stored. That is the whole point of
 * the spec-first architecture from phase 0: dragging the width slider changes
 * one number, and the cut list, the sheet count, the labour days and the price
 * all fall out of it by pure arithmetic — in the browser, immediately, with no
 * round trip and no possibility of the price on screen disagreeing with the
 * parts being priced.
 *
 * Every edit runs the physical validator, so the rail behaves exactly like the
 * AI: widen a bay past 600 mm and the single door quietly becomes a pair, with
 * a line saying so.
 */

export type DesignState = {
  spec: DesignSpec | null;
  parts: PartsBreakdown | null;
  cost: CostBreakdown | null;
  issues: SpecIssue[];
};

export type DesignController = DesignState & {
  /** Replaces the design wholesale — what an AI turn does. */
  replace: (spec: DesignSpec, issues: SpecIssue[]) => void;
  /** Edits the design in place — what the configuration rail does. */
  edit: (mutate: (draft: DesignSpec) => void) => void;
  /**
   * Accepts a whole edited spec — what the control panel's operations return.
   *
   * Revalidates rather than trusting it. The operations validate too, but they
   * return only the spec; the structured issue list is what puts "this shelf
   * will sag" in front of somebody, and passing an empty array here would have
   * quietly thrown every warning away.
   */
  set: (spec: DesignSpec) => void;
  clear: () => void;
};

/**
 * The spec and its issues are one state object rather than two.
 *
 * They have to move together: an edit produces a repaired spec *and* the list
 * of repairs, and holding them separately would mean calling one setter from
 * inside the other's updater — which React is entitled to run twice, and which
 * the compiler rightly refuses to compile.
 */
type Held = { spec: DesignSpec | null; issues: SpecIssue[] };

const EMPTY: Held = { spec: null, issues: [] };

export function useDesign(rates: MarketRate[]): DesignController {
  const [held, setHeld] = useState<Held>(EMPTY);

  const derived = useMemo(() => {
    if (!held.spec) return { parts: null, cost: null };
    const parts = buildParts(held.spec);

    // Nested here too, in the browser, on every edit. It is forty rectangles
    // and it costs nothing — and skipping it would mean the price on the
    // studio panel came from an allowance while the price on the cut list came
    // from a layout, which is two prices for one design.
    const cutList = buildCutList(held.spec, parts);
    return {
      parts,
      cost: calculateCost(held.spec, parts, {
        rates,
        sheetCounts: sheetCountsOf(cutList),
      }),
    };
  }, [held.spec, rates]);

  const replace = useCallback((spec: DesignSpec, issues: SpecIssue[]) => {
    setHeld({ spec, issues });
  }, []);

  const edit = useCallback((mutate: (draft: DesignSpec) => void) => {
    setHeld((previous) => {
      if (!previous.spec) return previous;

      // Cloned before mutation so the updater stays pure. React may call it
      // twice, and a mutation of `previous.spec` would apply twice.
      const draft = structuredClone(previous.spec);
      mutate(draft);

      // Corrections are cleared first because the validator appends to them.
      // Without this, ten slider nudges leave ten copies of the same line and
      // the panel reads like the design is falling apart.
      draft.meta.corrections = [];

      const result = validateSpec(draft);
      return { spec: result.spec, issues: result.issues };
    });
  }, []);

  const set = useCallback((spec: DesignSpec) => {
    const draft = structuredClone(spec);
    draft.meta.corrections = [];
    const result = validateSpec(draft);
    setHeld({ spec: result.spec, issues: result.issues });
  }, []);

  const clear = useCallback(() => setHeld(EMPTY), []);

  return {
    spec: held.spec,
    issues: held.issues,
    ...derived,
    replace,
    edit,
    set,
    clear,
  };
}
