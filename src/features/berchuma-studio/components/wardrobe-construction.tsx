"use client";

import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { LengthInput } from "./ui/length-field";
import { CABINET_DECORS, sheetVariants, withMaterial } from "../services/cabinet-templates";
import { MIN_HEIGHT_MODULE, PREFERRED_LOWER, moduleFit, planHeights, type HeightMode, type HeightPlan, type MisfitPart } from "../services/height-modules";
import { startingDesign } from "../services/starting-designs";
import { MAX_MODULE, MIN_MODULE, defaultJoints } from "../services/transport-modules";
import type { Board, DesignSpec } from "../types/spec";

/**
 * How a wardrobe is built, decided with its size: the board and the sheet it
 * comes in, the width modules, and the height modules.
 *
 * Asked on the first page rather than discovered in the editor, because the
 * material decides the construction: a 2700 mm wardrobe is one carcass in a
 * 1220 × 2750 sheet and two in a 1220 × 2440 one. The decision is shown
 * before anything is generated, with what to change if it is not wanted.
 */

export type Construction = {
  boardId: string;
  heightMode: HeightMode;
  /** The lower module's height when divided. */
  lowerHeight: number;
  /** Width module boundaries chosen by hand, or null for the 1600 mm rule. */
  joints: number[] | null;
};

export const DEFAULT_CONSTRUCTION: Construction = { boardId: "mdf-18-white", heightMode: "auto", lowerHeight: PREFERRED_LOWER, joints: null };

export type ConstructionPlan = {
  board: Board;
  plan: HeightPlan;
  /** Why one carcass cannot be the whole height, when it cannot. */
  single: MisfitPart | null;
  widths: number[];
  widthProblems: string[];
  /** The same decor in a sheet long enough for one carcass, if one is stocked. */
  longer: Board | null;
};

/** The construction worked out for a size: what the material allows and what was chosen. */
export function useConstructionPlan(space: { width: number; height: number; depth: number }, construction: Construction, enabled = true): ConstructionPlan | null {
  const { boardId, heightMode, lowerHeight, joints } = construction;
  const jointKey = joints?.join(",") ?? "";
  return useMemo(() => {
    if (!enabled) return null;
    const probeFor = (id: string): DesignSpec => {
      const probe = structuredClone(withMaterial(startingDesign("wardrobe", { width: space.width }), id));
      probe.cabinets[0]!.size.depth = Math.min(space.depth, 900);
      return probe;
    };
    const probe = probeFor(boardId);
    const id = probe.cabinets[0]!.id;
    const plan = planHeights(probe, id, space.height, heightMode, lowerHeight);
    const single = plan.singleFits ? null : moduleFit(probe, id, space.height).misfit;
    const longer = plan.singleFits ? null : sheetVariants(boardId).find((board) => board.sheet.length > probe.carcass.board.sheet.length && planHeights(probeFor(board.id), id, space.height).singleFits) ?? null;
    const chosen = jointKey ? jointKey.split(",").map(Number) : defaultJoints(space.width);
    const edges = [0, ...chosen, space.width];
    const widths = edges.slice(1).map((edge, index) => edge - edges[index]!);
    const widthProblems = widths.some((width) => width < MIN_MODULE) ? [`A width module needs at least ${MIN_MODULE} mm.`] : [];
    return { board: probe.carcass.board, plan, single, widths, widthProblems, longer };
  }, [enabled, space.width, space.height, space.depth, boardId, heightMode, lowerHeight, jointKey]);
}

/** The board and the sheet it comes in. */
export function MaterialPicker({ boardId, onChange }: { boardId: string; onChange: (boardId: string) => void }) {
  const decor = boardId.replace(/-\d{4}$/, "");
  const sheets = sheetVariants(boardId);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 @lg/ws:grid-cols-3" role="radiogroup" aria-label="Material">
        {CABINET_DECORS.map((board) => (
          <button
            key={board.id}
            type="button"
            role="radio"
            aria-checked={decor === board.id}
            onClick={() => onChange(board.id)}
            className={cn("flex items-center gap-2 rounded-lg border p-2 text-left text-xs transition-colors", decor === board.id ? "border-brand bg-brand/5" : "hover:border-brand/50")}
          >
            <span className="size-6 shrink-0 rounded border" style={{ background: board.appearance?.hex ?? "#ddd" }} aria-hidden />
            <span className="leading-snug">{board.label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Sheet size">
        <span className="text-[11px] text-muted-foreground">Sheet</span>
        {sheets.map((board) => (
          <button
            key={board.id}
            type="button"
            role="radio"
            aria-checked={board.id === boardId}
            onClick={() => onChange(board.id)}
            className={cn("rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors", board.id === boardId ? "border-brand bg-brand text-brand-foreground" : "hover:border-brand")}
          >
            {board.sheet.width} × {board.sheet.length} mm
          </button>
        ))}
      </div>
    </div>
  );
}

/** Width and height modules: Auto, or chosen, with the decision and what to change. */
export function ModulePartition({
  space,
  construction,
  plan,
  customizing,
  onCustomize,
  onChange,
}: {
  space: { width: number; height: number };
  construction: Construction;
  plan: ConstructionPlan;
  customizing: boolean;
  onCustomize: (open: boolean) => void;
  onChange: (next: Construction) => void;
}) {
  const set = (patch: Partial<Construction>) => onChange({ ...construction, ...patch });
  const heights = plan.plan.modules;
  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label="Module partition">
      <span className="text-xs font-medium">Module partition</span>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Width</span>
        <span className="tabular-nums" data-width-modules>{construction.joints ? "Custom" : "Auto"} — {plan.widths.map(Math.round).join(" + ")}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Height</span>
        <span className="tabular-nums" data-height-modules>{heights.length === 1 ? `Single ${Math.round(heights[0]!)} mm` : heights.map(Math.round).join(" + ")}</span>
      </div>

      <div className="flex gap-1" role="group" aria-label="Height construction">
        {(["single", "partitioned", "auto"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={construction.heightMode === mode}
            onClick={() => set({ heightMode: mode })}
            className={cn("flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors", construction.heightMode === mode ? "border-brand bg-brand/5 text-foreground" : "text-muted-foreground hover:border-brand")}
          >
            {mode === "single" ? "Single Module" : mode === "partitioned" ? "Partitioned Modules" : "Auto"}
          </button>
        ))}
      </div>
      {construction.heightMode === "partitioned" ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span>First module height</span>
          <span className="flex items-center gap-1">
            <LengthInput label="First module height" value={construction.lowerHeight} min={MIN_HEIGHT_MODULE} max={2700} step={50} onChange={(lowerHeight) => set({ lowerHeight })} />
            <span className="text-[11px] text-muted-foreground">mm · upper {Math.round(space.height - construction.lowerHeight)} mm</span>
          </span>
        </div>
      ) : null}

      <ConstructionDecision space={space} construction={construction} plan={plan} onChange={onChange} onCustomize={() => onCustomize(true)} />

      <button type="button" aria-expanded={customizing} onClick={() => onCustomize(!customizing)} className="rounded-md border px-2.5 py-1.5 text-xs hover:border-brand">
        Customize Modules
      </button>
      {customizing ? <ModuleEditor space={space} construction={construction} plan={plan} onChange={onChange} /> : null}
    </section>
  );
}

/** What the material allows, said before anything is made, with what to change. */
export function ConstructionDecision({ space, construction, plan, onChange, onCustomize }: { space: { width: number; height: number }; construction: Construction; plan: ConstructionPlan; onChange: (next: Construction) => void; onCustomize: () => void }) {
  const { plan: heights, single, longer, board } = plan;
  const recommended = heights.recommended;
  const problems = [...heights.problems, ...plan.widthProblems];
  return (
    <div className="space-y-1.5 rounded-md bg-muted/40 p-2 text-[11px]" data-construction-decision>
      <p className="text-muted-foreground">
        Sheet: {board.sheet.width} × {board.sheet.length} mm
      </p>
      {single ? (
        <p className="flex gap-1.5 text-amber-700 dark:text-amber-400" role="status">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          A {Math.round(space.height)} mm wardrobe in one carcass needs a {single.length} mm {single.label}; the selected board is {single.board.sheet.length} mm.
        </p>
      ) : (
        <p className="flex gap-1.5 text-emerald-700 dark:text-emerald-400" role="status">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Single {Math.round(space.height)} mm module possible in this board.
        </p>
      )}
      {problems.map((problem) => (
        <p key={problem} role="alert" className="text-destructive">{problem}</p>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">Recommended:</span>
        <button
          type="button"
          aria-pressed={heights.modules.join() === recommended.join()}
          onClick={() => onChange({ ...construction, heightMode: "auto", lowerHeight: recommended.length === 2 ? recommended[0]! : construction.lowerHeight })}
          className="rounded-full border border-brand px-2 py-0.5 tabular-nums hover:bg-brand/10"
        >
          {recommended.length === 1 ? `Single ${Math.round(recommended[0]!)}` : recommended.map(Math.round).join(" + ")}
        </button>
        <button type="button" onClick={onCustomize} className="rounded-full border px-2 py-0.5 hover:border-brand">Change Partition</button>
        {longer ? (
          <button type="button" onClick={() => onChange({ ...construction, boardId: longer.id, heightMode: "auto" })} className="rounded-full border px-2 py-0.5 hover:border-brand">
            Change Material: {longer.sheet.width} × {longer.sheet.length} sheet, one module
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Width modules side by side and height modules one above the other, each typed. */
function ModuleEditor({ space, construction, plan, onChange }: { space: { width: number; height: number }; construction: Construction; plan: ConstructionPlan; onChange: (next: Construction) => void }) {
  const widths = plan.widths;
  const setWidths = (next: number[]) => {
    let at = 0;
    onChange({ ...construction, joints: next.slice(0, -1).map((width) => (at += width)) });
  };
  const lower = plan.plan.modules.length === 2 ? plan.plan.modules[0]! : construction.lowerHeight;
  return (
    <div className="space-y-2 rounded-md border p-2" aria-label="Customize modules" role="group">
      <span className="text-[11px] font-medium">Width modules</span>
      <div className="flex flex-wrap items-center gap-1">
        {widths.map((width, index) =>
          index < widths.length - 1 ? (
            <LengthInput
              key={index}
              label={`Width module ${index + 1}`}
              value={width}
              min={MIN_MODULE}
              max={space.width - MIN_MODULE}
              step={50}
              onChange={(value) => {
                const next = [...widths];
                const change = value - next[index]!;
                next[index] = value;
                next[widths.length - 1] = next[widths.length - 1]! - change;
                setWidths(next);
              }}
            />
          ) : (
            <span key={index} className="rounded-md border border-dashed px-2 py-1 text-xs tabular-nums" aria-label={`Width module ${index + 1}: ${Math.round(width)} mm, the rest`}>{Math.round(width)}</span>
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="rounded-md border px-2 py-1 text-[11px] hover:border-brand" onClick={() => { const last = widths.at(-1)!; setWidths([...widths.slice(0, -1), Math.round(last / 2), last - Math.round(last / 2)]); }}>Add width module</button>
        {widths.length > 1 ? <button type="button" className="rounded-md border px-2 py-1 text-[11px] hover:border-brand" onClick={() => setWidths([...widths.slice(0, -2), widths.at(-2)! + widths.at(-1)!])}>Remove last</button> : null}
        {construction.joints ? <button type="button" className="rounded-md border px-2 py-1 text-[11px] hover:border-brand" onClick={() => onChange({ ...construction, joints: null })}>Width: {MAX_MODULE} mm rule</button> : null}
      </div>
      <span className="block text-[11px] font-medium">Height modules</span>
      <div className="flex items-center gap-1 text-xs">
        <LengthInput label="Lower module height" value={lower} min={MIN_HEIGHT_MODULE} max={2700} step={50} onChange={(value) => onChange({ ...construction, heightMode: "partitioned", lowerHeight: value })} />
        <span className="text-muted-foreground">lower · upper {Math.round(space.height - lower)} mm</span>
      </div>
    </div>
  );
}
