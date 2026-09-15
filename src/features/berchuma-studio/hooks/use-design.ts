"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { calculateCost } from "../services/costing";
import { buildCutList, sheetCountsOf } from "../services/cutlist";
import { buildParts } from "../services/geometry";
import {
  canRewind,
  remember,
  rewind,
  type Step,
} from "../services/history";
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
  /** Puts back the design as it was before the last edit. */
  undo: () => void;
  /** Whether there is anything to go back to, for the button's disabled state. */
  canUndo: boolean;
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

/**
 * @param initial A design to open holding, evaluated once on the first render.
 *   Used when the studio is opened from a furniture calculator with a kind and
 *   a width in the URL. Passed as a thunk and given to `useState` lazily, so
 *   the starting design is built once and is present on the very first paint —
 *   rather than being pushed in from an effect, which would render the picker
 *   for a frame and then replace it.
 */
export function useDesign(
  rates: MarketRate[],
  initial?: () => DesignSpec | null,
): DesignController {
  const [held, setHeld] = useState<Held>(() => {
    const spec = initial?.() ?? null;
    return spec ? { spec, issues: [] } : EMPTY;
  });

  /**
   * What to go back to.
   *
   * A ref rather than state, and that is deliberate. Every writer here is
   * inside a `setHeld` updater, which React is entitled to call twice — and a
   * `setPast` from inside one would either be dropped or applied twice. The
   * ref is written once per committed state change, and the only thing render
   * needs from it is whether it is empty, which is held separately.
   */
  const past = useRef<Step<Held>[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  /**
   * Records the state being replaced, unless this edit continues the last one.
   *
   * Called from each writer just before it hands React the new state. It reads
   * the state it is replacing from its own argument rather than from `held`,
   * because inside an updater `held` is the render's copy and may already be
   * one edit behind.
   */
  const record = useCallback((replacing: Held) => {
    if (!replacing.spec) return;
    past.current = remember(past.current, replacing, Date.now());
    setCanUndo(canRewind(past.current));
  }, []);

  const undo = useCallback(() => {
    const step = rewind(past.current);
    if (!step) return;
    past.current = step.past;
    setCanUndo(canRewind(past.current));
    // Not revalidated. This state was produced by the validator on its way in,
    // so running it through again would be a second pass over an already
    // repaired design — and the second pass appends its corrections to the
    // first pass's, which is how undoing five times fills the panel with the
    // same warning five times.
    setHeld(step.state);
  }, []);

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
        manufacturable: cutList.buildable,
      }),
    };
  }, [held.spec, rates]);

  const replace = useCallback((spec: DesignSpec, issues: SpecIssue[]) => {
    // A chat response is untrusted input just as a slider draft is. Running it
    // through the shared validator closes the only client-side path that could
    // otherwise draw and price a schema-shaped but unmanufacturable design.
    const draft = structuredClone(spec);
    draft.meta.corrections = [];
    const result = validateSpec(draft);
    setHeld((previous) => {
      record(previous);
      return { spec: result.spec, issues: [...issues, ...result.issues] };
    });
  }, [record]);

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
      record(previous);
      return { spec: result.spec, issues: result.issues };
    });
  }, [record]);

  const set = useCallback(
    (spec: DesignSpec) => {
      const draft = structuredClone(spec);
      draft.meta.corrections = [];
      const result = validateSpec(draft);
      setHeld((previous) => {
        record(previous);
        return { spec: result.spec, issues: result.issues };
      });
    },
    [record],
  );

  const clear = useCallback(() => {
    past.current = [];
    setCanUndo(false);
    setHeld(EMPTY);
  }, []);

  return {
    spec: held.spec,
    issues: held.issues,
    ...derived,
    replace,
    edit,
    set,
    clear,
    undo,
    canUndo,
  };
}
